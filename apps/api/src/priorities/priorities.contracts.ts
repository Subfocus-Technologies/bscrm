import { PRIORITIES, PRIORITY_STATUSES } from "@crm/validation/priorities";
import { z } from "zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.");

const title = z
	.string()
	.trim()
	.min(1, "Say what the priority is.")
	.max(PRIORITIES.text.titleMaxLength);

const deliverable = z
	.string()
	.trim()
	.max(PRIORITIES.text.deliverableMaxLength)
	.nullable();

export const prioritiesWeekInput = z.object({
	week: day.optional(),
	ownerId: z.string().min(1).optional(),
});

export type PrioritiesWeekInput = z.infer<typeof prioritiesWeekInput>;

export const priorityOutput = z.object({
	id: z.string(),
	title: z.string(),
	deliverable: z.string().nullable(),
	status: z.enum(PRIORITY_STATUSES),
	dueAt: z.string().nullable(),
	completedAt: z.string().nullable(),
	carriedOver: z.boolean(),
	owner: z.object({ id: z.string(), name: z.string() }).nullable(),
	createdBy: z.string(),
	updatedBy: z.string(),
	updatedAt: z.string(),
});

export type PriorityOutput = z.infer<typeof priorityOutput>;

const columnOutput = z.object({
	items: z.array(priorityOutput),
	total: z.number(),
});

export const prioritiesWeekOutput = z.object({
	week: day,
	thisWeek: day,
	previousWeek: day,
	nextWeek: day,
	columns: z.object({
		PRIORITY: columnOutput,
		ONGOING: columnOutput,
		DONE: columnOutput,
	}),
});

export const priorityCreateInput = z.object({
	title,
	deliverable: deliverable.optional(),
	dueDate: day.nullable().optional(),
	ownerId: z.string().min(1).nullable().optional(),
	week: day.optional(),
});

export type PriorityCreateInput = z.infer<typeof priorityCreateInput>;

export const priorityUpdateInput = z.object({
	id: z.string().min(1),
	title: title.optional(),
	deliverable: deliverable.optional(),
	dueDate: day.nullable().optional(),
	ownerId: z.string().min(1).nullable().optional(),
	status: z.enum(PRIORITY_STATUSES).optional(),
});

export type PriorityUpdateInput = z.infer<typeof priorityUpdateInput>;

export const priorityIdInput = z.object({ id: z.string().min(1) });

export const priorityRemoveOutput = z.object({ id: z.string() });
