import { z } from "zod";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const TODOS = {
	email: {
		maxAgeMs: 3 * 24 * HOUR_MS,
		settleMs: 2 * MINUTE_MS,
		dailyLimitPerUser: 60,
		messagesInBrief: 8,
		bodyMaxChars: 4_000,
		budget: 1,
	},
	meetings: {
		lookbackMs: 24 * HOUR_MS,
		settleMs: HOUR_MS,
		perTick: 5,
		budget: 1,
	},
	suggestions: {
		maxItems: 8,
		titleMaxLength: 160,
		detailMaxLength: 600,
		quoteMaxLength: 400,
		pageSize: 25,
	},
	reply: {
		maxWords: 250,
		subjectMaxLength: 200,
		bodyMaxLength: 5_000,
		instructionsMaxLength: 500,
	},
	tasks: { pageSize: 25 },
} as const;

export const TODO_SUGGESTION_VIEWS = ["PROPOSED", "IGNORED"] as const;

export type TodoSuggestionView = (typeof TODO_SUGGESTION_VIEWS)[number];

export const emailActionsPayload = z.object({
	emailThreadId: z.string().trim().min(1),
	userId: z.string().trim().min(1),
	replyRequested: z.boolean().default(false),
	instructions: z
		.string()
		.trim()
		.max(TODOS.reply.instructionsMaxLength)
		.nullable()
		.default(null),
});

export type EmailActionsPayload = z.infer<typeof emailActionsPayload>;

export const meetingActionsPayload = z.object({
	calendarEventId: z.string().trim().min(1),
	userId: z.string().trim().min(1),
});

export type MeetingActionsPayload = z.infer<typeof meetingActionsPayload>;

export const todoSuggestionItem = z.object({
	kind: z.enum(["REPLY", "TODO"]),
	title: z.string().trim().min(1).max(TODOS.suggestions.titleMaxLength),
	detail: z
		.string()
		.trim()
		.max(TODOS.suggestions.detailMaxLength)
		.nullable()
		.default(null),
	dueDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "A due date is YYYY-MM-DD.")
		.nullable()
		.default(null),
	quote: z.string().trim().min(1).max(TODOS.suggestions.quoteMaxLength),
});

export type TodoSuggestionItem = z.infer<typeof todoSuggestionItem>;

export const replyBody = z
	.string()
	.trim()
	.min(1)
	.max(TODOS.reply.bodyMaxLength);

export function wordCount(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

export function replySubject(subject: string | null): string {
	const bare = (subject ?? "").replace(/^(re:\s*)+/i, "").trim();
	return bare ? `Re: ${bare}` : "Re: your email";
}
