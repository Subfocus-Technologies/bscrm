import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import type { GmailClient } from "../src/google/gmail.client";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import { EmailReplyService } from "../src/todos/email-reply.service";
import { TodosService } from "../src/todos/todos.service";

const suffix = process.env.TEST_RUN_ID ?? "todos-spec";
const userId = `todos-owner-${suffix}`;
const otherId = `todos-other-${suffix}`;
const clientEmail = `client.${suffix}@example.test`;
const rootId = `<todos-api-${suffix}@mail.test>`;

const sentRaw: { raw: string; threadId: string | null }[] = [];
let canSend = true;
const gmail = {
	sendMessage: async (
		_token: string,
		input: { raw: string; threadId: string | null },
	) => {
		sentRaw.push(input);
		return {
			outcome: "ok" as const,
			data: { id: `gmail-${sentRaw.length}`, threadId: "gmail-thread" },
		};
	},
	getMessage: async (_token: string, id: string) => ({
		outcome: "ok" as const,
		data: {
			id,
			threadId: "gmail-thread",
			payload: { headers: [{ name: "Message-ID", value: `<${id}@mail>` }] },
		},
	}),
} as unknown as GmailClient;
const tokens = {
	canSendGmail: async () => canSend,
	gmailSendToken: async () =>
		canSend
			? { outcome: "ok" as const, accessToken: "token" }
			: { outcome: "not-connected" as const, reason: "no" },
} as unknown as MailboxTokenService;

const agent = new AgentTriggerService(db);
const todos = new TodosService(db);
const replies = new EmailReplyService(db, agent, gmail, tokens);

let contactId = "";
let emailThreadId = "";

async function clean() {
	await db.agentTask.deleteMany({
		where: { kind: "email-actions", subject: emailThreadId || "none" },
	});
	await db.activity.deleteMany({
		where: { createdById: { in: [userId, otherId] } },
	});
	await db.emailThread.deleteMany({ where: { rootMessageId: rootId } });
	await db.contact.deleteMany({ where: { email: clientEmail } });
}

async function suggest(kind: "REPLY" | "TODO", title: string, owner = userId) {
	const row = await db.todoSuggestion.create({
		data: {
			userId: owner,
			kind,
			title,
			quote: "could you send the pricing?",
			position: 0,
			emailThreadId,
			contactId,
		},
		select: { id: true },
	});
	return row.id;
}

beforeEach(async () => {
	await clean();
	sentRaw.length = 0;
	canSend = true;
	for (const id of [userId, otherId]) {
		await db.user.upsert({
			where: { id },
			create: { id, name: `Rep ${id}`, email: `${id}@example.test` },
			update: {},
		});
	}
	const contact = await db.contact.create({
		data: { firstName: "Priya", email: clientEmail },
		select: { id: true },
	});
	contactId = contact.id;
	const sentAt = new Date("2026-10-20T09:00:00Z");
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: rootId,
			subject: "Pricing",
			contactId,
			firstMessageAt: sentAt,
			lastMessageAt: sentAt,
			messages: {
				create: {
					rfcMessageId: `<first-${suffix}@mail.test>`,
					direction: "INBOUND",
					fromEmail: clientEmail,
					recipients: [],
					body: "Hi, could you send the pricing?",
					sentAt,
					gmailMessageId: "gmail-in-1",
					syncedByUserId: userId,
				},
			},
		},
		select: { id: true },
	});
	emailThreadId = thread.id;
});

afterAll(async () => {
	await clean();
	await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
});

describe("to-do suggestions", () => {
	it("shows each person only the suggestions from their own mailbox", async () => {
		await suggest("TODO", "Send Priya the pricing");
		await suggest("TODO", "Someone else's", otherId);

		const mine = await todos.suggestions({ view: "PROPOSED", page: 1 }, userId);

		expect(mine.items.map((item) => item.title)).toEqual([
			"Send Priya the pricing",
		]);
		expect(mine.counts.PROPOSED).toBe(1);
		expect(mine.items[0]?.record).toEqual({
			kind: "contact",
			id: contactId,
			name: "Priya",
		});
	});

	it("adds a suggestion as a task once, and refuses a second click", async () => {
		const id = await suggest("TODO", "Send Priya the pricing");

		const accepted = await todos.accept(id, userId);
		const task = await db.activity.findUniqueOrThrow({
			where: { id: accepted.taskId },
			select: { type: true, subject: true, contactId: true, createdById: true },
		});

		expect(task).toEqual({
			type: "TASK",
			subject: "Send Priya the pricing",
			contactId,
			createdById: userId,
		});
		expect(todos.accept(id, userId)).rejects.toThrow("already decided");
	});

	it("refuses to decide someone else's suggestion", async () => {
		const id = await suggest("TODO", "Not mine", otherId);

		expect(todos.ignore(id, userId)).rejects.toThrow("No suggestion");
	});

	it("ignores a suggestion and puts it back", async () => {
		const id = await suggest("TODO", "Send Priya the pricing");

		await todos.ignore(id, userId);
		const ignored = await todos.suggestions(
			{ view: "IGNORED", page: 1 },
			userId,
		);
		await todos.restore(id, userId);
		const back = await todos.suggestions({ view: "PROPOSED", page: 1 }, userId);

		expect(ignored.total).toBe(1);
		expect(back.total).toBe(1);
	});
});

describe("email replies", () => {
	it("sends the reply in the conversation and closes the reply suggestion", async () => {
		const id = await suggest("REPLY", "Answer Priya");
		await db.emailReply.create({
			data: {
				emailThreadId,
				userId,
				toEmail: clientEmail,
				subject: "Re: Pricing",
				body: "Draft",
			},
		});

		const sent = await replies.send(
			{ emailThreadId, subject: "Re: Pricing", body: "Here it is." },
			userId,
		);

		expect(sent.toEmail).toBe(clientEmail);
		expect(sentRaw[0]?.threadId).toBe("gmail-thread");
		const raw = Buffer.from(sentRaw[0]?.raw ?? "", "base64url").toString();
		expect(raw).toContain(`In-Reply-To: <first-${suffix}@mail.test>`);
		expect(raw).toContain(`To: ${clientEmail}`);
		const stored = await db.emailReply.findMany({
			where: { emailThreadId },
			select: { status: true, body: true },
		});
		expect(stored).toEqual([
			{ status: "SENT", body: `Here it is.\n\nRep ${userId}` },
		]);
		const suggestion = await db.todoSuggestion.findUniqueOrThrow({
			where: { id },
			select: { status: true },
		});
		expect(suggestion.status).toBe("DONE");
	});

	it("refuses to send before Gmail sending is allowed", async () => {
		canSend = false;

		expect(
			replies.send(
				{ emailThreadId, subject: "Re: Pricing", body: "Here it is." },
				userId,
			),
		).rejects.toThrow("Allow sending");
		expect(sentRaw).toHaveLength(0);
	});

	it("queues one reply draft and shows that it is being written", async () => {
		await replies.requestReply(
			{ emailThreadId, instructions: "Say yes" },
			userId,
		);
		await replies.requestReply({ emailThreadId }, userId);

		const tasks = await db.agentTask.findMany({
			where: { kind: "email-actions", subject: emailThreadId },
			select: { payload: true },
		});
		const view = await replies.reply(emailThreadId, userId);

		expect(tasks).toHaveLength(1);
		expect(view.drafting).toBe(true);
		expect(view.toEmail).toBe(clientEmail);
		expect(view.subject).toBe("Re: Pricing");
	});
});
