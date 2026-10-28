import { type Db, EmailReplyStatus, TodoSuggestionStatus } from "@crm/db";
import { replySubject } from "@crm/validation/todos";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import { GmailClient } from "../google/gmail.client";
import { composeRawEmail, signedBody } from "../google/gmail-compose";
import { header } from "../google/gmail-mime";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import type {
	RequestReplyInput,
	SendReplyInput,
	ThreadReplyOutput,
} from "./todos.contracts";

const MAX_REFERENCES = 20;

@Injectable()
export class EmailReplyService {
	private readonly logger = new Logger(EmailReplyService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly gmail: GmailClient,
		private readonly tokens: MailboxTokenService,
	) {}

	async reply(
		emailThreadId: string,
		actingUserId: string,
	): Promise<ThreadReplyOutput> {
		const thread = await this.requireThread(emailThreadId);
		const [draft, drafting, canSend] = await Promise.all([
			this.db.emailReply.findFirst({
				where: {
					emailThreadId,
					userId: actingUserId,
					status: EmailReplyStatus.DRAFT,
				},
				orderBy: { updatedAt: "desc" },
				select: { id: true, subject: true, body: true, updatedAt: true },
			}),
			this.db.agentTask.count({
				where: {
					kind: "email-actions",
					subject: emailThreadId,
					finishedAt: null,
					payload: { path: ["replyRequested"], equals: true },
				},
			}),
			this.tokens.canSendGmail(actingUserId),
		]);

		return {
			emailThreadId,
			toEmail: thread.lastInbound?.fromEmail ?? null,
			subject: draft?.subject ?? replySubject(thread.subject),
			draft: draft
				? {
						id: draft.id,
						body: draft.body,
						updatedAt: draft.updatedAt.toISOString(),
					}
				: null,
			drafting: drafting > 0,
			canSend,
		};
	}

	async requestReply(
		input: RequestReplyInput,
		actingUserId: string,
	): Promise<{ queued: boolean }> {
		const thread = await this.requireThread(input.emailThreadId);
		if (!thread.lastInbound) {
			throw new BadRequestException(
				"There is no message from them to answer in this conversation.",
			);
		}

		await this.agent.emailReplyRequested({
			emailThreadId: thread.id,
			userId: actingUserId,
			contactId: thread.contactId,
			companyId: thread.companyId,
			instructions: input.instructions || null,
		});

		this.logger.log({
			message: "Reply draft requested",
			emailThreadId: thread.id,
			userId: actingUserId,
		});
		return { queued: true };
	}

	async send(input: SendReplyInput, actingUserId: string) {
		const thread = await this.requireThread(input.emailThreadId);
		const to = thread.lastInbound?.fromEmail;
		if (!to) {
			throw new BadRequestException(
				"There is no message from them to answer in this conversation.",
			);
		}

		const token = await this.tokens.gmailSendToken(actingUserId);
		if (token.outcome !== "ok") {
			throw new BadRequestException("Allow sending from your Gmail first.");
		}

		const sender = await this.db.user.findUniqueOrThrow({
			where: { id: actingUserId },
			select: { name: true, email: true },
		});
		const references = thread.messages
			.map((message) => message.rfcMessageId)
			.slice(-MAX_REFERENCES);
		const body = signedBody(input.body, sender.name);

		const sent = await this.gmail.sendMessage(token.accessToken, {
			raw: composeRawEmail({
				from: { name: sender.name, email: sender.email },
				to,
				subject: input.subject,
				body,
				inReplyTo: thread.lastInbound?.rfcMessageId ?? null,
				references,
			}),
			threadId: await this.gmailThreadId(
				token.accessToken,
				thread.lastInbound,
				actingUserId,
			),
		});
		if (sent.outcome !== "ok" || !sent.data.id) {
			this.logger.warn({
				message: "Reply failed to send",
				emailThreadId: thread.id,
				outcome: sent.outcome,
				reason: "reason" in sent ? sent.reason : null,
				userId: actingUserId,
			});
			throw new BadRequestException(
				`Gmail did not send it: ${"reason" in sent ? sent.reason : "no message id came back"}.`,
			);
		}

		const stored = await this.gmail.getMessage(token.accessToken, sent.data.id);
		const rfcMessageId =
			stored.outcome === "ok"
				? header(stored.data.payload?.headers, "message-id")
				: null;
		const sentAt = new Date();
		const record = {
			toEmail: to,
			subject: input.subject,
			body,
			status: EmailReplyStatus.SENT,
			gmailMessageId: sent.data.id,
			rfcMessageId,
			sentAt,
		};

		const reply = await this.db.$transaction(async (tx) => {
			const draft = await tx.emailReply.findFirst({
				where: {
					emailThreadId: thread.id,
					userId: actingUserId,
					status: EmailReplyStatus.DRAFT,
				},
				select: { id: true },
			});
			const saved = draft
				? await tx.emailReply.update({
						where: { id: draft.id },
						data: record,
						select: { id: true },
					})
				: await tx.emailReply.create({
						data: {
							...record,
							emailThreadId: thread.id,
							userId: actingUserId,
						},
						select: { id: true },
					});

			await tx.todoSuggestion.updateMany({
				where: {
					emailThreadId: thread.id,
					userId: actingUserId,
					kind: "REPLY",
					status: TodoSuggestionStatus.PROPOSED,
				},
				data: { status: TodoSuggestionStatus.DONE, decidedAt: sentAt },
			});

			return saved;
		});

		this.logger.log({
			message: "Reply sent",
			emailThreadId: thread.id,
			replyId: reply.id,
			userId: actingUserId,
		});
		return { id: reply.id, sentAt: sentAt.toISOString(), toEmail: to };
	}

	async discard(
		emailThreadId: string,
		actingUserId: string,
	): Promise<{ discarded: number }> {
		const { count } = await this.db.emailReply.updateMany({
			where: {
				emailThreadId,
				userId: actingUserId,
				status: EmailReplyStatus.DRAFT,
			},
			data: { status: EmailReplyStatus.DISCARDED },
		});

		this.logger.log({
			message: "Reply draft discarded",
			emailThreadId,
			userId: actingUserId,
		});
		return { discarded: count };
	}

	private async gmailThreadId(
		accessToken: string,
		message: {
			gmailMessageId: string | null;
			syncedByUserId: string | null;
		} | null,
		actingUserId: string,
	): Promise<string | null> {
		if (!message?.gmailMessageId || message.syncedByUserId !== actingUserId) {
			return null;
		}

		const found = await this.gmail.getMessage(
			accessToken,
			message.gmailMessageId,
		);
		return found.outcome === "ok" ? (found.data.threadId ?? null) : null;
	}

	private async requireThread(emailThreadId: string) {
		const thread = await this.db.emailThread.findUnique({
			where: { id: emailThreadId },
			select: {
				id: true,
				subject: true,
				contactId: true,
				companyId: true,
				messages: {
					orderBy: { sentAt: "asc" },
					select: {
						rfcMessageId: true,
						direction: true,
						fromEmail: true,
						gmailMessageId: true,
						syncedByUserId: true,
					},
				},
			},
		});
		if (!thread) {
			throw new NotFoundException(
				`No email conversation with id ${emailThreadId}.`,
			);
		}

		const lastInbound =
			[...thread.messages]
				.reverse()
				.find((message) => message.direction === "INBOUND") ?? null;

		return { ...thread, lastInbound };
	}
}
