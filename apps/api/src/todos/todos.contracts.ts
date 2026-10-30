import { TODO_SUGGESTION_VIEWS, TODOS } from "@crm/validation/todos";
import { z } from "zod";

export const suggestionsInput = z.object({
	view: z.enum(TODO_SUGGESTION_VIEWS).default("PROPOSED"),
	page: z.number().int().min(1).default(1),
});

export type SuggestionsInput = z.infer<typeof suggestionsInput>;

const suggestionSourceOutput = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("email"),
		emailThreadId: z.string(),
		subject: z.string().nullable(),
		from: z.string().nullable(),
		lastMessageAt: z.string(),
		hasDraft: z.boolean(),
	}),
	z.object({
		kind: z.literal("meeting"),
		calendarEventId: z.string(),
		title: z.string().nullable(),
		startsAt: z.string(),
	}),
	z.object({
		kind: z.literal("note"),
		incomingMeetingNoteId: z.string(),
		title: z.string(),
		heldAt: z.string(),
	}),
]);

const suggestionRecordOutput = z
	.object({
		kind: z.enum(["contact", "company"]),
		id: z.string(),
		name: z.string(),
	})
	.nullable();

export const suggestionOutput = z.object({
	id: z.string(),
	kind: z.enum(["REPLY", "TODO"]),
	title: z.string(),
	detail: z.string().nullable(),
	dueAt: z.string().nullable(),
	quote: z.string(),
	status: z.enum(["PROPOSED", "ACCEPTED", "DONE", "IGNORED"]),
	createdAt: z.string(),
	decidedAt: z.string().nullable(),
	taskId: z.string().nullable(),
	source: suggestionSourceOutput.nullable(),
	record: suggestionRecordOutput,
});

export type SuggestionOutput = z.infer<typeof suggestionOutput>;

export const suggestionsOutput = z.object({
	items: z.array(suggestionOutput),
	total: z.number(),
	pageSize: z.number(),
	canAddToCalendar: z.boolean(),
	counts: z.object({
		PROPOSED: z.number(),
		IGNORED: z.number(),
	}),
});

export const suggestionIdInput = z.object({ id: z.string().min(1) });

export const suggestionDecisionOutput = z.object({
	id: z.string(),
	status: z.enum(["PROPOSED", "ACCEPTED", "DONE", "IGNORED"]),
	taskId: z.string().nullable(),
});

export const threadReplyInput = z.object({
	emailThreadId: z.string().min(1),
});

export const threadReplyOutput = z.object({
	emailThreadId: z.string(),
	toEmail: z.string().nullable(),
	fromEmail: z.string(),
	subject: z.string(),
	draft: z
		.object({
			id: z.string(),
			body: z.string(),
			updatedAt: z.string(),
		})
		.nullable(),
	drafting: z.boolean(),
	canSend: z.boolean(),
});

export type ThreadReplyOutput = z.infer<typeof threadReplyOutput>;

export const requestReplyInput = z.object({
	emailThreadId: z.string().min(1),
	instructions: z
		.string()
		.trim()
		.max(
			TODOS.reply.instructionsMaxLength,
			`Keep the instructions to ${TODOS.reply.instructionsMaxLength} characters.`,
		)
		.optional(),
});

export type RequestReplyInput = z.infer<typeof requestReplyInput>;

export const requestReplyOutput = z.object({ queued: z.boolean() });

export const sendReplyInput = z.object({
	emailThreadId: z.string().min(1),
	subject: z
		.string()
		.trim()
		.min(1, "Add a subject.")
		.max(TODOS.reply.subjectMaxLength),
	body: z
		.string()
		.trim()
		.min(1, "Write the reply first.")
		.max(TODOS.reply.bodyMaxLength),
});

export type SendReplyInput = z.infer<typeof sendReplyInput>;

export const sendReplyOutput = z.object({
	id: z.string(),
	sentAt: z.string(),
	toEmail: z.string(),
});

export const discardReplyOutput = z.object({ discarded: z.number() });

export const addTodoInput = z.object({
	title: z
		.string()
		.trim()
		.min(1, "Say what needs doing.")
		.max(TODOS.suggestions.titleMaxLength),
	notes: z.string().trim().max(TODOS.suggestions.detailMaxLength).optional(),
	dueAt: z.string().datetime().nullable().optional(),
	contactId: z.string().optional(),
	companyId: z.string().optional(),
});

export type AddTodoInput = z.infer<typeof addTodoInput>;

export const addTodoOutput = z.object({ id: z.string() });

export const scheduleOutput = z.object({
	id: z.string(),
	status: z.enum(["PROPOSED", "ACCEPTED", "DONE", "IGNORED"]),
	taskId: z.string().nullable(),
	startsAt: z.string(),
	endsAt: z.string(),
	eventUrl: z.string().nullable(),
});
