import { describe, expect, it } from "bun:test";
import { markdownToPlainText, withoutEmDashes } from "../src/plain-text";

describe("withoutEmDashes", () => {
	it("turns a dash between words into a comma", () => {
		expect(withoutEmDashes("Quick one — could you check?")).toBe(
			"Quick one, could you check?",
		);
		expect(withoutEmDashes("Quick one—could you check?")).toBe(
			"Quick one, could you check?",
		);
	});

	it("keeps a number range as a plain hyphen", () => {
		expect(withoutEmDashes("Pages 10–12")).toBe("Pages 10-12");
	});

	it("removes a dash that starts or ends a line and keeps the lines", () => {
		expect(withoutEmDashes("— First\nSecond —\nThird")).toBe(
			"First\nSecond\nThird",
		);
	});

	it("leaves a hyphen alone", () => {
		expect(withoutEmDashes("follow-up")).toBe("follow-up");
	});
});

describe("markdownToPlainText", () => {
	it("removes headings and bold marks", () => {
		expect(markdownToPlainText("## Title\n\n**Bold** words")).toBe(
			"Title\n\nBold words",
		);
	});
});
