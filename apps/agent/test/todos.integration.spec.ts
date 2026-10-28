import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	preflightEmailActions,
	preflightNoteActions,
	proposeTodos,
	queueEndedMeetings,
	queueUnreadEmails,
	queueUnreadNotes,
} from "../agent/lib/todos";

const suffix = process.env.TEST_RUN_ID ?? "todos-spec";
const email = `client.${suffix}@example.test`;
const userId = `todos-user-${suffix}`;
const rootId = `<todos-${suffix}@mail.test>`;
const iCalUid = `todos-${suffix}@calendar.test`;
const noteMessageId = `todos-note-${suffix}`;

let contactId = "";
let emailThreadId = "";

const sentAt = new Date("2026-10-20T09:00:00Z");

async function clean() {
	await db.agentTask.deleteMany({
		where: {
			kind: { in: ["meeting-actions", "email-actions", "note-actions"] },
			OR: [
				{ contactId },
				{ subject: emailThreadId },
				{ reason: { contains: "Gemini" } },
			],
		},
	});
	await db.incomingMeetingNote.deleteMany({
		where: { gmailMessageId: noteMessageId },
	});
	await db.calendarEvent.deleteMany({ where: { iCalUid } });
	await db.emailThread.deleteMany({ where: { rootMessageId: rootId } });
	await db.contact.deleteMany({ where: { email } });
}

async function addMessage(direction: "INBOUND" | "OUTBOUND", body: string) {
	const count = await db.emailMessage.count({
		where: { threadId: emailThreadId },
	});
	await db.emailMessage.create({
		data: {
			threadId: emailThreadId,
			rfcMessageId: `<todos-${suffix}-${count}@mail.test>`,
			direction,
			fromEmail: direction === "INBOUND" ? email : `rep.${suffix}@example.test`,
			fromName: direction === "INBOUND" ? "Priya Client" : "Rep",
			recipients: [],
			subject: "Pricing for the pilot",
			body,
			sentAt: new Date(sentAt.getTime() + count * 60_000),
		},
	});
}

beforeEach(async () => {
	await clean();
	await db.user.upsert({
		where: { id: userId },
		create: { id: userId, name: "Sayu Test", email: `${userId}@example.test` },
		update: {},
	});
	const contact = await db.contact.create({
		data: { firstName: "Priya", email },
		select: { id: true },
	});
	contactId = contact.id;
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: rootId,
			subject: "Pricing for the pilot",
			contactId,
			firstMessageAt: sentAt,
			lastMessageAt: sentAt,
		},
		select: { id: true },
	});
	emailThreadId = thread.id;
	await addMessage(
		"INBOUND",
		"Hi, could you send me your pricing for the pilot? Also, can we book a call next Tuesday?",
	);
});

afterAll(async () => {
	await clean();
	await db.user.deleteMany({ where: { id: userId } });
});

const source = () => ({ kind: "email" as const, emailThreadId, userId });

const reply = {
	kind: "REPLY",
	title: "Answer Priya about pilot pricing",
	detail: null,
	dueDate: null,
	quote: "could you send me your pricing for the pilot?",
};

const call = {
	kind: "TODO",
	title: "Book a call with Priya",
	detail: null,
	dueDate: "2026-10-27",
	quote: "can we book a call next Tuesday",
};

describe("proposeTodos for an email", () => {
	it("saves the suggestions and the reply draft to the person who wrote", async () => {
		const outcome = await proposeTodos(
			source(),
			[reply, call],
			"Thanks Priya, pricing is attached.",
		);

		expect(outcome).toEqual({ saved: 2, replyDrafted: true, dropped: [] });
		const saved = await db.todoSuggestion.findMany({
			where: { emailThreadId },
			orderBy: { position: "asc" },
			select: { kind: true, userId: true, contactId: true, dueAt: true },
		});
		expect(saved).toEqual([
			{ kind: "REPLY", userId, contactId, dueAt: null },
			{
				kind: "TODO",
				userId,
				contactId,
				dueAt: new Date("2026-10-27T09:00:00Z"),
			},
		]);
		const draft = await db.emailReply.findFirstOrThrow({
			where: { emailThreadId },
			select: { toEmail: true, subject: true, body: true, status: true },
		});
		expect(draft).toEqual({
			toEmail: email,
			subject: "Re: Pricing for the pilot",
			body: "Thanks Priya, pricing is attached.",
			status: "DRAFT",
		});
	});

	it("drops an item the emails do not say, and a reply with no text", async () => {
		const outcome = await proposeTodos(
			source(),
			[reply, { ...call, quote: "sign the contract today" }],
			null,
		);

		expect(outcome.saved).toBe(0);
		expect(outcome.dropped.map((item) => item.reason)).toEqual([
			"A REPLY item needs the reply text in `reply`.",
			"Its quote is not in the source, word for word.",
		]);
	});

	it("drops a reply that is too long", async () => {
		const outcome = await proposeTodos(source(), [reply], "word ".repeat(300));

		expect(outcome.replyDrafted).toBe(false);
		expect(outcome.dropped[0]?.reason).toContain("keep it to");
	});

	it("replaces waiting suggestions but never suggests a decided one again", async () => {
		await proposeTodos(source(), [call], null);
		await db.todoSuggestion.updateMany({
			where: { emailThreadId },
			data: { status: "IGNORED" },
		});

		const outcome = await proposeTodos(source(), [call], null);

		expect(outcome.saved).toBe(0);
		expect(outcome.dropped[0]?.reason).toBe(
			"A person already added, finished or ignored this one.",
		);
	});

	it("replaces the waiting draft instead of adding a second one", async () => {
		await proposeTodos(source(), [reply], "First answer.");
		await proposeTodos(source(), [reply], "Second answer.");

		const drafts = await db.emailReply.findMany({
			where: { emailThreadId },
			select: { body: true },
		});
		expect(drafts).toEqual([{ body: "Second answer." }]);
	});
});

describe("preflightEmailActions", () => {
	it("reads a conversation where we sent the last message, for what we promised", async () => {
		await addMessage(
			"OUTBOUND",
			"I'll send you something in the next couple of days.",
		);

		const outcome = await preflightEmailActions({ emailThreadId, userId });

		expect(outcome.kind).toBe("research");
	});

	it("still drafts a reply a person asked for", async () => {
		await addMessage("OUTBOUND", "Here you go.");

		const outcome = await preflightEmailActions({
			emailThreadId,
			userId,
			replyRequested: true,
		});

		expect(outcome.kind).toBe("research");
	});
});

describe("meetings", () => {
	it("queues each ended client meeting once and refuses a REPLY for it", async () => {
		const now = new Date();
		const event = await db.calendarEvent.create({
			data: {
				iCalUid,
				originalStartTime: new Date(now.getTime() - 3 * 3_600_000),
				title: "Bricksmart pilot review",
				startsAt: new Date(now.getTime() - 3 * 3_600_000),
				endsAt: new Date(now.getTime() - 2 * 3_600_000),
				status: "confirmed",
				contactId,
				syncedByUserId: userId,
			},
			select: { id: true },
		});

		expect(await queueEndedMeetings(now)).toBeGreaterThanOrEqual(1);
		expect(
			await db.agentTask.count({
				where: { kind: "meeting-actions", subject: event.id },
			}),
		).toBe(1);

		await queueEndedMeetings(now);
		expect(
			await db.agentTask.count({
				where: { kind: "meeting-actions", subject: event.id },
			}),
		).toBe(1);

		const outcome = await proposeTodos(
			{ kind: "meeting", calendarEventId: event.id, userId },
			[
				{ ...reply, quote: "Bricksmart pilot review" },
				{ ...call, dueDate: null, quote: "Bricksmart pilot review" },
			],
			"Thanks for today.",
		);
		expect(outcome.saved).toBe(1);
		expect(outcome.dropped[0]?.reason).toBe(
			"A REPLY item is only for an email conversation.",
		);
	});
});

describe("catching up on email", () => {
	it("reads each conversation once for each new message", async () => {
		const now = new Date();
		await db.emailMessage.updateMany({
			where: { threadId: emailThreadId },
			data: { syncedByUserId: userId },
		});
		await db.emailThread.update({
			where: { id: emailThreadId },
			data: { lastMessageAt: new Date(now.getTime() - 10 * 60_000) },
		});

		await queueUnreadEmails(now);
		await queueUnreadEmails(now);
		const tasks = await db.agentTask.findMany({
			where: { kind: "email-actions", subject: emailThreadId },
			select: { payload: true },
		});

		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.payload).toMatchObject({ emailThreadId, userId });

		await db.emailThread.update({
			where: { id: emailThreadId },
			data: { lastMessageAt: new Date(now.getTime() + 60_000) },
		});
		await queueUnreadEmails(new Date(now.getTime() + 10 * 60_000));
		expect(
			await db.agentTask.count({
				where: { kind: "email-actions", subject: emailThreadId },
			}),
		).toBe(2);
	});
});

describe("Gemini meeting notes", () => {
	it("reads every new note once and saves its action points", async () => {
		const note = await db.incomingMeetingNote.create({
			data: {
				gmailMessageId: noteMessageId,
				mailboxUserId: userId,
				source: "GEMINI",
				subject: "Notes: Marylebone search",
				title: "Marylebone search",
				body: "Action items\n- Sayu to send Pradeep office options in Marylebone by Friday.",
				heldAt: new Date(),
			},
			select: { id: true },
		});

		await queueUnreadNotes();
		await queueUnreadNotes();
		expect(
			await db.agentTask.count({
				where: { kind: "note-actions", subject: note.id },
			}),
		).toBe(1);

		const outcome = await proposeTodos(
			{ kind: "note", incomingMeetingNoteId: note.id, userId },
			[
				{
					...call,
					title: "Send Pradeep Marylebone office options",
					dueDate: null,
					quote: "Sayu to send Pradeep office options in Marylebone",
				},
			],
			null,
		);
		expect(outcome.saved).toBe(1);

		await db.incomingMeetingNote.update({
			where: { id: note.id },
			data: { status: "IGNORED" },
		});
		const preflight = await preflightNoteActions({
			incomingMeetingNoteId: note.id,
			userId,
		});
		expect(preflight.kind).toBe("done");
	});
});
