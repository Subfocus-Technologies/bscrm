import { LESSON_SCOPES, LESSONS, lessonText } from "@crm/validation/lessons";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { lessonFocus } from "../lib/focus";
import { saveLessons } from "../lib/lessons";

export default defineTool({
	description: `Save what this lesson review taught you. Call it once, with empty lists when there is nothing to learn. Every later task reads these lessons, and people can see and remove them.`,
	inputSchema: z.object({
		add: z
			.array(
				z.object({
					scope: z
						.enum(LESSON_SCOPES)
						.describe(
							"PERSONAL for how this person works, TEAM for a fact everyone needs.",
						),
					text: lessonText.describe("One plain instruction."),
				}),
			)
			.max(LESSONS.maxPerReview),
		retire: z
			.array(z.string())
			.max(LESSONS.maxRetiredPerReview)
			.describe("Ids of lessons the evidence contradicts."),
	}),
	async execute({ add, retire }) {
		const source = lessonFocus();
		if (!source) {
			return {
				ok: false as const,
				reason: "This session is not a lesson review.",
			};
		}

		return saveLessons(source, { add, retire });
	},
});
