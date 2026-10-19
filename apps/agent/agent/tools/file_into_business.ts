import { BUSINESS_FILING } from "@crm/validation/business-filing";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { fileIntoBusiness } from "../lib/business-filing";
import { focusOn } from "../lib/focus";

export default defineTool({
	description: `File a company or contact into one of our businesses, citing what shows it belongs there. Cite emails and meetings by the ids read_crm_history and read_company_history return; a "record" item cites the record's own profile and is weaker. The tool decides, not you: it files directly only when the record is in no business yet and a cited email or meeting really involves it. Otherwise it leaves a suggestion for a person. It refuses a business a person already ruled out.`,
	inputSchema: z.object({
		entity: z.enum(["COMPANY", "CONTACT"]),
		recordId: z.string().describe("The id of the company or contact."),
		businessId: z
			.string()
			.describe("The business id, exactly as list_businesses reports it."),
		reason: z
			.string()
			.max(BUSINESS_FILING.reason.maxLength)
			.describe(
				"One plain sentence a person will read: why this record belongs to this business.",
			),
		evidence: z
			.array(
				z.object({
					kind: z.enum(["email", "meeting", "record"]),
					id: z
						.string()
						.describe(
							"The email thread id, the meeting id, or for kind record the record's own id.",
						),
					quote: z
						.string()
						.max(BUSINESS_FILING.evidence.quoteMaxLength)
						.describe("The few words in that source that show it."),
				}),
			)
			.max(BUSINESS_FILING.evidence.maxItems),
	}),
	async execute({ entity, recordId, businessId, reason, evidence }) {
		if (entity === "COMPANY") focusOn({ companyId: recordId });
		if (entity === "CONTACT") focusOn({ contactId: recordId });

		return fileIntoBusiness({
			record:
				entity === "COMPANY"
					? { kind: "company", id: recordId }
					: { kind: "contact", id: recordId },
			businessId,
			reason,
			evidence,
		});
	},
});
