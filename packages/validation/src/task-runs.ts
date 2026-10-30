import { z } from "zod";
import { withoutEmDashes } from "./plain-text";

export const TASK_RUNS = {
	budget: 8,
	summaryMaxLength: 2_000,
	deliverableMaxLength: 40_000,
	whyMaxLength: 300,
	instructionsMaxLength: 1_000,
	maxActions: 6,
	listPageSize: 25,
	event: { defaultMinutes: 30, maxAttendees: 10 },
	email: {
		subjectMaxLength: 200,
		bodyMaxLength: 8_000,
		maxCopied: 5,
	},
	todo: { titleMaxLength: 160 },
	repo: {
		maxFiles: 10,
		fileMaxLength: 100_000,
		readMaxChars: 30_000,
		listMax: 200,
		searchMax: 15,
		titleMaxLength: 120,
		bodyMaxLength: 4_000,
		timeoutMs: 20_000,
	},
} as const;

const address = z.string().trim().toLowerCase().email();

function writing(maxLength: number) {
	return z.string().trim().max(maxLength).overwrite(withoutEmDashes);
}

function requiredWriting(maxLength: number) {
	return z.string().trim().min(1).max(maxLength).overwrite(withoutEmDashes);
}

export const emailAction = z.object({
	kind: z.literal("EMAIL"),
	to: z.union([z.literal(""), address]),
	cc: z.array(address).max(TASK_RUNS.email.maxCopied).default([]),
	subject: requiredWriting(TASK_RUNS.email.subjectMaxLength),
	body: requiredWriting(TASK_RUNS.email.bodyMaxLength),
	emailThreadId: z.string().trim().min(1).nullable().default(null),
});

export const eventAction = z.object({
	kind: z.literal("EVENT"),
	title: requiredWriting(TASK_RUNS.todo.titleMaxLength),
	description: writing(TASK_RUNS.email.bodyMaxLength).default(""),
	startsAt: z.string().datetime().nullable().default(null),
	minutes: z
		.number()
		.int()
		.min(15)
		.max(480)
		.default(TASK_RUNS.event.defaultMinutes),
	attendees: z.array(address).max(TASK_RUNS.event.maxAttendees).default([]),
});

export const todoAction = z.object({
	kind: z.literal("TODO"),
	title: requiredWriting(TASK_RUNS.todo.titleMaxLength),
	dueDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "A due date is YYYY-MM-DD.")
		.nullable()
		.default(null),
});

export const pullRequestAction = z.object({
	kind: z.literal("PULL_REQUEST"),
	repo: z
		.string()
		.trim()
		.regex(/^[\w.-]+\/[\w.-]+$/, "A repo is owner/name."),
	title: z.string().trim().min(1).max(TASK_RUNS.repo.titleMaxLength),
	body: z.string().trim().max(TASK_RUNS.repo.bodyMaxLength).default(""),
	files: z
		.array(
			z.object({
				path: z.string().trim().min(1).max(300),
				content: z.string().max(TASK_RUNS.repo.fileMaxLength),
			}),
		)
		.min(1)
		.max(TASK_RUNS.repo.maxFiles),
});

export const taskRunAction = z.discriminatedUnion("kind", [
	emailAction,
	eventAction,
	todoAction,
	pullRequestAction,
]);

export type TaskRunActionPayload = z.infer<typeof taskRunAction>;

export function parseTaskRunAction(value: unknown): TaskRunActionPayload {
	return taskRunAction.parse(value);
}

export const taskRunPayload = z.object({
	taskRunId: z.string().trim().min(1),
});

export const taskRunPullRequestPayload = z.object({
	actionId: z.string().trim().min(1),
});
