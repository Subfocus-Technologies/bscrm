import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { MeetingNotesService } from "../src/meeting-notes/meeting-notes.service";

const suffix = process.env.TEST_RUN_ID ?? "meeting-notes-spec";
const domain = `notes-${suffix}.test`;
const userId = `notes-user-${suffix}`;

const queued: string[] = [];
const agent = {
	meetingNotesImported: async (input: { activityId: string }) => {
		queued.push(input.activityId);
		await db.agentTask.create({
			data: {
				kind: "meeting-notes",
				reason: "test",
				dueAt: new Date(),
				subject: input.activityId,
				payload: { activityId: input.activityId },
			},
		});
	},
} as unknown as AgentTriggerService;

const notes = new MeetingNotesService(db, agent, new ActivityStampService(db));

let contactId: string;

async function clean() {
	const contacts = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	const activities = await db.activity.findMany({
		where: { contactId: { in: contacts.map((contact) => contact.id) } },
		select: { id: true },
	});
	await db.agentTask.deleteMany({
		where: {
			kind: "meeting-notes",
			subject: { in: activities.map((activity) => activity.id) },
		},
	});
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Note Taker", email: `taker@${domain}` },
	});
});

beforeEach(async () => {
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	const contact = await db.contact.create({
		data: { firstName: "Mira", email: `mira@${domain}` },
		select: { id: true },
	});
	contactId = contact.id;
	queued.length = 0;
});

afterAll(clean);

async function importNotes() {
	return notes.importNotes(
		{
			contactId,
			source: "GEMINI",
			notes:
				"Mira will send the rent roll by Friday. We agreed to book a site visit.",
		},
		userId,
	);
}

describe("importing meeting notes", () => {
	it("saves a meeting on the record and asks the agent to read it", async () => {
		const { activityId } = await importNotes();

		const activity = await db.activity.findUniqueOrThrow({
			where: { id: activityId },
			select: { type: true, subject: true, contactId: true, meta: true },
		});
		expect(activity).toEqual({
			type: "MEETING",
			subject: "Meeting notes (Gemini)",
			contactId,
			meta: { meetingNotes: true, source: "GEMINI", calendarEventId: null },
		});
		expect(queued).toEqual([activityId]);
		expect((await notes.followUps(activityId)).reading).toBe("reading");
	});
});

describe("deciding follow-ups", () => {
	async function withFollowUp() {
		const { activityId } = await importNotes();
		await db.agentTask.updateMany({
			where: { subject: activityId },
			data: { finishedAt: new Date(), outcome: "Done." },
		});
		const item = await db.meetingFollowUp.create({
			data: {
				activityId,
				kind: "TODO",
				title: "Chase the rent roll",
				owner: "Mira",
				dueAt: new Date("2026-10-23T09:00:00Z"),
				quote: "send the rent roll by Friday",
				position: 0,
			},
			select: { id: true },
		});
		return { activityId, id: item.id };
	}

	it("turns an accepted follow-up into a task on the same record", async () => {
		const { activityId, id } = await withFollowUp();

		const result = await notes.decide({ id, decision: "accept" }, userId);

		const task = await db.activity.findUniqueOrThrow({
			where: { id: result.taskId ?? "" },
			select: {
				type: true,
				subject: true,
				dueAt: true,
				contactId: true,
				createdById: true,
			},
		});
		expect(task).toEqual({
			type: "TASK",
			subject: "Chase the rent roll",
			dueAt: new Date("2026-10-23T09:00:00Z"),
			contactId,
			createdById: userId,
		});
		const followUps = await notes.followUps(activityId);
		expect(followUps.reading).toBe("ready");
		expect(followUps.items[0]?.status).toBe("ACCEPTED");
		await expect(
			notes.decide({ id, decision: "dismiss" }, userId),
		).rejects.toThrow("already decided");
	});

	it("creates no task when a follow-up is dismissed", async () => {
		const { id } = await withFollowUp();

		const result = await notes.decide({ id, decision: "dismiss" }, userId);

		expect(result).toEqual({ id, status: "DISMISSED", taskId: null });
		expect(
			await db.activity.count({ where: { contactId, type: "TASK" } }),
		).toBe(0);
	});

	it("reads the notes again only when no read is waiting", async () => {
		const { activityId } = await withFollowUp();

		expect(await notes.reread(activityId, userId)).toEqual({ queued: true });
		expect(await notes.reread(activityId, userId)).toEqual({ queued: false });
	});
});
