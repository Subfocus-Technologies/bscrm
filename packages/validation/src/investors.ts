import { z } from "zod";

export const INVESTORS = {
	text: { shortMaxLength: 160, longMaxLength: 4000, noteMaxLength: 600 },
	profile: { maxCriteria: 12, maxValues: 20, valueMaxLength: 80 },
	import: { maxRows: 2000, maxFileBytes: 5 * 1024 * 1024 },
	research: { dailyLimitDefault: 40, dailyLimitMax: 500, budget: 6 },
	discovery: { perRun: 15, everyHours: 24, budget: 20, knownNames: 300 },
	evidence: { maxItems: 5, quoteMaxLength: 280 },
	pageSize: 50,
	meetingTarget: { default: 5, max: 50 },
	scoring: { mustMissCap: 40 },
	outreach: {
		followUpDays: [4, 10],
		maxWords: 180,
		draftBudget: 3,
		listSize: 50,
		dailySendDefault: 20,
		dailySendMax: 200,
		followUpsPerTick: 20,
		subjectMaxLength: 200,
		bodyMaxLength: 5000,
	},
} as const;

export const INVESTOR_KINDS = [
	"ANGEL",
	"ANGEL_GROUP",
	"VC",
	"FAMILY_OFFICE",
	"CORPORATE_VC",
	"ACCELERATOR",
	"OTHER",
] as const;

export type InvestorKind = (typeof INVESTOR_KINDS)[number];

export const INVESTOR_STAGES = [
	"TO_APPROVE",
	"APPROVED",
	"CONTACTED",
	"REPLIED",
	"MEETING",
	"COMMITTED",
	"PASSED",
	"REJECTED",
] as const;

export type InvestorStage = (typeof INVESTOR_STAGES)[number];

export const INVESTOR_SOURCES = ["IMPORT", "AGENT", "MANUAL"] as const;

export const INVESTOR_SORTS = ["fit", "name", "newest"] as const;

export const CRITERION_KINDS = ["MUST", "NICE", "RULE_OUT"] as const;

export type CriterionKind = (typeof CRITERION_KINDS)[number];

const shortText = z.string().trim().max(INVESTORS.text.shortMaxLength);

export const profileCriterion = z.object({
	id: z.string().trim().min(1).max(40),
	kind: z.enum(CRITERION_KINDS),
	label: shortText.min(1),
	values: z
		.array(z.string().trim().min(1).max(INVESTORS.profile.valueMaxLength))
		.max(INVESTORS.profile.maxValues),
	weight: z.number().int().min(0).max(100),
});

export type ProfileCriterion = z.infer<typeof profileCriterion>;

export const investorProfile = z.object({
	criteria: z.array(profileCriterion).max(INVESTORS.profile.maxCriteria),
});

export type InvestorProfile = z.infer<typeof investorProfile>;

export function parseInvestorProfile(value: unknown): InvestorProfile {
	if (value === null || value === undefined) return { criteria: [] };

	const parsed = investorProfile.safeParse(value);
	if (!parsed.success) {
		throw new Error(
			`Stored investor profile is unreadable: ${parsed.error.message}`,
		);
	}

	return parsed.data;
}

export const fitReason = z.object({
	criterionId: z.string().trim().min(1),
	met: z.boolean(),
	note: z.string().trim().min(1).max(INVESTORS.evidence.quoteMaxLength),
	sourceUrl: z.string().trim().url().nullable().default(null),
	quote: z
		.string()
		.trim()
		.max(INVESTORS.evidence.quoteMaxLength)
		.nullable()
		.default(null),
});

export type FitReason = z.infer<typeof fitReason>;

export const investorFit = z.object({
	summary: z.string().trim().max(INVESTORS.text.noteMaxLength),
	ruledOut: z.boolean(),
	reasons: z.array(fitReason).max(INVESTORS.profile.maxCriteria),
});

export type InvestorFit = z.infer<typeof investorFit>;

export function parseInvestorFit(value: unknown): InvestorFit | null {
	if (value === null || value === undefined) return null;

	const parsed = investorFit.safeParse(value);
	if (!parsed.success) {
		throw new Error(
			`Stored investor fit is unreadable: ${parsed.error.message}`,
		);
	}

	return parsed.data;
}

export type FitScore = { score: number; ruledOut: boolean };

export function fitScore(
	criteria: readonly ProfileCriterion[],
	reasons: readonly FitReason[],
): FitScore {
	const met = new Set(
		reasons.filter((reason) => reason.met).map((reason) => reason.criterionId),
	);
	const ruledOut = criteria.some(
		(criterion) => criterion.kind === "RULE_OUT" && met.has(criterion.id),
	);
	const weighted = criteria.filter(
		(criterion) => criterion.kind !== "RULE_OUT",
	);
	const total = weighted.reduce((sum, criterion) => sum + criterion.weight, 0);

	if (ruledOut || total === 0) return { score: 0, ruledOut };

	const earned = weighted
		.filter((criterion) => met.has(criterion.id))
		.reduce((sum, criterion) => sum + criterion.weight, 0);
	const score = Math.round((earned / total) * 100);
	const missesMust = criteria.some(
		(criterion) => criterion.kind === "MUST" && !met.has(criterion.id),
	);

	return {
		score: missesMust ? Math.min(score, INVESTORS.scoring.mustMissCap) : score,
		ruledOut,
	};
}

export const investorTaskPayload = z.object({
	fundraiseId: z.string().trim().min(1),
	investorId: z.string().trim().min(1).optional(),
});

export type InvestorTaskPayload = z.infer<typeof investorTaskPayload>;
