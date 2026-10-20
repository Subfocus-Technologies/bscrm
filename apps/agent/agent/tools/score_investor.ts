import { INVESTOR_KINDS, INVESTORS } from "@crm/validation/investors";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { scoreInvestor } from "../lib/investors";

const text = z.string().trim().max(INVESTORS.text.shortMaxLength);
const pounds = z.number().min(0).nullable().default(null);

export default defineTool({
	description: `Record how well an investor fits our raise, in an investor-research task. Give a verdict for every criterion id in the investor profile: met or not, a short note on why, and the URL you read for each one you mark as met. The tool works out the 0 to 100 fit score from the profile's weights; a met "rules them out" criterion makes it 0. You may also fill facts that are still blank, but only from what you read. Record an email only when the investor publishes it.`,
	inputSchema: z.object({
		investorId: z.string(),
		summary: z
			.string()
			.trim()
			.min(1)
			.max(INVESTORS.text.noteMaxLength)
			.describe(
				"Two sentences a founder reads: who they are and why they fit or not.",
			),
		criteria: z
			.array(
				z.object({
					criterionId: z.string(),
					met: z.boolean(),
					note: z.string().trim().min(1).max(INVESTORS.evidence.quoteMaxLength),
					sourceUrl: z.string().trim().url().nullable().default(null),
				}),
			)
			.max(INVESTORS.profile.maxCriteria),
		facts: z
			.object({
				kind: z.enum(INVESTOR_KINDS).optional(),
				website: text.nullable().optional(),
				linkedinUrl: text.nullable().optional(),
				email: z.string().trim().email().nullable().optional(),
				location: text.nullable().optional(),
				stages: z.array(text).max(INVESTORS.profile.maxValues).optional(),
				sectors: z.array(text).max(INVESTORS.profile.maxValues).optional(),
				chequeMinPounds: pounds.optional(),
				chequeMaxPounds: pounds.optional(),
				thesis: z
					.string()
					.trim()
					.max(INVESTORS.text.noteMaxLength)
					.nullable()
					.optional(),
			})
			.default({}),
	}),
	async execute({ investorId, summary, criteria, facts }) {
		const { chequeMinPounds, chequeMaxPounds, ...rest } = facts;
		return scoreInvestor({
			investorId,
			summary,
			reasons: criteria,
			facts: {
				...rest,
				chequeMin: chequeMinPounds,
				chequeMax: chequeMaxPounds,
			},
		});
	},
});
