import {
	INVESTOR_KINDS,
	INVESTORS,
	investorTaskPayload,
} from "@crm/validation/investors";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { addDiscoveredInvestors } from "../lib/investors";

const text = z.string().trim().max(INVESTORS.text.shortMaxLength);

export default defineTool({
	description: `Add investors you found to our fundraise pipeline, for a person to approve. Use it in an investor-discovery task. Each investor needs a real name and at least one source URL you read that shows they invest at our stage or in our sector. Never invent an email address or a LinkedIn URL. Investors we already have are skipped and reported back. Each new investor is researched and scored separately afterwards.`,
	inputSchema: z.object({
		fundraiseId: z
			.string()
			.describe("The fundraise id from your instructions."),
		investors: z
			.array(
				z.object({
					name: text.min(1).describe("The person's or the firm's name."),
					kind: z.enum(INVESTOR_KINDS),
					firm: text
						.nullable()
						.default(null)
						.describe("The firm an angel or partner belongs to."),
					website: text.nullable().default(null),
					linkedinUrl: text.nullable().default(null),
					location: text.nullable().default(null),
					stages: z.array(text).max(INVESTORS.profile.maxValues).default([]),
					sectors: z.array(text).max(INVESTORS.profile.maxValues).default([]),
					thesis: z
						.string()
						.trim()
						.max(INVESTORS.text.noteMaxLength)
						.nullable()
						.default(null),
					sourceUrl: z
						.string()
						.trim()
						.url()
						.describe("The page you read that shows this investor fits."),
				}),
			)
			.min(1)
			.max(INVESTORS.discovery.perRun),
	}),
	async execute({ fundraiseId, investors }) {
		const parsed = investorTaskPayload.safeParse({ fundraiseId });
		if (!parsed.success)
			return { ok: false as const, reason: "Give the fundraise id." };

		const result = await addDiscoveredInvestors(
			fundraiseId,
			investors.map(({ sourceUrl, ...investor }) => ({
				...investor,
				sourceDetail: `Found by the agent: ${sourceUrl}`,
			})),
		);

		return { ok: true as const, ...result };
	},
});
