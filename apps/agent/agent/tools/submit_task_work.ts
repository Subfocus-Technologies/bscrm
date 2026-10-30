import { TASK_RUNS } from "@crm/validation/task-runs";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { taskRunFocus } from "../lib/focus";
import { submitTaskWork } from "../lib/task-runs";

const why = z
	.string()
	.max(TASK_RUNS.whyMaxLength)
	.describe("One line: why this step.");

export default defineTool({
	description: `Hand over a task run for approval: what you did, the finished work, and up to ${TASK_RUNS.maxActions} proposed next steps. Call it once, at the end. Nothing here is sent, booked or changed: each action waits for a person to approve it.`,
	inputSchema: z.object({
		summary: z
			.string()
			.max(TASK_RUNS.summaryMaxLength)
			.describe("What you did, what you found, and anything still missing."),
		deliverable: z
			.string()
			.max(TASK_RUNS.deliverableMaxLength)
			.nullable()
			.describe(
				"The finished work in Markdown. Null when the work is an email: the EMAIL step holds it.",
			),
		actions: z
			.array(
				z.discriminatedUnion("kind", [
					z.object({
						kind: z.literal("EMAIL"),
						why,
						to: z
							.string()
							.describe(
								"The address, or an empty string when the CRM does not hold it.",
							),
						cc: z.array(z.string()).max(TASK_RUNS.email.maxCopied),
						subject: z.string().max(TASK_RUNS.email.subjectMaxLength),
						body: z.string().max(TASK_RUNS.email.bodyMaxLength),
						emailThreadId: z
							.string()
							.nullable()
							.describe(
								"The CRM thread id when this continues a conversation.",
							),
					}),
					z.object({
						kind: z.literal("EVENT"),
						why,
						title: z.string().max(TASK_RUNS.todo.titleMaxLength),
						description: z.string().max(TASK_RUNS.email.bodyMaxLength),
						startsAt: z
							.string()
							.nullable()
							.describe("ISO date and time, or null for the first free slot."),
						minutes: z.number().int().min(15).max(480),
						attendees: z.array(z.string()).max(TASK_RUNS.event.maxAttendees),
					}),
					z.object({
						kind: z.literal("TODO"),
						why,
						title: z.string().max(TASK_RUNS.todo.titleMaxLength),
						dueDate: z.string().nullable().describe("YYYY-MM-DD, or null."),
					}),
					z.object({
						kind: z.literal("PULL_REQUEST"),
						why,
						repo: z.string().describe("owner/name, from the allowed list."),
						title: z.string().max(TASK_RUNS.repo.titleMaxLength),
						body: z.string().max(TASK_RUNS.repo.bodyMaxLength),
						files: z
							.array(
								z.object({
									path: z.string(),
									content: z
										.string()
										.max(TASK_RUNS.repo.fileMaxLength)
										.describe("The whole new content of the file."),
								}),
							)
							.max(TASK_RUNS.repo.maxFiles),
					}),
				]),
			)
			.max(TASK_RUNS.maxActions),
	}),
	async execute({ summary, deliverable, actions }) {
		const taskRunId = taskRunFocus();
		if (!taskRunId) {
			return { ok: false as const, reason: "This session is not a task run." };
		}

		return submitTaskWork(taskRunId, { summary, deliverable, actions });
	},
});
