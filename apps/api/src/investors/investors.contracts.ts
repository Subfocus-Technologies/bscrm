import {
	INVESTOR_KINDS,
	INVESTOR_SORTS,
	INVESTOR_SOURCES,
	INVESTOR_STAGES,
	INVESTORS,
	investorFit,
	investorProfile,
} from "@crm/validation/investors";
import { z } from "zod";

const shortText = z.string().trim().max(INVESTORS.text.shortMaxLength);
const longText = z.string().trim().max(INVESTORS.text.longMaxLength);
const optionalShort = shortText.nullable().default(null);
const optionalLong = longText.nullable().default(null);
const cents = z.number().int().min(0).nullable().default(null);

export const fundraiseOutput = z.object({
	id: z.string(),
	name: z.string(),
	company: z.string(),
	summary: z.string().nullable(),
	whyNow: z.string().nullable(),
	traction: z.string().nullable(),
	website: z.string().nullable(),
	founderLinkedIn: z.string().nullable(),
	roundSizeCents: z.number().nullable(),
	roundCurrency: z.string(),
	profile: investorProfile,
	researchDailyLimit: z.number(),
	autoDiscover: z.boolean(),
	weeklyMeetingTarget: z.number(),
	updatedAt: z.string(),
});

export type FundraiseOutput = z.infer<typeof fundraiseOutput>;

export const fundraiseGetOutput = fundraiseOutput.nullable();

export const fundraiseSaveInput = z
	.object({
		id: z.string().optional(),
		name: shortText.min(1, "Give the raise a name."),
		company: shortText.min(1, "Name the company raising."),
		summary: optionalLong,
		whyNow: optionalLong,
		traction: optionalLong,
		website: optionalShort,
		founderLinkedIn: optionalShort,
		roundSizeCents: cents,
		profile: investorProfile,
		researchDailyLimit: z
			.number()
			.int()
			.min(0)
			.max(INVESTORS.research.dailyLimitMax),
		autoDiscover: z.boolean(),
		weeklyMeetingTarget: z
			.number()
			.int()
			.min(0)
			.max(INVESTORS.meetingTarget.max),
	})
	.refine(
		(input) =>
			new Set(input.profile.criteria.map((criterion) => criterion.id)).size ===
			input.profile.criteria.length,
		{ message: "Each criterion needs its own id." },
	);

export type FundraiseSaveInput = z.infer<typeof fundraiseSaveInput>;

export const investorListInput = z.object({
	stage: z.enum(INVESTOR_STAGES).default("TO_APPROVE"),
	kinds: z.array(z.enum(INVESTOR_KINDS)).default([]),
	q: z.string().trim().max(INVESTORS.text.shortMaxLength).default(""),
	sort: z.enum(INVESTOR_SORTS).default("fit"),
	page: z.number().int().min(1).default(1),
});

export type InvestorListInput = z.infer<typeof investorListInput>;

const investorRowOutput = z.object({
	id: z.string(),
	name: z.string(),
	kind: z.enum(INVESTOR_KINDS),
	firm: z.string().nullable(),
	website: z.string().nullable(),
	linkedinUrl: z.string().nullable(),
	email: z.string().nullable(),
	location: z.string().nullable(),
	stages: z.array(z.string()),
	sectors: z.array(z.string()),
	chequeMinCents: z.number().nullable(),
	chequeMaxCents: z.number().nullable(),
	chequeCurrency: z.string(),
	thesis: z.string().nullable(),
	notes: z.string().nullable(),
	source: z.enum(INVESTOR_SOURCES),
	sourceDetail: z.string().nullable(),
	stage: z.enum(INVESTOR_STAGES),
	stageChangedAt: z.string(),
	fitScore: z.number().nullable(),
	fit: investorFit.nullable(),
	researchedAt: z.string().nullable(),
	researching: z.boolean(),
});

export type InvestorRow = z.infer<typeof investorRowOutput>;

const INVESTOR_SEARCH_STATES = [
	"waiting",
	"running",
	"finished",
	"failed",
] as const;

const investorSearchOutput = z.object({
	state: z.enum(INVESTOR_SEARCH_STATES),
	reason: z.string(),
	queuedAt: z.string(),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
	attempts: z.number(),
	outcome: z.string().nullable(),
});

export type InvestorSearch = z.infer<typeof investorSearchOutput>;

export const investorListOutput = z.object({
	items: z.array(investorRowOutput),
	total: z.number(),
	pageSize: z.number(),
	counts: z.record(z.enum(INVESTOR_STAGES), z.number()),
	research: z.object({
		usedToday: z.number(),
		dailyLimit: z.number(),
		waiting: z.number(),
	}),
	search: investorSearchOutput.nullable(),
});

export type InvestorList = z.infer<typeof investorListOutput>;

export const investorIdsInput = z.object({
	ids: z
		.array(z.string())
		.min(1)
		.max(INVESTORS.pageSize * 4),
});

export const investorStageInput = investorIdsInput.extend({
	stage: z.enum(INVESTOR_STAGES),
});

export type InvestorStageInput = z.infer<typeof investorStageInput>;

export const investorStageOutput = z.object({ updated: z.number() });

const listText = z
	.array(z.string().trim().min(1).max(INVESTORS.profile.valueMaxLength))
	.max(INVESTORS.profile.maxValues)
	.default([]);

const investorImportRow = z.object({
	name: shortText.min(1),
	kind: z.enum(INVESTOR_KINDS).default("OTHER"),
	firm: optionalShort,
	website: optionalShort,
	linkedinUrl: optionalShort,
	email: z.string().trim().toLowerCase().email().nullable().default(null),
	location: optionalShort,
	stages: listText,
	sectors: listText,
	chequeMinCents: cents,
	chequeMaxCents: cents,
	thesis: optionalLong,
	notes: optionalLong,
});

export type InvestorImportRow = z.infer<typeof investorImportRow>;

export const investorImportInput = z.object({
	label: shortText.min(1),
	rows: z.array(investorImportRow).min(1).max(INVESTORS.import.maxRows),
});

export type InvestorImportInput = z.infer<typeof investorImportInput>;

export const investorImportOutput = z.object({
	created: z.number(),
	duplicates: z.number(),
	queued: z.number(),
});

export const investorQueuedOutput = z.object({ queued: z.number() });
