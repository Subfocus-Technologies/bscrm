import { INVESTORS } from "@crm/validation/investors";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { investorFocus } from "../lib/focus";
import { draftInvestorEmail } from "../lib/investor-outreach";

export default defineTool({
	description: `Save an email to the investor this investor-outreach task is about, as a draft a person reviews and sends from their own Gmail. Nothing is sent by this tool. Plain text, at most ${INVESTORS.outreach.maxWords} words, no sign-off name. A follow-up keeps the first email's subject automatically. Calling it again replaces the waiting draft.`,
	inputSchema: z.object({
		subject: z
			.string()
			.trim()
			.min(1)
			.max(INVESTORS.outreach.subjectMaxLength)
			.describe("A short, specific subject line."),
		body: z
			.string()
			.trim()
			.min(1)
			.max(INVESTORS.outreach.bodyMaxLength)
			.describe("The email, plain text, without a signature."),
	}),
	async execute({ subject, body }) {
		const { investorId } = investorFocus();
		if (!investorId) {
			return {
				ok: false as const,
				reason: "This session is not about an investor.",
			};
		}

		return draftInvestorEmail({ investorId, subject, body });
	},
});
