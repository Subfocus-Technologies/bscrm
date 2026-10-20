import { describe, expect, it } from "bun:test";
import {
	guessMapping,
	kindOf,
	parsePounds,
	prepareRows,
} from "../lib/investor-import";

describe("reading an investor spreadsheet", () => {
	it("guesses which column is which from the headers", () => {
		expect(
			guessMapping([
				"Investor Name",
				"Fund",
				"Email Address",
				"LinkedIn URL",
				"Website",
				"Investor Type",
				"Sectors",
				"Min cheque",
				"Max cheque",
			]),
		).toEqual({
			name: 0,
			firm: 1,
			email: 2,
			linkedinUrl: 3,
			website: 4,
			kind: 5,
			sectors: 6,
			chequeMin: 7,
			chequeMax: 8,
		});
	});

	it("reads cheque sizes written the way people write them", () => {
		expect(parsePounds("£25k")).toBe(2_500_000);
		expect(parsePounds("250,000")).toBe(25_000_000);
		expect(parsePounds("$1.5M")).toBe(150_000_000);
		expect(parsePounds(50000)).toBe(5_000_000);
		expect(parsePounds("ask")).toBeNull();
	});

	it("turns a type into one of our investor types", () => {
		expect(kindOf("Angel Investor")).toBe("ANGEL");
		expect(kindOf("Angel network")).toBe("ANGEL_GROUP");
		expect(kindOf("VC")).toBe("VC");
		expect(kindOf("Family Office")).toBe("FAMILY_OFFICE");
		expect(kindOf("")).toBe("OTHER");
	});

	it("skips rows with no name and cleans the rest", () => {
		const prepared = prepareRows(
			[
				["Jane Smith", "Not an email", "PropTech; AI", "£10k"],
				["", "x@y.com", "", ""],
			],
			{ name: 0, email: 1, sectors: 2, chequeMin: 3 },
		);

		expect(prepared.skipped).toBe(1);
		expect(prepared.rows).toEqual([
			{
				name: "Jane Smith",
				kind: "OTHER",
				firm: null,
				website: null,
				linkedinUrl: null,
				email: null,
				location: null,
				stages: [],
				sectors: ["PropTech", "AI"],
				chequeMinCents: 1_000_000,
				chequeMaxCents: null,
				thesis: null,
				notes: null,
			},
		]);
	});
});
