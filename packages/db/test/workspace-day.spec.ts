import { describe, expect, it } from "bun:test";
import { nextWorkspaceDayStart, workspaceDayStart } from "../src/day";

describe("the workspace day", () => {
	it("starts at midnight in London in summer time", () => {
		const now = new Date("2026-07-15T23:30:00Z");

		expect(workspaceDayStart(now).toISOString()).toBe(
			"2026-07-15T23:00:00.000Z",
		);
		expect(nextWorkspaceDayStart(now).toISOString()).toBe(
			"2026-07-16T23:00:00.000Z",
		);
	});

	it("starts at midnight in London in winter time", () => {
		const now = new Date("2026-12-01T09:00:00Z");

		expect(workspaceDayStart(now).toISOString()).toBe(
			"2026-12-01T00:00:00.000Z",
		);
		expect(nextWorkspaceDayStart(now).toISOString()).toBe(
			"2026-12-02T00:00:00.000Z",
		);
	});

	it("handles the night the clocks go back", () => {
		const now = new Date("2026-10-25T12:00:00Z");

		expect(workspaceDayStart(now).toISOString()).toBe(
			"2026-10-24T23:00:00.000Z",
		);
		expect(nextWorkspaceDayStart(now).toISOString()).toBe(
			"2026-10-26T00:00:00.000Z",
		);
	});
});
