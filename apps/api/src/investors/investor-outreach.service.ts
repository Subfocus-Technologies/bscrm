import { type Db, InvestorEmailStatus, type Prisma } from "@crm/db";
import { workspaceDayStart } from "@crm/db/day";
import { INVESTORS } from "@crm/validation/investors";
import {
	BadRequestException,
	ConflictException,
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
	Outreach,
	OutreachEmail,
	SendInvestorEmailInput,
} from "./investors.contracts";

const EMAIL_SELECT = {
	id: true,
	investorId: true,
	step: true,
	subject: true,
	body: true,
	status: true,
	sentAt: true,
	repliedAt: true,
	sender: { select: { name: true } },
	investor: { select: { name: true, firm: true, email: true } },
} as const;

type EmailRow = Prisma.InvestorEmailGetPayload<{ select: typeof EMAIL_SELECT }>;

function toEmail(row: EmailRow): OutreachEmail {
	return {
		id: row.id,
		investorId: row.investorId,
		investorName: row.investor.name,
		firm: row.investor.firm,
		toEmail: row.investor.email,
		step: row.step,
		subject: row.subject,
		body: row.body,
		status: row.status,
		sentAt: row.sentAt?.toISOString() ?? null,
		repliedAt: row.repliedAt?.toISOString() ?? null,
		senderName: row.sender?.name ?? null,
	};
}

@Injectable()
export class InvestorOutreachService {
	private readonly logger = new Logger(InvestorOutreachService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly gmail: GmailClient,
		private readonly tokens: MailboxTokenService,
	) {}

	async overview(actingUserId: string): Promise<Outreach> {
		const fundraise = await this.db.fundraise.findFirst({
			orderBy: { createdAt: "asc" },
			select: { id: true, dailySendLimit: true },
		});
		const inRaise = { investor: { fundraiseId: fundraise?.id ?? "" } };

		const [canSend, sentToday, drafts, sent] = await Promise.all([
			this.tokens.canSendGmail(actingUserId),
			this.sentToday(fundraise?.id ?? ""),
			this.db.investorEmail.findMany({
				where: { ...inRaise, status: InvestorEmailStatus.DRAFT },
				orderBy: [{ step: "asc" }, { createdAt: "asc" }],
				take: INVESTORS.outreach.listSize,
				select: EMAIL_SELECT,
			}),
			this.db.investorEmail.findMany({
				where: { ...inRaise, status: InvestorEmailStatus.SENT },
				orderBy: { sentAt: "desc" },
				take: INVESTORS.outreach.listSize,
				select: EMAIL_SELECT,
			}),
		]);

		return {
			canSend,
			sentToday,
			dailyLimit: fundraise?.dailySendLimit ?? 0,
			drafts: drafts.map(toEmail),
			sent: sent.map(toEmail),
		};
	}

	async send(
		input: SendInvestorEmailInput,
		actingUserId: string,
	): Promise<{ id: string; sentAt: string }> {
		const email = await this.db.investorEmail.findUnique({
			where: { id: input.id },
			include: {
				investor: {
					select: {
						id: true,
						email: true,
						stage: true,
						contactedAt: true,
						fundraise: { select: { id: true, dailySendLimit: true } },
					},
				},
			},
		});
		if (!email) throw new NotFoundException(`No email with id ${input.id}.`);
		if (email.status !== InvestorEmailStatus.DRAFT) {
			throw new ConflictException("This email was already sent or set aside.");
		}

		const to = email.investor.email;
		if (!to) {
			throw new BadRequestException(
				"Add the investor's email address before sending.",
			);
		}

		const fundraise = email.investor.fundraise;
		if ((await this.sentToday(fundraise.id)) >= fundraise.dailySendLimit) {
			throw new BadRequestException(
				`Today's limit of ${fundraise.dailySendLimit} investor emails is reached. Send the rest tomorrow, or raise the limit on the Fundraise profile.`,
			);
		}

		const sender = await this.db.user.findUniqueOrThrow({
			where: { id: actingUserId },
			select: { name: true, email: true },
		});
		const token = await this.tokens.gmailSendToken(actingUserId);
		if (token.outcome !== "ok") {
			throw new BadRequestException(
				"Allow sending from Gmail on the Outreach tab first.",
			);
		}

		const earlier = await this.db.investorEmail.findMany({
			where: {
				investorId: email.investorId,
				status: InvestorEmailStatus.SENT,
			},
			orderBy: { step: "asc" },
			select: { gmailThreadId: true, rfcMessageId: true },
		});
		const references = earlier.flatMap((row) =>
			row.rfcMessageId ? [row.rfcMessageId] : [],
		);
		const body = signedBody(input.body, sender.name);

		const sent = await this.gmail.sendMessage(token.accessToken, {
			raw: composeRawEmail({
				from: { name: sender.name, email: sender.email },
				to,
				subject: input.subject,
				body,
				inReplyTo: references.at(-1) ?? null,
				references,
			}),
			threadId: earlier[0]?.gmailThreadId ?? null,
		});
		if (sent.outcome !== "ok" || !sent.data.id) {
			this.logger.warn({
				message: "Investor email failed to send",
				emailId: email.id,
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

		await this.db.$transaction([
			this.db.investorEmail.update({
				where: { id: email.id },
				data: {
					status: InvestorEmailStatus.SENT,
					subject: input.subject,
					body,
					toEmail: to,
					senderUserId: actingUserId,
					gmailMessageId: sent.data.id,
					gmailThreadId: sent.data.threadId ?? null,
					rfcMessageId,
					sentAt,
				},
			}),
			this.db.investor.update({
				where: { id: email.investorId },
				data:
					email.investor.stage === "APPROVED"
						? {
								contactedAt: email.investor.contactedAt ?? sentAt,
								stage: "CONTACTED",
								stageChangedAt: sentAt,
								stageChangedById: actingUserId,
							}
						: { contactedAt: email.investor.contactedAt ?? sentAt },
			}),
		]);

		this.logger.log({
			message: "Investor email sent",
			emailId: email.id,
			investorId: email.investorId,
			step: email.step,
			userId: actingUserId,
		});

		return { id: email.id, sentAt: sentAt.toISOString() };
	}

	async skip(id: string, actingUserId: string): Promise<{ id: string }> {
		const { count } = await this.db.investorEmail.updateMany({
			where: { id, status: InvestorEmailStatus.DRAFT },
			data: { status: InvestorEmailStatus.SKIPPED },
		});
		if (count === 0) {
			throw new ConflictException("This email was already sent or set aside.");
		}

		this.logger.log({
			message: "Investor email skipped",
			emailId: id,
			userId: actingUserId,
		});
		return { id };
	}

	async redraft(id: string, actingUserId: string): Promise<{ queued: number }> {
		const email = await this.db.investorEmail.findUnique({
			where: { id },
			select: {
				status: true,
				investorId: true,
				investor: { select: { fundraiseId: true } },
			},
		});
		if (!email) throw new NotFoundException(`No email with id ${id}.`);
		if (email.status !== InvestorEmailStatus.DRAFT) {
			throw new ConflictException("Only a draft can be written again.");
		}

		await this.db.investorEmail.update({
			where: { id },
			data: { status: InvestorEmailStatus.CANCELLED },
		});
		const queued = await this.agent.investorOutreachRequested(
			email.investor.fundraiseId,
			[email.investorId],
			"A person asked for this email to be written again",
		);

		this.logger.log({
			message: "Investor email redraft requested",
			emailId: id,
			userId: actingUserId,
		});
		return { queued };
	}

	async setAddress(
		input: { investorId: string; email: string },
		actingUserId: string,
	): Promise<{ queued: number }> {
		const investor = await this.db.investor.update({
			where: { id: input.investorId },
			data: { email: input.email },
			select: { id: true, fundraiseId: true, stage: true },
		});

		this.logger.log({
			message: "Investor email address set",
			investorId: investor.id,
			userId: actingUserId,
		});

		return {
			queued:
				investor.stage === "APPROVED"
					? await this.queueFirstDrafts(investor.fundraiseId, [investor.id])
					: 0,
		};
	}

	async queueFirstDrafts(
		fundraiseId: string,
		investorIds: readonly string[],
	): Promise<number> {
		if (investorIds.length === 0) return 0;

		const ready = await this.db.investor.findMany({
			where: {
				id: { in: [...investorIds] },
				stage: "APPROVED",
				email: { not: null },
				emails: { none: {} },
			},
			select: { id: true },
		});

		return this.agent.investorOutreachRequested(
			fundraiseId,
			ready.map((investor) => investor.id),
			"Write a first email to an approved investor",
		);
	}

	private async sentToday(fundraiseId: string): Promise<number> {
		return this.db.investorEmail.count({
			where: {
				status: InvestorEmailStatus.SENT,
				sentAt: { gte: workspaceDayStart() },
				investor: { fundraiseId },
			},
		});
	}
}
