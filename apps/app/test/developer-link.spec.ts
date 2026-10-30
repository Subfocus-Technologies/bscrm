import { describe, expect, it } from "bun:test";
import { developerLink } from "@/lib/developer-link";

describe("developerLink", () => {
	it("opens Claude Code in the person's folder with the page in the prompt", () => {
		const link = new URL(
			developerLink(
				"/Users/sayu/My Code/bscrm",
				"https://crm.subfocustech.co.uk/bricksmart/todos?todo=mine",
			),
		);

		expect(link.protocol).toBe("claude:");
		expect(link.host).toBe("code");
		expect(link.pathname).toBe("/new");
		expect(link.searchParams.get("folder")).toBe("/Users/sayu/My Code/bscrm");
		expect(link.searchParams.get("q")).toBe(
			"I am on https://crm.subfocustech.co.uk/bricksmart/todos?todo=mine in the CRM. I want to change: ",
		);
	});
});
