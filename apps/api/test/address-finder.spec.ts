import { describe, expect, it } from "bun:test";
import {
	AddressFinderService,
	addressQuery,
	rankPeople,
} from "../src/google/address-finder.service";
import type { GmailClient, GmailMessage } from "../src/google/gmail.client";
import type { MailboxResult } from "../src/mailbox/mailbox-api.client";
import type {
	MailboxTokenService,
	TokenResult,
} from "../src/mailbox/mailbox-token.service";

function message(from: string, to: string, cc = ""): GmailMessage {
	return {
		payload: {
			headers: [
				{ name: "From", value: from },
				{ name: "To", value: to },
				{ name: "Cc", value: cc },
			],
		},
	};
}

const OWN = "sayu@subfocustech.co.uk";
const USER_ID = "user-1";
const CONTACT = { firstName: "Dan", lastName: "Cox", email: "dan@crm.co.uk" };
const OK_TOKEN: TokenResult = { outcome: "ok", accessToken: "token" };
const FOUND_ONE: MailboxResult<{ messages: { id: string }[] }> = {
	outcome: "ok",
	data: { messages: [{ id: "message-1" }] },
};
const DAN_MAIL: MailboxResult<GmailMessage> = {
	outcome: "ok",
	data: message(`Sayu <${OWN}>`, "Dan Cox <dan@mail.co.uk>"),
};

function finder({
	token = OK_TOKEN,
	listed = FOUND_ONE,
	read = DAN_MAIL,
	contacts = [CONTACT],
}: {
	token?: TokenResult;
	listed?: MailboxResult<{ messages: { id: string }[] }>;
	read?: MailboxResult<GmailMessage>;
	contacts?: (typeof CONTACT)[];
}) {
	const db = {
		contact: { findMany: async () => contacts },
		user: { findUniqueOrThrow: async () => ({ email: OWN }) },
	};
	const gmail = {
		searchMessages: async () => listed,
		getMessageHeaders: async () => read,
	} as unknown as GmailClient;
	const tokens = {
		accessTokenFor: async () => token,
	} as unknown as MailboxTokenService;

	return new AddressFinderService(db as never, gmail, tokens);
}

describe("addressQuery", () => {
	it("searches who an email is from, to and copied to", () => {
		expect(addressQuery("Dan Cox")).toBe(
			'from:"Dan Cox" OR to:"Dan Cox" OR cc:"Dan Cox"',
		);
	});

	it("keeps search operators out of the query", () => {
		expect(addressQuery('Dan" OR (subject:secret)')).toBe(
			'from:"Dan OR subject:secret" OR to:"Dan OR subject:secret" OR cc:"Dan OR subject:secret"',
		);
	});
});

describe("rankPeople", () => {
	it("finds a person by name in the headers", () => {
		const found = rankPeople(
			[message(`Sayu <${OWN}>`, "Dan Cox <dan@coxaccountants.co.uk>")],
			["dan", "cox"],
			OWN,
		);

		expect(found).toEqual([
			{ email: "dan@coxaccountants.co.uk", name: "Dan Cox" },
		]);
	});

	it("puts the address used most often first", () => {
		const found = rankPeople(
			[
				message(`Sayu <${OWN}>`, "Dan Cox <old@cox.co.uk>"),
				message("Dan Cox <dan@cox.co.uk>", `Sayu <${OWN}>`),
				message(`Sayu <${OWN}>`, "Dan Cox <dan@cox.co.uk>"),
			],
			["dan"],
			OWN,
		);

		expect(found.map((person) => person.email)).toEqual([
			"dan@cox.co.uk",
			"old@cox.co.uk",
		]);
	});

	it("leaves out the sender and automated addresses", () => {
		const found = rankPeople(
			[
				message("Dan Sender <noreply@cox.co.uk>", `Dan Sayu <${OWN}>`),
				message("Other Person <other@cox.co.uk>", `Dan Sayu <${OWN}>`),
			],
			["dan"],
			OWN,
		);

		expect(found).toEqual([]);
	});

	it("needs every word to match", () => {
		const found = rankPeople(
			[message("Dan Smith <dan@smith.co.uk>", `Sayu <${OWN}>`)],
			["dan", "cox"],
			OWN,
		);

		expect(found).toEqual([]);
	});
});

describe("AddressFinderService.find", () => {
	it("reports a completed Gmail search", async () => {
		const found = await finder({}).find(USER_ID, "Dan Cox");

		expect(found.gmail).toBe("searched");
		expect(found.people.map((person) => person.email)).toEqual([
			"dan@mail.co.uk",
			"dan@crm.co.uk",
		]);
	});

	it("reports a completed Gmail search that matched nobody", async () => {
		const found = await finder({
			listed: { outcome: "ok", data: { messages: [] } },
			contacts: [],
		}).find(USER_ID, "Dan Cox");

		expect(found).toEqual({ people: [], gmail: "searched" });
	});

	it("keeps contacts and reports Gmail that is not connected", async () => {
		const found = await finder({
			token: { outcome: "not-connected", reason: "No scope." },
		}).find(USER_ID, "Dan Cox");

		expect(found).toEqual({
			people: [{ email: "dan@crm.co.uk", name: "Dan Cox" }],
			gmail: "not-connected",
		});
	});

	it("reports a token that needs reconnecting", async () => {
		const found = await finder({
			token: { outcome: "needs-reconnect", reason: "Refresh failed." },
		}).find(USER_ID, "Dan Cox");

		expect(found.gmail).toBe("needs-reconnect");
	});

	it("reports a search Google refuses as needing reconnection", async () => {
		const found = await finder({
			listed: { outcome: "unauthorized", reason: "Invalid credentials." },
		}).find(USER_ID, "Dan Cox");

		expect(found.gmail).toBe("needs-reconnect");
	});

	it("reports a search that fails", async () => {
		const found = await finder({
			listed: { outcome: "failed", reason: "Timed out.", retryable: true },
		}).find(USER_ID, "Dan Cox");

		expect(found.gmail).toBe("failed");
	});

	it("reports messages that cannot be read", async () => {
		const found = await finder({
			read: { outcome: "failed", reason: "Timed out.", retryable: true },
		}).find(USER_ID, "Dan Cox");

		expect(found.gmail).toBe("failed");
	});
});
