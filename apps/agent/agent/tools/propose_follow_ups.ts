import { MEETING_NOTES } from "@crm/validation/meeting-notes";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { proposeFollowUps } from "../lib/meeting-notes";

export default defineTool({
	description: `Save the to-dos and next steps from one set of meeting notes, for a person to review. Call it once with every item; a second call replaces the suggestions still waiting. Each item quotes the exact words in the notes it comes from, or it is dropped. Nothing becomes a task until a person accepts it.`,
	inputSchema: z.object({
		activityId: z.string().describe("The id of the meeting notes."),
		items: z
			.array(
				z.object({
					kind: z
						.enum(["TODO", "NEXT_STEP"])
						.describe(
							"TODO when someone agreed to do something; NEXT_STEP for where the relationship goes next.",
						),
					title: z
						.string()
						.max(MEETING_NOTES.followUps.titleMaxLength)
						.describe("Short and actionable, starting with a verb."),
					detail: z
						.string()
						.max(MEETING_NOTES.followUps.detailMaxLength)
						.nullable()
						.describe("Context a person needs to act on it, or null."),
					owner: z
						.string()
						.max(MEETING_NOTES.followUps.ownerMaxLength)
						.nullable()
						.describe("Who the notes say will do it, by name, or null."),
					dueDate: z
						.string()
						.nullable()
						.describe("YYYY-MM-DD when the notes give a time, otherwise null."),
					quote: z
						.string()
						.max(MEETING_NOTES.followUps.quoteMaxLength)
						.describe("The exact words in the notes this item comes from."),
				}),
			)
			.max(MEETING_NOTES.followUps.maxItems),
	}),
	async execute({ activityId, items }) {
		return proposeFollowUps(activityId, items);
	},
});
