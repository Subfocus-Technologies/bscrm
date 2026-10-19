import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { MeetingsService } from "../src/meetings/meetings.service";

const suffix = process.env.TEST_RUN_ID ?? "meetings-spec";
const domain = `meetings-${suffix}.test`;
const userId = `meetings-user-${suffix}`;

const prepared: string[] = [];
const agent = {
	meetingPrepRequested: async (contactId: string) => {
		prepared.push(contactId);
		return true;
	},
} as unknown as AgentTriggerService;

const meetings = new MeetingsService(db, agent);

const HOUR_MS = 60 * 60 * 1000;
let contactId: string;

async function clean() {
	await db.calendarEvent.deleteMany({
		where: { iCalUid: { endsWith: `@${domain}` } },
	});
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.user.deleteMany({ where: { id: userId } });
}

async function meeting(
	key: string,
	startsInHours: number,
	withContact: boolean,
) {
	const startsAt = new Date(Date.now() + startsInHours * HOUR_MS);
	const event = await db.calendarEvent.create({
		data: {
			iCalUid: `${key}@${domain}`,
			originalStartTime: startsAt,
			startsAt,
			endsAt: new Date(startsAt.getTime() + HOUR_MS / 2),
			status: "confirmed",
			title: key,
			contactId: withContact ? contactId : null,
			syncedByUserId: userId,
			attendees: {
				create: [{ email: `${userId}@${domain}`, name: "Rep" }],
			},
		},
		select: { id: true },
	});
	return event.id;
}

beforeEach(async () => {
	await clean();
	prepared.length = 0;
	await db.user.create({
		data: { id: userId, name: "Rep", email: `${userId}@${domain}` },
	});
	const contact = await db.contact.create({
		data: { firstName: "Lena", lastName: "Park", email: `lena@${domain}` },
		select: { id: true },
	});
	contactId = contact.id;
});

afterAll(clean);

function mine(rows: Awaited<ReturnType<MeetingsService["upcoming"]>>) {
	return rows.filter((row) => row.title?.startsWith("m-"));
}

describe("upcoming meetings", () => {
	it("lists meetings with CRM people, and leaves out private ones", async () => {
		await meeting("m-pitch", 24, true);
		await meeting("m-dentist", 26, false);

		const rows = mine(await meetings.upcoming({ business: null }));

		expect(rows.map((row) => [row.title, row.phase, row.prep])).toEqual([
			["m-pitch", "upcoming", "none"],
		]);
		expect(rows[0]?.contact).toEqual({ id: contactId, name: "Lena Park" });
		expect(rows[0]?.team).toEqual(["Rep"]);
	});

	it("marks a meeting that has ended and links its pasted notes", async () => {
		const eventId = await meeting("m-review", -3, true);
		const notes = await db.activity.create({
			data: {
				type: "MEETING",
				body: "Notes",
				contactId,
				createdById: userId,
				meta: {
					meetingNotes: true,
					source: "GEMINI",
					calendarEventId: eventId,
				},
			},
			select: { id: true },
		});

		const [row] = mine(await meetings.upcoming({ business: null }));

		expect(row?.phase).toBe("done");
		expect(row?.notesActivityId).toBe(notes.id);
		await db.activity.delete({ where: { id: notes.id } });
	});

	it("asks the agent to prepare for the person on the meeting", async () => {
		const eventId = await meeting("m-intro", 5, true);

		expect(await meetings.prepare(eventId, userId)).toEqual({ queued: true });
		expect(prepared).toEqual([contactId]);
	});
});
