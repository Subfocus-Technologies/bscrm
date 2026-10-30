import { describe, expect, it } from "bun:test";
import { setDeveloperFolderInput } from "../src/workspace/workspace.contracts";

describe("the developer folder", () => {
	it("takes a full path", () => {
		expect(
			setDeveloperFolderInput.parse({ folder: " /Users/sayu/bscrm " }).folder,
		).toBe("/Users/sayu/bscrm");
		expect(
			setDeveloperFolderInput.parse({ folder: "C:\\code\\crm" }).folder,
		).toBe("C:\\code\\crm");
	});

	it("takes a blank to remove the button", () => {
		expect(setDeveloperFolderInput.parse({ folder: "" }).folder).toBe("");
	});

	it("refuses anything else", () => {
		expect(setDeveloperFolderInput.safeParse({ folder: "bscrm" }).success).toBe(
			false,
		);
	});
});
