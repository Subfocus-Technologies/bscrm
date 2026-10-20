import { describe, expect, it } from "bun:test";
import { fitScore, type ProfileCriterion } from "../src/investors";

const criteria: ProfileCriterion[] = [
	{ id: "sector", kind: "MUST", label: "Sector", values: [], weight: 60 },
	{ id: "stage", kind: "MUST", label: "Stage", values: [], weight: 20 },
	{ id: "uk", kind: "NICE", label: "UK", values: [], weight: 20 },
	{
		id: "never",
		kind: "RULE_OUT",
		label: "Never pre-seed",
		values: [],
		weight: 0,
	},
];

function met(...ids: string[]) {
	return ids.map((criterionId) => ({
		criterionId,
		met: true,
		note: "seen",
		sourceUrl: "https://example.com",
	}));
}

describe("the investor fit score", () => {
	it("is the share of weight an investor meets", () => {
		expect(fitScore(criteria, met("sector", "stage"))).toEqual({
			score: 80,
			ruledOut: false,
		});
		expect(fitScore(criteria, met("sector", "stage", "uk")).score).toBe(100);
		expect(fitScore(criteria, []).score).toBe(0);
	});

	it("is zero when a rule-out criterion is met", () => {
		expect(fitScore(criteria, met("sector", "stage", "never"))).toEqual({
			score: 0,
			ruledOut: true,
		});
	});

	it("ignores verdicts that are not met", () => {
		expect(
			fitScore(criteria, [
				{ criterionId: "sector", met: false, note: "no", sourceUrl: null },
			]).score,
		).toBe(0);
	});
});
