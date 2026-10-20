import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	addDiscoveredInvestors,
	investorPreamble,
	preflightInvestorResearch,
	queueScheduledDiscovery,
	scoreInvestor,
} from "../agent/lib/investors";

const LATER_THAN_OTHER_SUITES = new Date("2999-01-01T00:00:00Z");

let fundraiseId: string;

const PROFILE = {
	criteria: [
		{
			id: "sector",
			kind: "MUST",
			label: "Invests in PropTech",
			values: ["PropTech"],
			weight: 75,
		},
		{
			id: "uk",
			kind: "NICE",
			label: "UK",
			values: ["United Kingdom"],
			weight: 25,
		},
		{
			id: "never",
			kind: "RULE_OUT",
			label: "Never pre-seed",
			values: [],
			weight: 0,
		},
	],
};

async function clean() {
	await db.agentTask.deleteMany({
		where: { kind: { in: ["investor-research", "investor-discovery"] } },
	});
	await db.fundraise.deleteMany({
		where: { createdAt: { gte: LATER_THAN_OTHER_SUITES } },
	});
}

beforeEach(async () => {
	await clean();
	const fundraise = await db.fundraise.create({
		data: {
			name: "Agent spec raise",
			company: "Bricksmart.ai",
			profile: PROFILE,
			researchDailyLimit: 2,
			createdAt: LATER_THAN_OTHER_SUITES,
		},
		select: { id: true },
	});
	fundraiseId = fundraise.id;
});

afterAll(clean);

describe("investors the agent finds", () => {
	it("adds new ones once and queues research for each", async () => {
		const first = await addDiscoveredInvestors(fundraiseId, [
			{
				name: "London Angels",
				kind: "ANGEL_GROUP",
				website: "https://londonangels.example",
			},
			{
				name: "PropTech Seed Fund",
				kind: "VC",
				website: "proptechseed.example",
			},
		]);
		const again = await addDiscoveredInvestors(fundraiseId, [
			{
				name: "London Angels Network",
				kind: "ANGEL_GROUP",
				website: "www.londonangels.example",
			},
		]);

		expect(first).toEqual({
			added: ["London Angels", "PropTech Seed Fund"],
			alreadyKnown: [],
		});
		expect(again).toEqual({
			added: [],
			alreadyKnown: ["London Angels Network"],
		});
		expect(
			await db.agentTask.count({ where: { kind: "investor-research" } }),
		).toBe(2);
	});
});

describe("scoring an investor", () => {
	it("works the score out from the profile and fills blank facts", async () => {
		await addDiscoveredInvestors(fundraiseId, [
			{ name: "Seed VC", kind: "VC" },
		]);
		const investor = await db.investor.findFirstOrThrow({
			where: { fundraiseId },
			select: { id: true },
		});

		const result = await scoreInvestor({
			investorId: investor.id,
			summary: "A UK seed fund that backs proptech.",
			reasons: [
				{
					criterionId: "sector",
					met: true,
					note: "Backs proptech",
					sourceUrl: "https://seed.example/portfolio",
				},
				{
					criterionId: "uk",
					met: false,
					note: "Based in Berlin",
					sourceUrl: null,
				},
				{
					criterionId: "invented",
					met: true,
					note: "x",
					sourceUrl: "https://x.example",
				},
			],
			facts: { location: "Berlin", website: "https://seed.example" },
		});

		expect(result).toEqual({
			ok: true,
			score: 75,
			ruledOut: false,
			ignored: ["invented"],
		});
		const saved = await db.investor.findUniqueOrThrow({
			where: { id: investor.id },
			select: {
				fitScore: true,
				location: true,
				website: true,
				researchedAt: true,
			},
		});
		expect(saved.fitScore).toBe(75);
		expect(saved.location).toBe("Berlin");
		expect(saved.website).toBe("https://seed.example");
		expect(saved.researchedAt).not.toBeNull();
	});

	it("refuses a met criterion without a source", async () => {
		await addDiscoveredInvestors(fundraiseId, [
			{ name: "No Source VC", kind: "VC" },
		]);
		const investor = await db.investor.findFirstOrThrow({
			where: { fundraiseId },
			select: { id: true },
		});

		expect(
			await scoreInvestor({
				investorId: investor.id,
				summary: "Unsure.",
				reasons: [
					{ criterionId: "sector", met: true, note: "Maybe", sourceUrl: null },
				],
				facts: {},
			}),
		).toEqual({
			ok: false,
			reason: "Give a source URL for every criterion you mark as met: sector.",
		});
	});
});

describe("the research limit and the daily search", () => {
	it("waits for tomorrow once today's research sessions are used up", async () => {
		const now = new Date();
		await db.agentTask.createMany({
			data: [1, 2].map((n) => ({
				kind: "investor-research",
				reason: "spent",
				dueAt: now,
				startedAt: now,
				sessionId: `spent-${n}`,
				subject: `spent-${n}`,
				payload: { fundraiseId },
			})),
		});

		const preflight = await preflightInvestorResearch({ fundraiseId }, now);

		expect(preflight.kind).toBe("deferred");
	});

	it("queues one search a day while the profile has criteria", async () => {
		const now = new Date();

		expect(await queueScheduledDiscovery(now)).toBeGreaterThanOrEqual(1);
		await queueScheduledDiscovery(now);

		expect(
			await db.agentTask.count({
				where: { kind: "investor-discovery", subject: fundraiseId },
			}),
		).toBe(1);
	});

	it("briefs the session with the raise and the profile", async () => {
		const markdown = await investorPreamble(
			"investor-discovery",
			fundraiseId,
			null,
		);

		expect(markdown).toContain("investor-discovery task");
		expect(markdown).toContain(
			"`sector` Invests in PropTech: PropTech (weight 75)",
		);
		expect(markdown).toContain("Never pre-seed");
	});
});
