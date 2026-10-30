import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { nextWorkspaceWeekStart, workspaceWeekStart } from "@crm/db/day";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { OpportunitiesService } from "../src/opportunities/opportunities.service";
import { PrioritiesService } from "../src/priorities/priorities.service";

const suffix = process.env.TEST_RUN_ID ?? "priorities-spec";
const sayu = `priorities-sayu-${suffix}`;
const luke = `priorities-luke-${suffix}`;
const host = `priorities-${suffix}.test`;

const reviews: string[] = [];
const agent = {
	opportunityReviewRequested: async (kind: string) => {
		reviews.push(kind);
		return true;
	},
} as unknown as AgentTriggerService;

const priorities = new PrioritiesService(db);
const opportunities = new OpportunitiesService(db, agent);

async function clean() {
	await db.weeklyPriority.deleteMany({
		where: { createdById: { in: [sayu, luke] } },
	});
	await db.opportunity.deleteMany({ where: { urlKey: { startsWith: host } } });
}

beforeEach(async () => {
	await clean();
	reviews.length = 0;
	for (const id of [sayu, luke]) {
		await db.user.upsert({
			where: { id },
			create: { id, name: id, email: `${id}@example.test` },
			update: {},
		});
	}
});

afterAll(async () => {
	await clean();
	await db.user.deleteMany({ where: { id: { in: [sayu, luke] } } });
});

describe("workspaceWeekStart", () => {
	it("starts a week on Monday at midnight UK time, across the clock change", () => {
		expect(workspaceWeekStart(new Date("2026-10-23T12:00:00Z"))).toEqual(
			new Date("2026-10-18T23:00:00Z"),
		);
		expect(workspaceWeekStart(new Date("2026-10-30T12:00:00Z"))).toEqual(
			new Date("2026-10-26T00:00:00Z"),
		);
		expect(nextWorkspaceWeekStart(new Date("2026-10-18T23:00:00Z"))).toEqual(
			new Date("2026-10-26T00:00:00Z"),
		);
	});
});

describe("weekly priorities", () => {
	it("moves work through priorities, ongoing and done, and records who did it", async () => {
		const added = await priorities.create(
			{ title: "Ship the deck", deliverable: "Final PDF", ownerId: luke },
			sayu,
		);

		const planned = await priorities.week({});
		expect(planned.columns.PRIORITY.items.map((row) => row.title)).toContain(
			"Ship the deck",
		);

		await priorities.update({ id: added.id, status: "ONGOING" }, luke);
		const ongoing = await priorities.week({ ownerId: luke });
		expect(ongoing.columns.ONGOING.items[0]).toMatchObject({
			title: "Ship the deck",
			owner: { id: luke, name: luke },
			createdBy: sayu,
			updatedBy: luke,
		});

		await priorities.update({ id: added.id, status: "DONE" }, luke);
		const done = await priorities.week({ ownerId: luke });
		expect(done.columns.DONE.total).toBe(1);
		expect(done.columns.ONGOING.total).toBe(0);
	});

	it("keeps two people's edits to different fields", async () => {
		const added = await priorities.create({ title: "Pricing" }, sayu);

		await Promise.all([
			priorities.update({ id: added.id, ownerId: luke }, sayu),
			priorities.update({ id: added.id, deliverable: "New tiers" }, luke),
		]);

		const row = await db.weeklyPriority.findUniqueOrThrow({
			where: { id: added.id },
			select: { ownerId: true, deliverable: true },
		});
		expect(row).toEqual({ ownerId: luke, deliverable: "New tiers" });
	});

	it("carries unfinished work into the next week, and leaves done work behind", async () => {
		const open = await priorities.create({ title: "Still open" }, sayu);
		const finished = await priorities.create({ title: "Finished" }, sayu);
		await priorities.update({ id: finished.id, status: "DONE" }, sayu);
		const thisWeek = await priorities.week({ ownerId: undefined });

		const next = await priorities.week({ week: thisWeek.nextWeek });

		const carried = next.columns.PRIORITY.items.find(
			(row) => row.id === open.id,
		);
		expect(carried?.carriedOver).toBe(true);
		expect(next.columns.DONE.items.map((row) => row.id)).not.toContain(
			finished.id,
		);
	});

	it("removes a priority", async () => {
		const added = await priorities.create({ title: "Mistake" }, sayu);

		await priorities.remove(added.id, sayu);

		expect(priorities.remove(added.id, sayu)).rejects.toThrow("No priority");
	});
});

describe("opportunities", () => {
	async function opportunity(path: string, deadline: string | null) {
		return db.opportunity.create({
			data: {
				kind: "AWARD",
				title: path,
				url: `https://${host}/${path}`,
				urlKey: `${host}/${path}`,
				summary: "It fits.",
				quote: "Entries close",
				deadlineAt: deadline ? new Date(deadline) : null,
			},
			select: { id: true },
		});
	}

	it("lists open ones soonest first and hides a passed deadline", async () => {
		await opportunity("later", "2099-06-01T09:00:00Z");
		await opportunity("sooner", "2099-01-01T09:00:00Z");
		await opportunity("passed", "2001-01-01T09:00:00Z");

		const list = await opportunities.list({
			kind: "AWARD",
			view: "SUGGESTED",
			page: 1,
		});

		const mine = list.items.filter((row) => row.url.includes(host));
		expect(mine.map((row) => row.title)).toEqual(["sooner", "later"]);
	});

	it("records who planned it and who owns it", async () => {
		const { id } = await opportunity("plan", "2099-01-01T09:00:00Z");

		const updated = await opportunities.update(
			{ id, status: "PLANNED", ownerId: luke },
			sayu,
		);

		expect(updated).toMatchObject({
			status: "PLANNED",
			owner: { id: luke, name: luke },
			decidedBy: sayu,
		});
	});

	it("asks the agent for a review of one kind", async () => {
		await opportunities.review("SPEAKING", sayu);

		expect(reviews).toEqual(["SPEAKING"]);
	});
});
