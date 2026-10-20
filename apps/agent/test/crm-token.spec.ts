import { describe, expect, it } from "bun:test";
import {
	finalWords,
	noteTaskMessage,
	taskFromToken,
	taskToken,
} from "../agent/channels/crm";

const TASK_ID = "cmsdc0a6j004cz96ddzpcgwqr";

describe("taskFromToken", () => {
	it("reads back a token this channel minted", () => {
		expect(taskFromToken(taskToken(TASK_ID))).toBe(TASK_ID);
	});

	it("reads the token as the channel context presents it", () => {
		expect(taskFromToken(`crm:${taskToken(TASK_ID)}`)).toBe(TASK_ID);
	});

	it("still reads the doubly-prefixed form written before the fix", () => {
		expect(taskFromToken(`crm:crm:task:${TASK_ID}`)).toBe(TASK_ID);
	});

	it("ignores a token that is not a task", () => {
		expect(
			taskFromToken("crm:adhoc:0f6c1e2a-1111-2222-3333-444455556666"),
		).toBeNull();
		expect(
			taskFromToken("eve:9ebb3820-ee00-4f35-bd38-d5147b89bd71"),
		).toBeNull();
		expect(taskFromToken(undefined)).toBeNull();
		expect(taskFromToken("crm:task:")).toBeNull();
	});
});

describe("a task's final words", () => {
	it("records the agent's last message instead of a bare ran", () => {
		const token = taskToken(TASK_ID);

		noteTaskMessage(token, "Searching now.");
		noteTaskMessage(token, "  I found no UK pre-seed proptech angels.  ");

		expect(finalWords(token)).toBe("I found no UK pre-seed proptech angels.");
		expect(finalWords(token)).toBe("ran");
	});

	it("says ran when the agent said nothing", () => {
		expect(finalWords(taskToken("silent-task"))).toBe("ran");
		expect(finalWords(undefined)).toBe("ran");
	});
});
