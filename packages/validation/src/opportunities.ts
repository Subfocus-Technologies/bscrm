import { z } from "zod";

export const OPPORTUNITIES = {
	review: { perRun: 10, budget: 20, knownTitles: 200 },
	list: { pageSize: 25 },
	text: {
		titleMaxLength: 200,
		shortMaxLength: 200,
		summaryMaxLength: 600,
		quoteMaxLength: 400,
		urlMaxLength: 500,
	},
	link: { timeoutMs: 8_000, deadStatuses: [404, 410] },
} as const;

export const OPPORTUNITY_KINDS = ["EVENT", "AWARD", "SPEAKING"] as const;

export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const OPPORTUNITY_VIEWS = [
	"SUGGESTED",
	"PLANNED",
	"DONE",
	"DISMISSED",
] as const;

export type OpportunityView = (typeof OPPORTUNITY_VIEWS)[number];

export const opportunityReviewPayload = z.object({
	kind: z.enum(OPPORTUNITY_KINDS),
});

export const opportunityItem = z.object({
	title: z.string().trim().min(1).max(OPPORTUNITIES.text.titleMaxLength),
	organiser: z
		.string()
		.trim()
		.max(OPPORTUNITIES.text.shortMaxLength)
		.nullable()
		.default(null),
	url: z.string().trim().url().max(OPPORTUNITIES.text.urlMaxLength),
	summary: z.string().trim().min(1).max(OPPORTUNITIES.text.summaryMaxLength),
	quote: z.string().trim().min(1).max(OPPORTUNITIES.text.quoteMaxLength),
	location: z
		.string()
		.trim()
		.max(OPPORTUNITIES.text.shortMaxLength)
		.nullable()
		.default(null),
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.")
		.nullable()
		.default(null),
	deadlineDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.")
		.nullable()
		.default(null),
	businessId: z.string().trim().min(1).nullable().default(null),
});

export type OpportunityItem = z.infer<typeof opportunityItem>;

export function opportunityUrlKey(url: string): string {
	const parsed = new URL(url);
	const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
	const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
	return `${host}${path}`;
}
