import { TODOS } from "@crm/validation/todos";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { todoFocus } from "../lib/focus";
import { proposeTodos } from "../lib/todos";

export default defineTool({
	description: `Save the actions an email conversation, a finished meeting or a set of meeting notes needs, for the mailbox owner to review on their To-do page. Call it once with every item; a second call replaces the suggestions still waiting. Each item quotes the exact words in the source it comes from, or it is dropped. A REPLY item needs the reply text in \`reply\`, at most ${TODOS.reply.maxWords} words, saved as a draft. Nothing is sent and nothing becomes a task until a person approves it.`,
	inputSchema: z.object({
		items: z
			.array(
				z.object({
					kind: z
						.enum(["REPLY", "TODO"])
						.describe(
							"REPLY when the other side is waiting for an answer; TODO for anything else to do.",
						),
					title: z
						.string()
						.max(TODOS.suggestions.titleMaxLength)
						.describe("Short and actionable, starting with a verb."),
					detail: z
						.string()
						.max(TODOS.suggestions.detailMaxLength)
						.nullable()
						.describe("Context a person needs to act on it, or null."),
					dueDate: z
						.string()
						.nullable()
						.describe(
							"YYYY-MM-DD when the source gives a time, otherwise null.",
						),
					quote: z
						.string()
						.max(TODOS.suggestions.quoteMaxLength)
						.describe("The exact words in the source this item comes from."),
				}),
			)
			.max(TODOS.suggestions.maxItems),
		reply: z
			.string()
			.max(TODOS.reply.bodyMaxLength)
			.nullable()
			.describe(
				"The reply to send, plain text without a sign-off name, when there is a REPLY item; otherwise null.",
			),
	}),
	async execute({ items, reply }) {
		const {
			emailThreadId,
			calendarEventId,
			incomingMeetingNoteId,
			mailboxUserId,
			replyRequested,
		} = todoFocus();
		if (!mailboxUserId) {
			return {
				ok: false as const,
				reason: "This session is not about an email or a meeting.",
			};
		}

		if (emailThreadId) {
			return proposeTodos(
				{ kind: "email", emailThreadId, userId: mailboxUserId },
				items,
				reply,
				replyRequested,
			);
		}
		if (incomingMeetingNoteId) {
			return proposeTodos(
				{ kind: "note", incomingMeetingNoteId, userId: mailboxUserId },
				items,
				null,
			);
		}
		if (calendarEventId) {
			return proposeTodos(
				{ kind: "meeting", calendarEventId, userId: mailboxUserId },
				items,
				null,
			);
		}

		return {
			ok: false as const,
			reason: "This session is not about an email or a meeting.",
		};
	},
});
