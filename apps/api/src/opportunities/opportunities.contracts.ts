import {
	OPPORTUNITY_KINDS,
	OPPORTUNITY_VIEWS,
} from "@crm/validation/opportunities";
import { z } from "zod";

export const opportunityKindInput = z.object({
	kind: z.enum(OPPORTUNITY_KINDS),
});

export const opportunitiesListInput = z.object({
	kind: z.enum(OPPORTUNITY_KINDS),
	view: z.enum(OPPORTUNITY_VIEWS).default("SUGGESTED"),
	page: z.number().int().min(1).default(1),
});

export type OpportunitiesListInput = z.infer<typeof opportunitiesListInput>;

const opportunityOwnerOutput = z
	.object({ id: z.string(), name: z.string() })
	.nullable();

export const opportunityOutput = z.object({
	id: z.string(),
	kind: z.enum(OPPORTUNITY_KINDS),
	title: z.string(),
	organiser: z.string().nullable(),
	url: z.string(),
	summary: z.string(),
	quote: z.string(),
	location: z.string().nullable(),
	startsAt: z.string().nullable(),
	deadlineAt: z.string().nullable(),
	business: z.object({ id: z.string(), name: z.string() }).nullable(),
	status: z.enum(OPPORTUNITY_VIEWS),
	owner: opportunityOwnerOutput,
	decidedBy: z.string().nullable(),
	decidedAt: z.string().nullable(),
});

export type OpportunityOutput = z.infer<typeof opportunityOutput>;

const reviewOutput = z
	.object({
		state: z.enum(["waiting", "running", "finished", "failed"]),
		requestedAt: z.string(),
		finishedAt: z.string().nullable(),
		outcome: z.string().nullable(),
	})
	.nullable();

export const opportunitiesListOutput = z.object({
	items: z.array(opportunityOutput),
	total: z.number(),
	pageSize: z.number(),
	counts: z.object({
		SUGGESTED: z.number(),
		PLANNED: z.number(),
		DONE: z.number(),
		DISMISSED: z.number(),
	}),
	review: reviewOutput,
});

export const opportunityReviewOutput = z.object({ queued: z.boolean() });

export const opportunityUpdateInput = z
	.object({
		id: z.string().min(1),
		status: z.enum(OPPORTUNITY_VIEWS).optional(),
		ownerId: z.string().min(1).nullable().optional(),
	})
	.refine(
		(input) => input.status !== undefined || input.ownerId !== undefined,
		{
			message: "Say what to change.",
		},
	);

export type OpportunityUpdateInput = z.infer<typeof opportunityUpdateInput>;
