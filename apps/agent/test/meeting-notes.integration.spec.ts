import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { proposeFollowUps } from "../agent/lib/meeting-notes";

const suffix = process.env.TEST_RUN_ID ?? "meeting-notes-spec";
const email = `notes.${suffix}@example.test`;
const userId = `notes-agent-${suffix}`;

let activityId: string;

const NOTES =
	"Action items:\n- Mira will send the rent roll by Friday.\n- We agreed to book a site visit next month.";

beforeEach(async () => {
	await db.contact.deleteMany({ where: { email } });
	await db.user.upsert({
		where: { id: userId },
		create: { id: userId, name: "Notes", email: `user.${email}` },
		update: {},
	});
	const contact = await db.contact.create({
		data: { firstName: "Mira", email },
		select: { id: true },
	});
	const activity = await db.activity.create({
		data: {
			type: "MEETING",
			body: NOTES,
			occurredAt: new Date("2026-10-18T10:00:00Z"),
			contactId: contact.id,
			createdById: userId,
			meta: { meetingNotes: true, source: "CLUELY" },
		},
		select: { id: true },
	});
	activityId = activity.id;
});

afterAll(async () => {
	await db.contact.deleteMany({ where: { email } });
	await db.user.deleteMany({ where: { id: userId } });
});

const rentRoll = {
	kind: "TODO",
	title: "Get the rent roll from Mira",
	detail: null,
	owner: "Mira",
	dueDate: "2026-10-23",
	quote: "Mira will send the rent roll   by Friday",
};

describe("proposeFollowUps", () => {
	it("keeps items whose quote is in the notes, ignoring spacing and case", async () => {
		const outcome = await proposeFollowUps(activityId, [rentRoll]);

		expect(outcome).toEqual({ saved: 1, dropped: [] });
		const saved = await db.meetingFollowUp.findFirstOrThrow({
			where: { activityId },
			select: { title: true, dueAt: true, owner: true },
		});
		expect(saved).toEqual({
			title: "Get the rent roll from Mira",
			dueAt: new Date("2026-10-23T09:00:00Z"),
			owner: "Mira",
		});
	});

	it("drops an item the notes do not say", async () => {
		const outcome = await proposeFollowUps(activityId, [
			{
				...rentRoll,
				title: "Send a contract",
				quote: "send the contract today",
			},
		]);

		expect(outcome.saved).toBe(0);
		expect(outcome.dropped[0]?.reason).toContain("not in the notes");
	});

	it("drops a due date far from the meeting", async () => {
		const outcome = await proposeFollowUps(activityId, [
			{ ...rentRoll, dueDate: "2031-01-01" },
		]);

		expect(outcome.dropped[0]?.reason).toContain("not plausible");
	});

	it("replaces waiting suggestions but keeps decided ones", async () => {
		await proposeFollowUps(activityId, [rentRoll]);
		await db.meetingFollowUp.updateMany({
			where: { activityId },
			data: { status: "ACCEPTED" },
		});

		await proposeFollowUps(activityId, [
			{
				kind: "NEXT_STEP",
				title: "Book a site visit",
				detail: null,
				owner: null,
				dueDate: null,
				quote: "book a site visit next month",
			},
		]);

		const rows = await db.meetingFollowUp.findMany({
			where: { activityId },
			select: { status: true, kind: true },
			orderBy: { createdAt: "asc" },
		});
		expect(rows).toEqual([
			{ status: "ACCEPTED", kind: "TODO" },
			{ status: "PROPOSED", kind: "NEXT_STEP" },
		]);
	});
});
