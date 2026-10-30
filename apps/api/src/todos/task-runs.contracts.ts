import { TASK_RUNS, taskRunAction } from "@crm/validation/task-runs";
import { z } from "zod";

const RUN_STATES = [
	"QUEUED",
	"WORKING",
	"AWAITING_APPROVAL",
	"FINISHED",
	"FAILED",
] as const;

export const taskRunStartInput = z.object({
	taskId: z.string().min(1),
	instructions: z
		.string()
		.trim()
		.max(TASK_RUNS.instructionsMaxLength)
		.optional(),
});

export type TaskRunStartInput = z.infer<typeof taskRunStartInput>;

export const taskRunStartOutput = z.object({ id: z.string() });

const taskRunActionOutput = z.object({
	id: z.string(),
	why: z.string(),
	status: z.enum(["PROPOSED", "RUNNING", "DONE", "SKIPPED", "FAILED"]),
	result: z.string().nullable(),
	payload: taskRunAction,
	decidedBy: z.string().nullable(),
});

export const taskRunOutput = z.object({
	id: z.string(),
	taskId: z.string(),
	taskTitle: z.string(),
	status: z.enum(RUN_STATES),
	instructions: z.string().nullable(),
	summary: z.string().nullable(),
	deliverable: z.string().nullable(),
	failure: z.string().nullable(),
	createdAt: z.string(),
	actions: z.array(taskRunActionOutput),
	canSendEmail: z.boolean(),
	canAddToCalendar: z.boolean(),
});

export type TaskRunOutput = z.infer<typeof taskRunOutput>;

export const taskRunIdInput = z.object({ id: z.string().min(1) });

export const taskRunsListInput = z.object({
	page: z.number().int().min(1).default(1),
});

export type TaskRunsListInput = z.infer<typeof taskRunsListInput>;

export const taskRunsListOutput = z.object({
	items: z.array(
		z.object({
			id: z.string(),
			taskId: z.string(),
			taskTitle: z.string(),
			summary: z.string().nullable(),
			waiting: z.number(),
			createdAt: z.string(),
		}),
	),
	total: z.number(),
	pageSize: z.number(),
});

export const taskRunStatusesInput = z.object({
	taskIds: z.array(z.string().min(1)).max(TASK_RUNS.listPageSize),
});

export const taskRunStatusesOutput = z.array(
	z.object({
		taskId: z.string(),
		runId: z.string(),
		status: z.enum(RUN_STATES),
		waiting: z.number(),
	}),
);

export const taskRunApproveInput = z.object({
	actionId: z.string().min(1),
	payload: taskRunAction,
});

export type TaskRunApproveInput = z.infer<typeof taskRunApproveInput>;

export const taskRunActionIdInput = z.object({ actionId: z.string().min(1) });

export const taskRunDecisionOutput = z.object({
	id: z.string(),
	status: z.enum(["PROPOSED", "RUNNING", "DONE", "SKIPPED", "FAILED"]),
	result: z.string().nullable(),
});
