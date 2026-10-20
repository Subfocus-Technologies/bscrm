import { INVESTORS, type InvestorKind } from "@crm/validation/investors";
import { z } from "zod";

export const IMPORT_FIELDS = [
	{ key: "name", label: "Name", required: true },
	{ key: "kind", label: "Type" },
	{ key: "firm", label: "Firm" },
	{ key: "website", label: "Website" },
	{ key: "linkedinUrl", label: "LinkedIn" },
	{ key: "email", label: "Email" },
	{ key: "location", label: "Location" },
	{ key: "stages", label: "Stages" },
	{ key: "sectors", label: "Sectors" },
	{ key: "chequeMin", label: "Smallest cheque (£)" },
	{ key: "chequeMax", label: "Largest cheque (£)" },
	{ key: "thesis", label: "Thesis" },
	{ key: "notes", label: "Notes" },
] as const;

type ImportField = (typeof IMPORT_FIELDS)[number]["key"];

export const sheetCell = z
	.union([z.string(), z.number(), z.boolean(), z.date(), z.null()])
	.catch(null);

export type SheetCell = z.infer<typeof sheetCell> | undefined;

export type ColumnMapping = Partial<Record<ImportField, number>>;

export type PreparedSheet = { rows: PreparedRow[]; skipped: number };

type PreparedRow = {
	name: string;
	kind: InvestorKind;
	firm: string | null;
	website: string | null;
	linkedinUrl: string | null;
	email: string | null;
	location: string | null;
	stages: string[];
	sectors: string[];
	chequeMinCents: number | null;
	chequeMaxCents: number | null;
	thesis: string | null;
	notes: string | null;
};

const HEADER_HINTS = {
	name: /^(full ?name|name|investor|investor name|contact|contact name|person)$/,
	kind: /^(type|investor type|kind|category)$/,
	firm: /(firm|fund|company|organi[sz]ation|group|network)/,
	website: /(website|web|url|site|domain)/,
	linkedinUrl: /linked ?in/,
	email: /e-?mail/,
	location: /(location|city|country|region|hq|based)/,
	stages: /(stage|round)/,
	sectors: /(sector|industr|focus|vertical)/,
	chequeMin:
		/(min|minimum|smallest).*(cheque|check|ticket|investment)|(cheque|check|ticket).*(min|from)/,
	chequeMax:
		/(max|maximum|largest).*(cheque|check|ticket|investment)|(cheque|check|ticket).*(max|to)|^(cheque|check|ticket)( size)?$/,
	thesis: /(thesis|description|about|bio|summary)/,
	notes: /(note|comment)/,
} satisfies Record<ImportField, RegExp>;

const GUESS_ORDER: readonly ImportField[] = [
	"linkedinUrl",
	"email",
	"chequeMin",
	"chequeMax",
	"name",
	"kind",
	"firm",
	"website",
	"location",
	"stages",
	"sectors",
	"thesis",
	"notes",
];

const KIND_HINTS: [RegExp, InvestorKind][] = [
	[/angel (group|network|syndicate|club)|syndicate|network/, "ANGEL_GROUP"],
	[/angel|individual|business angel/, "ANGEL"],
	[/family office/, "FAMILY_OFFICE"],
	[/corporate|cvc/, "CORPORATE_VC"],
	[/accelerator|incubator/, "ACCELERATOR"],
	[/vc|venture|fund|capital/, "VC"],
];

function clean(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[_\-.]+/g, " ")
		.replace(/\s+/g, " ");
}

export function guessMapping(headers: readonly string[]): ColumnMapping {
	const mapping: ColumnMapping = {};
	const used = new Set<number>();

	for (const field of GUESS_ORDER) {
		const index = headers.findIndex(
			(header, position) =>
				!used.has(position) && HEADER_HINTS[field].test(clean(header)),
		);
		if (index >= 0) {
			mapping[field] = index;
			used.add(index);
		}
	}

	return mapping;
}

function text(value: SheetCell): string {
	if (value === null || value === undefined) return "";
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	return String(value).trim();
}

function optional(
	value: SheetCell,
	maxLength: number = INVESTORS.text.shortMaxLength,
): string | null {
	const trimmed = text(value).slice(0, maxLength);
	return trimmed ? trimmed : null;
}

function list(value: SheetCell): string[] {
	return text(value)
		.split(/[;,|/\n]+/)
		.map((item) => item.trim().slice(0, INVESTORS.profile.valueMaxLength))
		.filter(Boolean)
		.slice(0, INVESTORS.profile.maxValues);
}

export function parsePounds(value: SheetCell): number | null {
	const raw = text(value)
		.toLowerCase()
		.replace(/[£$€,\s]/g, "");
	const match = /^(\d+(?:\.\d+)?)(k|m|bn|b)?$/.exec(raw);
	if (!match?.[1]) return null;

	const scale = { k: 1_000, m: 1_000_000, b: 1_000_000_000, bn: 1_000_000_000 };
	const unit = match[2] as keyof typeof scale | undefined;
	return Math.round(Number(match[1]) * (unit ? scale[unit] : 1) * 100);
}

export function kindOf(value: SheetCell): InvestorKind {
	const raw = clean(text(value));
	if (!raw) return "OTHER";
	return KIND_HINTS.find(([pattern]) => pattern.test(raw))?.[1] ?? "OTHER";
}

function email(value: SheetCell): string | null {
	const raw = text(value).toLowerCase();
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null;
}

export function prepareRows(
	rows: readonly (readonly SheetCell[])[],
	mapping: ColumnMapping,
): PreparedSheet {
	const cell = (row: readonly SheetCell[], field: ImportField): SheetCell => {
		const index = mapping[field];
		return index === undefined ? null : row[index];
	};

	const prepared: PreparedRow[] = [];
	let skipped = 0;

	for (const row of rows) {
		const name = text(cell(row, "name")).slice(
			0,
			INVESTORS.text.shortMaxLength,
		);
		if (!name) {
			skipped += 1;
			continue;
		}

		prepared.push({
			name,
			kind: kindOf(cell(row, "kind")),
			firm: optional(cell(row, "firm")),
			website: optional(cell(row, "website")),
			linkedinUrl: optional(cell(row, "linkedinUrl")),
			email: email(cell(row, "email")),
			location: optional(cell(row, "location")),
			stages: list(cell(row, "stages")),
			sectors: list(cell(row, "sectors")),
			chequeMinCents: parsePounds(cell(row, "chequeMin")),
			chequeMaxCents: parsePounds(cell(row, "chequeMax")),
			thesis: optional(cell(row, "thesis"), INVESTORS.text.longMaxLength),
			notes: optional(cell(row, "notes"), INVESTORS.text.longMaxLength),
		});
	}

	return { rows: prepared, skipped };
}
