import { OPPORTUNITIES } from "@crm/validation/opportunities";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { opportunityFocus } from "../lib/focus";
import { saveOpportunities } from "../lib/opportunities";

const text = z.string().max(OPPORTUNITIES.text.shortMaxLength);

export default defineTool({
	description: `Save the events, awards or speaking slots you found, for the team to review. Use it in an opportunity review; the task already says which kind. Call it once with up to ${OPPORTUNITIES.review.perRun} items. Each item needs the organiser's own page and the exact words on it. An item is dropped when its date has passed, its link does not open, or it is already on our list. Nothing is booked or applied for.`,
	inputSchema: z.object({
		items: z
			.array(
				z.object({
					title: z
						.string()
						.max(OPPORTUNITIES.text.titleMaxLength)
						.describe("The official name, with the year when it has one."),
					organiser: text.nullable().describe("Who runs it, or null."),
					url: z
						.string()
						.max(OPPORTUNITIES.text.urlMaxLength)
						.describe("The organiser's own page, which you read."),
					summary: z
						.string()
						.max(OPPORTUNITIES.text.summaryMaxLength)
						.describe("Why this fits us, in one or two plain sentences."),
					quote: z
						.string()
						.max(OPPORTUNITIES.text.quoteMaxLength)
						.describe(
							"The exact words on the page that show the date or the fit.",
						),
					location: text.nullable().describe("City and venue, or null."),
					startDate: z
						.string()
						.nullable()
						.describe("YYYY-MM-DD from the page, or null."),
					deadlineDate: z
						.string()
						.nullable()
						.describe(
							"The entry or application deadline, YYYY-MM-DD, or null.",
						),
					businessId: z
						.string()
						.nullable()
						.describe("The id of the business of ours it fits best, or null."),
				}),
			)
			.max(OPPORTUNITIES.review.perRun),
	}),
	async execute({ items }) {
		const kind = opportunityFocus();
		if (!kind) {
			return {
				ok: false as const,
				reason: "This session is not an opportunity review.",
			};
		}

		return saveOpportunities(kind, items);
	},
});
