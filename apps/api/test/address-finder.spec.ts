import { describe, expect, it } from "bun:test";
import { addressQuery, rankPeople } from "../src/google/address-finder.service";
import type { GmailMessage } from "../src/google/gmail.client";

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
