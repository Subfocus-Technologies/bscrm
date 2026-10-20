import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import {
	GeminiNotesCollector,
	geminiNotesQuery,
} from "../src/google/gemini-notes.collector";
import type { GmailClient, GmailMessage } from "../src/google/gmail.client";
import {
	geminiDocUrl,
	geminiNoteBody,
	geminiNoteTitle,
	titlesMatch,
} from "../src/meeting-notes/gemini-note";
import {
	IncomingNotesService,
	type ReceivedNote,
} from "../src/meeting-notes/incoming-notes.service";
import { MeetingNotesService } from "../src/meeting-notes/meeting-notes.service";

const suffix = process.env.TEST_RUN_ID ?? "incoming-notes-spec";
const domain = `inbox-${suffix}.test`;
const userId = `inbox-user-${suffix}`;
const otherUserId = `inbox-other-${suffix}`;
const HOUR_MS = 60 * 60 * 1000;

const read: string[] = [];
const agent = {
	meetingNotesImported: async (input: { activityId: string }) => {
		read.push(input.activityId);
	},
} as unknown as AgentTriggerService;

const notes = new MeetingNotesService(db, agent, new ActivityStampService(db));
const incoming = new IncomingNotesService(db, notes);

let contactId: string;
let companyId: string;
let sequence = 0;

function note(title: string, overrides: Partial<ReceivedNote> = {}) {
	sequence += 1;
	return {
		gmailMessageId: `gmail-${suffix}-${sequence}`,
		mailboxUserId: userId,
		subject: `Notes: “${title}” Oct 19, 2026`,
		title,
		body: "Lena agreed to a pilot. Send the pricing sheet by Friday.",
		docUrl: null,
		heldAt: new Date(),
		...overrides,
	} satisfies ReceivedNote;
}

async function meeting(title: string, withContact: boolean) {
	const startsAt = new Date(Date.now() - 2 * HOUR_MS);
	const event = await db.calendarEvent.create({
		data: {
			iCalUid: `${title}@${domain}`,
			originalStartTime: startsAt,
			startsAt,
			endsAt: new Date(startsAt.getTime() + HOUR_MS),
			status: "confirmed",
			title,
			contactId: withContact ? contactId : null,
			syncedByUserId: userId,
		},
		select: { id: true },
	});
	return event.id;
}

async function clean() {
	await db.incomingMeetingNote.deleteMany({
		where: { mailboxUserId: { in: [userId, otherUserId] } },
	});
	await db.activity.deleteMany({
		where: {
			OR: [
				{ contact: { email: { endsWith: `@${domain}` } } },
				{ company: { domain } },
			],
		},
	});
	await db.calendarEvent.deleteMany({
		where: { iCalUid: { endsWith: `@${domain}` } },
	});
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
}

beforeEach(async () => {
	await clean();
	read.length = 0;
	await db.user.createMany({
		data: [
			{ id: userId, name: "Sayu", email: `sayu@${domain}` },
			{ id: otherUserId, name: "Luke", email: `luke@${domain}` },
		],
	});
	const company = await db.company.create({
		data: { name: `Inbox Co ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;
	const contact = await db.contact.create({
		data: { firstName: "Lena", email: `lena@${domain}`, companyId },
		select: { id: true },
	});
	contactId = contact.id;
});

afterAll(clean);

describe("reading a Gemini email", () => {
	it("takes the meeting title out of the subject", () => {
		expect(geminiNoteTitle("Notes: “Pilot review” Oct 19, 2026")).toBe(
			"Pilot review",
		);
		expect(geminiNoteTitle("Notes by Gemini: Weekly sync 19 Oct 2026")).toBe(
			"Weekly sync",
		);
		expect(geminiNoteTitle('Fwd: Notes: "Kick-off"')).toBe("Kick-off");
	});

	it("finds the Google Doc link and compares titles loosely", () => {
		expect(
			geminiDocUrl(
				"Open https://docs.google.com/document/d/abc_123-x/edit?usp=x now",
			),
		).toBe("https://docs.google.com/document/d/abc_123-x");
		expect(geminiDocUrl("No link here")).toBeNull();
		expect(
			geminiDocUrl(
				'<a href="https://docs.google.com/document/d/1iQh_x/edit?usp=meet">Open</a>',
				"Open meeting notes",
			),
		).toBe("https://docs.google.com/document/d/1iQh_x");
		expect(titlesMatch("Pilot review", "pilot-review")).toBe(true);
		expect(titlesMatch("Pilot review", "Board meeting")).toBe(false);
	});
});

describe("cleaning a Gemini email", () => {
	it("keeps the notes and drops Google's header and footer", () => {
		expect(
			geminiNoteBody(
				[
					"Notes from 'Falcon x Bricksmart'",
					"These notes have been sent to Invited guests in your organisation.",
					"Open meeting notes",
					"The content was auto-generated on October 16, 2026, 11:34 AM BST, and may\ncontain errors.",
					"Quick notes",
					"Sayu proposed a 6-month subscription.",
					"Suggested next steps",
					"[Sayu Sinha] Confirm export pricing.",
					"Meeting records Document Notes by Gemini",
					"Is the content of this email helpful?\nNot useful email Useful email",
					"Google LLC, 1600 Ampitheatre Parkway, Mountain View, CA 94043, USA",
				].join("\n\n"),
			),
		).toBe(
			[
				"Quick notes",
				"Sayu proposed a 6-month subscription.",
				"Suggested next steps",
				"[Sayu Sinha] Confirm export pricing.",
			].join("\n\n"),
		);
	});
});

describe("the meeting notes inbox", () => {
	it("files notes on the person from the matching meeting", async () => {
		const title = `Pilot review ${suffix}`;
		const eventId = await meeting(title, true);

		const status = await incoming.receive(note(title));

		expect(status).toBe("FILED");
		const row = await db.incomingMeetingNote.findFirstOrThrow({
			where: { mailboxUserId: userId },
			select: { calendarEventId: true, activityId: true, filedById: true },
		});
		expect(row.calendarEventId).toBe(eventId);
		expect(row.filedById).toBeNull();
		const activity = await db.activity.findUniqueOrThrow({
			where: { id: row.activityId ?? "" },
			select: { contactId: true, createdById: true, type: true, meta: true },
		});
		expect(activity).toEqual({
			contactId,
			createdById: userId,
			type: "MEETING",
			meta: { meetingNotes: true, source: "GEMINI", calendarEventId: eventId },
		});
		expect(read).toEqual([row.activityId ?? ""]);
	});

	it("keeps notes without a CRM meeting for a person to file", async () => {
		await meeting(`Dentist ${suffix}`, false);

		expect(await incoming.receive(note(`Dentist ${suffix}`))).toBe("NEW");
		expect(await incoming.receive(note(`Team lunch ${suffix}`))).toBe("NEW");

		const inbox = await incoming.list({ view: "NEW", page: 1 });
		const mine = inbox.items.filter((item) => item.mailbox === "Sayu");
		expect(mine.map((item) => item.title).sort()).toEqual([
			`Dentist ${suffix}`,
			`Team lunch ${suffix}`,
		]);
		expect(read).toEqual([]);
	});

	it("files a note under the company a person chooses, once", async () => {
		await incoming.receive(note(`Intro ${suffix}`));
		const row = await db.incomingMeetingNote.findFirstOrThrow({
			where: { mailboxUserId: userId },
			select: { id: true },
		});

		const { activityId } = await incoming.file(
			{ id: row.id, companyId },
			otherUserId,
		);

		const filed = (await incoming.list({ view: "FILED", page: 1 })).items.find(
			(item) => item.id === row.id,
		);
		expect(filed?.record).toEqual({
			kind: "company",
			id: companyId,
			name: `Inbox Co ${suffix}`,
		});
		expect(filed?.filedBy).toBe("Luke");
		expect(filed?.activityId).toBe(activityId);
		await expect(
			incoming.file({ id: row.id, companyId }, otherUserId),
		).rejects.toThrow("Someone already filed or changed these notes.");
	});

	it("files a note under the contact a person chooses", async () => {
		await incoming.receive(note(`Call ${suffix}`));
		const row = await db.incomingMeetingNote.findFirstOrThrow({
			where: { mailboxUserId: userId },
			select: { id: true },
		});

		await incoming.file({ id: row.id, contactId }, otherUserId);

		const filed = (await incoming.list({ view: "FILED", page: 1 })).items.find(
			(item) => item.id === row.id,
		);
		expect(filed?.record).toEqual({
			kind: "contact",
			id: contactId,
			name: "Lena",
		});
	});

	it("puts a note back in the inbox when filing fails", async () => {
		await incoming.receive(note(`Broken ${suffix}`));
		const row = await db.incomingMeetingNote.findFirstOrThrow({
			where: { mailboxUserId: userId },
			select: { id: true },
		});

		await expect(
			incoming.file({ id: row.id, companyId: "missing" }, otherUserId),
		).rejects.toThrow("No company with id missing.");
		const after = await db.incomingMeetingNote.findUniqueOrThrow({
			where: { id: row.id },
			select: { status: true, filedById: true },
		});
		expect(after).toEqual({ status: "NEW", filedById: null });
	});

	it("ignores and restores a note", async () => {
		await incoming.receive(note(`Coffee ${suffix}`));
		const row = await db.incomingMeetingNote.findFirstOrThrow({
			where: { mailboxUserId: userId },
			select: { id: true },
		});

		expect(await incoming.setIgnored(row.id, true, userId)).toEqual({
			id: row.id,
			status: "IGNORED",
		});
		expect(await incoming.setIgnored(row.id, false, userId)).toEqual({
			id: row.id,
			status: "NEW",
		});
	});

	it("keeps one copy when two people get notes for the same meeting", async () => {
		const docUrl = `https://docs.google.com/document/d/${suffix}`;

		expect(await incoming.receive(note(`Sync ${suffix}`, { docUrl }))).toBe(
			"NEW",
		);
		expect(
			await incoming.receive(
				note(`Sync ${suffix}`, { docUrl, mailboxUserId: otherUserId }),
			),
		).toBe("DUPLICATE");
	});

	it("keeps one copy when another mailbox gets the same meeting minutes apart", async () => {
		const heldAt = new Date();

		expect(await incoming.receive(note(`Standup ${suffix}`, { heldAt }))).toBe(
			"NEW",
		);
		expect(
			await incoming.receive(
				note(`standup ${suffix}`, {
					heldAt: new Date(heldAt.getTime() + 2 * 60 * 1000),
					mailboxUserId: otherUserId,
				}),
			),
		).toBe("DUPLICATE");
		expect(
			await incoming.receive(
				note(`Standup ${suffix}`, {
					heldAt: new Date(heldAt.getTime() + 3 * HOUR_MS),
					mailboxUserId: otherUserId,
				}),
			),
		).toBe("NEW");
	});
});

function gmailMessage(id: string, from: string, subject: string): GmailMessage {
	const text = Buffer.from(
		"Open meeting notes\n\nSummary: pilot agreed.\n\nIs the content of this email helpful?",
	).toString("base64url");
	const html = Buffer.from(
		`<a href="https://docs.google.com/document/d/doc-${id}/edit?usp=meet_tnfm_email">Open meeting notes</a><p>Summary: pilot agreed.</p>`,
	).toString("base64url");
	return {
		id,
		internalDate: String(Date.now()),
		payload: {
			mimeType: "multipart/alternative",
			headers: [
				{ name: "From", value: from },
				{ name: "Subject", value: subject },
			],
			parts: [
				{ mimeType: "text/plain", body: { data: text } },
				{ mimeType: "text/html", body: { data: html } },
			],
		},
	};
}

describe("collecting Gemini notes from Gmail", () => {
	it("stores new Gemini emails and skips ones it already has", async () => {
		const messages = {
			[`a-${suffix}`]: gmailMessage(
				`a-${suffix}`,
				"Gemini <gemini-notes@google.com>",
				`Notes: “Roadmap ${suffix}” Oct 19, 2026`,
			),
			[`b-${suffix}`]: gmailMessage(
				`b-${suffix}`,
				"Someone <someone@example.com>",
				"Notes: pretending",
			),
		};
		const queries: string[] = [];
		const gmail = {
			searchMessages: async (_token: string, options: { query: string }) => {
				queries.push(options.query);
				return {
					outcome: "ok" as const,
					data: { messages: Object.keys(messages).map((id) => ({ id })) },
				};
			},
			getMessage: async (_token: string, id: string) => ({
				outcome: "ok" as const,
				data: messages[id] ?? {},
			}),
		} as unknown as GmailClient;
		const collector = new GeminiNotesCollector(gmail, incoming);

		expect(await collector.collect(userId, "token")).toEqual({
			listed: 2,
			stored: 1,
			remaining: 0,
		});
		expect(queries).toEqual([geminiNotesQuery()]);
		const stored = await db.incomingMeetingNote.findFirstOrThrow({
			where: { gmailMessageId: `a-${suffix}` },
			select: { title: true, docUrl: true, status: true, body: true },
		});
		expect(stored).toEqual({
			title: `Roadmap ${suffix}`,
			docUrl: `https://docs.google.com/document/d/doc-a-${suffix}`,
			status: "NEW",
			body: "Summary: pilot agreed.",
		});

		expect((await collector.collect(userId, "token")).stored).toBe(0);

		await db.incomingMeetingNote.update({
			where: { gmailMessageId: `a-${suffix}` },
			data: { docUrl: null, body: "old", parserVersion: 1 },
		});
		expect((await collector.collect(userId, "token")).stored).toBe(1);
		const reread = await db.incomingMeetingNote.findFirstOrThrow({
			where: { gmailMessageId: `a-${suffix}` },
			select: { docUrl: true, body: true },
		});
		expect(reread).toEqual({
			docUrl: `https://docs.google.com/document/d/doc-a-${suffix}`,
			body: "Summary: pilot agreed.",
		});
	});
});
