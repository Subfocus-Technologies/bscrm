import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	opportunityPreamble,
	saveOpportunities,
} from "../agent/lib/opportunities";

const suffix = process.env.TEST_RUN_ID ?? "opportunities-spec";
const host = `opportunities-${suffix}.test`;
const now = new Date("2026-10-30T12:00:00Z");
const alive = async () => true;

function item(
	path: string,
	overrides: {
		title?: string;
		url?: string;
		startDate?: string | null;
		deadlineDate?: string | null;
	} = {},
) {
	return {
		title: `Property Summit ${suffix} ${path}`,
		organiser: "Summit Ltd",
		url: `https://www.${host}/${path}/`,
		summary: "Our agency buyers attend.",
		quote: "London, 12 March 2027",
		location: "London",
		startDate: "2027-03-12",
		deadlineDate: null,
		businessId: null,
		...overrides,
	};
}

async function clean() {
	await db.opportunity.deleteMany({ where: { urlKey: { startsWith: host } } });
}

beforeEach(clean);
afterAll(clean);

describe("saveOpportunities", () => {
	it("saves what fits and drops the same page a second time", async () => {
		const first = await saveOpportunities("EVENT", [item("one")], now, alive);
		const second = await saveOpportunities(
			"EVENT",
			[item("one", { title: "Another name", url: `https://${host}/one` })],
			now,
			alive,
		);

		expect(first).toEqual({ saved: 1, dropped: [] });
		expect(second.saved).toBe(0);
		expect(second.dropped[0]?.reason).toBe("It is already on our list.");
		const saved = await db.opportunity.findFirstOrThrow({
			where: { urlKey: `${host}/one` },
			select: { status: true, startsAt: true },
		});
		expect(saved).toEqual({
			status: "SUGGESTED",
			startsAt: new Date("2027-03-12T09:00:00Z"),
		});
	});

	it("drops a past date, a dead link and an event with no date", async () => {
		const outcome = await saveOpportunities(
			"EVENT",
			[
				item("past", { startDate: "2026-01-01" }),
				item("undated", { startDate: null }),
				item("dead"),
			],
			now,
			async () => false,
		);

		expect(outcome.saved).toBe(0);
		expect(outcome.dropped.map((row) => row.reason)).toEqual([
			"Its date has already passed.",
			"An event needs its start date from the page.",
			"The link does not open.",
		]);
	});

	it("keeps an award with a deadline and no ceremony date", async () => {
		const outcome = await saveOpportunities(
			"AWARD",
			[item("award", { startDate: null, deadlineDate: "2027-01-15" })],
			now,
			alive,
		);

		expect(outcome.saved).toBe(1);
	});

	it("tells the agent what we turned down, so it is not suggested again", async () => {
		await saveOpportunities("SPEAKING", [item("talk")], now, alive);
		await db.opportunity.updateMany({
			where: { urlKey: `${host}/talk` },
			data: { status: "DISMISSED", decidedAt: now },
		});

		const brief = await opportunityPreamble("SPEAKING", now);

		expect(brief).toContain("We decided against these");
		expect(brief).toContain(`Property Summit ${suffix} talk`);
	});
});
