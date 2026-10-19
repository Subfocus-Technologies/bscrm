import { describe, expect, it } from "bun:test";
import { activityAuthor } from "../lib/activity-presentation";

describe("who an activity is shown as coming from", () => {
	it("shows the agent for an automatic entry", () => {
		expect(
			activityAuthor({
				meta: { automated: true },
				createdBy: { name: "Luke" },
			}),
		).toBe("Agent");
	});

	it("shows the person for everything else", () => {
		expect(activityAuthor({ meta: null, createdBy: { name: "Luke" } })).toBe(
			"Luke",
		);
		expect(
			activityAuthor({
				meta: { automated: "yes" },
				createdBy: { name: "Luke" },
			}),
		).toBe("Luke");
	});
});
