import { defineTool } from "eve/tools";
import { z } from "zod";
import { listFilingBusinesses } from "../lib/business-filing";

export default defineTool({
	description:
		"List our businesses with their ids and playbooks. A playbook says who buys from that business, what it sells, and what a good lead looks like. Free. Call it before file_into_business when you do not already have the ids.",
	inputSchema: z.object({}),
	async execute() {
		const businesses = await listFilingBusinesses();

		return {
			businesses,
			note:
				businesses.length === 0
					? "There are no businesses yet, so there is nowhere to file anything."
					: "File a record only where its history matches a playbook.",
		};
	},
});
