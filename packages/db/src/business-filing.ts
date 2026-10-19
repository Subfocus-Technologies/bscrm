import type { Db } from "./client";
import { normalizeDomain } from "./domain";
import type { Prisma } from "./generated/prisma/client";
import {
	ActivityType,
	type BusinessFilingSource,
} from "./generated/prisma/enums";
import { BUSINESS_FILING_LIMIT } from "./settings";

export type FilingRecord =
	| { kind: "company"; id: string }
	| { kind: "contact"; id: string };

export type FiledMembership = {
	record: FilingRecord;
	businessId: string;
	reason: string | null;
};

type Client = Db | Prisma.TransactionClient;

type FileInput = {
	record: FilingRecord;
	businessId: string;
	source: BusinessFilingSource;
	reason: string | null;
	addedById: string | null;
};

const SOURCE_PHRASE = {
	MANUAL: "by a person",
	AGENT: "by the agent",
	RULE: "by a filing rule",
} satisfies Record<BusinessFilingSource, string>;

export function recordColumn(record: FilingRecord) {
	return record.kind === "company"
		? { companyId: record.id }
		: { contactId: record.id };
}

export function ruleDomain(input: string | null | undefined): string | null {
	return normalizeDomain(input?.trim().replace(/^@+/, ""));
}

export function ruleMailbox(input: string | null | undefined): string | null {
	const value = input?.trim().toLowerCase() ?? "";
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

export async function automatedAuthorFor(
	client: Client,
	record: { contactId?: string | null; companyId?: string | null },
): Promise<string | null> {
	if (record.contactId) {
		const contact = await client.contact.findUnique({
			where: { id: record.contactId },
			select: { ownerId: true },
		});
		if (contact?.ownerId) return contact.ownerId;
	}

	if (record.companyId) {
		const company = await client.company.findUnique({
			where: { id: record.companyId },
			select: { ownerId: true },
		});
		if (company?.ownerId) return company.ownerId;
	}

	const anyUser = await client.user.findFirst({ select: { id: true } });
	return anyUser?.id ?? null;
}

async function isRuledOut(
	client: Client,
	record: FilingRecord,
	businessId: string,
): Promise<boolean> {
	const ruling = await client.businessSuggestion.findFirst({
		where: { businessId, ...recordColumn(record), status: "DISMISSED" },
		select: { id: true },
	});
	return ruling !== null;
}

async function createMembership(
	client: Client,
	input: FileInput,
): Promise<boolean> {
	const data = {
		businessId: input.businessId,
		source: input.source,
		reason: input.reason,
		addedById: input.addedById,
	};

	const { count } =
		input.record.kind === "company"
			? await client.companyBusiness.createMany({
					data: [{ companyId: input.record.id, ...data }],
					skipDuplicates: true,
				})
			: await client.contactBusiness.createMany({
					data: [{ contactId: input.record.id, ...data }],
					skipDuplicates: true,
				});

	if (count === 0) return false;

	await client.businessSuggestion.updateMany({
		where: {
			businessId: input.businessId,
			...recordColumn(input.record),
			status: "PROPOSED",
		},
		data: {
			status: "ACCEPTED",
			decidedById: input.addedById,
			decidedAt: new Date(),
		},
	});

	return true;
}

async function fileOne(
	client: Client,
	input: FileInput,
	respectRulings: boolean,
): Promise<FiledMembership | null> {
	if (
		respectRulings &&
		(await isRuledOut(client, input.record, input.businessId))
	) {
		return null;
	}

	const created = await createMembership(client, input);
	if (!created) return null;

	return {
		record: input.record,
		businessId: input.businessId,
		reason: input.reason,
	};
}

async function followers(
	client: Client,
	record: FilingRecord,
): Promise<{ records: FilingRecord[]; reason: string }> {
	if (record.kind === "company") {
		const company = await client.company.findUnique({
			where: { id: record.id },
			select: {
				name: true,
				contacts: { where: { archivedAt: null }, select: { id: true } },
			},
		});
		return {
			records: (company?.contacts ?? []).map((contact) => ({
				kind: "contact" as const,
				id: contact.id,
			})),
			reason: `Follows its company ${company?.name ?? ""}`.trim(),
		};
	}

	const contact = await client.contact.findUnique({
		where: { id: record.id },
		select: {
			firstName: true,
			lastName: true,
			company: {
				select: { id: true, _count: { select: { businesses: true } } },
			},
		},
	});
	const company = contact?.company;
	if (!company || company._count.businesses > 0) {
		return { records: [], reason: "" };
	}

	const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
	return {
		records: [{ kind: "company", id: company.id }],
		reason: `Follows its contact ${name}`.trim(),
	};
}

async function logFiling(
	client: Client,
	filed: FiledMembership[],
	source: BusinessFilingSource,
): Promise<void> {
	if (source === "MANUAL" || filed.length === 0) return;

	const businesses = await client.business.findMany({
		where: { id: { in: [...new Set(filed.map((entry) => entry.businessId))] } },
		select: { id: true, name: true },
	});
	const nameOf = new Map(
		businesses.map((business) => [business.id, business.name]),
	);

	for (const entry of filed) {
		const column = recordColumn(entry.record);
		const author = await automatedAuthorFor(client, column);
		if (!author) continue;

		await client.activity.create({
			data: {
				type: ActivityType.ENRICHMENT,
				subject: `Filed into ${nameOf.get(entry.businessId) ?? "a business"} ${SOURCE_PHRASE[source]}`,
				body: entry.reason,
				occurredAt: new Date(),
				...column,
				createdById: author,
				meta: { automated: true, filing: source, businessId: entry.businessId },
			},
		});
	}
}

export async function fileRecord(
	client: Client,
	input: FileInput,
): Promise<FiledMembership[]> {
	const first = await fileOne(client, input, input.source !== "MANUAL");
	if (!first) return [];

	const { records, reason } = await followers(client, input.record);
	const followed: FiledMembership[] = [];

	for (const record of records) {
		const entry = await fileOne(client, { ...input, record, reason }, true);
		if (entry) followed.push(entry);
	}

	const filed = [first, ...followed];
	await logFiling(client, filed, input.source);

	return filed;
}

function threadsOf(record: FilingRecord): Prisma.EmailThreadWhereInput {
	return record.kind === "contact"
		? { contactId: record.id }
		: { OR: [{ companyId: record.id }, { contact: { companyId: record.id } }] };
}

async function domainsOf(client: Client, record: FilingRecord) {
	if (record.kind === "company") {
		const company = await client.company.findUnique({
			where: { id: record.id },
			select: { domain: true },
		});
		return [ruleDomain(company?.domain)].filter(
			(domain): domain is string => domain !== null,
		);
	}

	const contact = await client.contact.findUnique({
		where: { id: record.id },
		select: { email: true, company: { select: { domain: true } } },
	});
	const fromEmail = contact?.email?.split("@")[1];
	return [ruleDomain(fromEmail), ruleDomain(contact?.company?.domain)].filter(
		(domain): domain is string => domain !== null,
	);
}

function domainMatches(domain: string, rule: string): boolean {
	return domain === rule || domain.endsWith(`.${rule}`);
}

export async function matchingRules(
	client: Client,
	record: FilingRecord,
): Promise<{ businessId: string; reason: string }[]> {
	const rules = await client.businessRule.findMany({
		select: { businessId: true, kind: true, value: true },
	});
	if (rules.length === 0) return [];

	const domains = await domainsOf(client, record);
	const matches: { businessId: string; reason: string }[] = [];

	for (const rule of rules) {
		if (rule.kind === "EMAIL_DOMAIN") {
			if (domains.some((domain) => domainMatches(domain, rule.value))) {
				matches.push({
					businessId: rule.businessId,
					reason: `Matched the filing rule for ${rule.value}`,
				});
			}
			continue;
		}

		const received = await client.emailMessage.count({
			where: {
				thread: threadsOf(record),
				recipients: { array_contains: [{ email: rule.value }] },
			},
		});
		if (received > 0) {
			matches.push({
				businessId: rule.businessId,
				reason: `Wrote to ${rule.value}`,
			});
		}
	}

	return matches;
}

export async function applyRules(
	db: Db,
	record: FilingRecord,
): Promise<FiledMembership[]> {
	const matches = await matchingRules(db, record);
	const filed: FiledMembership[] = [];

	for (const match of matches) {
		const entries = await db.$transaction((tx) =>
			fileRecord(tx, {
				record,
				businessId: match.businessId,
				source: "RULE",
				reason: match.reason,
				addedById: null,
			}),
		);
		filed.push(...entries);
	}

	return filed;
}

export async function followCompany(
	db: Db,
	contactId: string,
): Promise<FiledMembership[]> {
	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: {
			company: {
				select: {
					name: true,
					businesses: { select: { businessId: true, source: true } },
				},
			},
		},
	});
	const company = contact?.company;
	if (!company) return [];

	const filed: FiledMembership[] = [];
	for (const membership of company.businesses) {
		const entries = await db.$transaction(async (tx) => {
			const entry = await fileOne(
				tx,
				{
					record: { kind: "contact", id: contactId },
					businessId: membership.businessId,
					source: membership.source,
					reason: `Follows its company ${company.name}`,
					addedById: null,
				},
				true,
			);
			const result = entry ? [entry] : [];
			await logFiling(tx, result, membership.source);
			return result;
		});
		filed.push(...entries);
	}

	return filed;
}

const HOUR_MS = 60 * 60 * 1000;

function wallClockMs(at: Date, timeZone: string): number {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-GB", {
			timeZone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		})
			.formatToParts(at)
			.map((part) => [part.type, Number(part.value)]),
	);

	return Date.UTC(
		parts.year ?? 0,
		(parts.month ?? 1) - 1,
		parts.day ?? 1,
		parts.hour ?? 0,
		parts.minute ?? 0,
		parts.second ?? 0,
	);
}

export function filingDayStart(now = new Date()): Date {
	const { timeZone } = BUSINESS_FILING_LIMIT;
	const wall = new Date(wallClockMs(now, timeZone));
	const midnight = Date.UTC(
		wall.getUTCFullYear(),
		wall.getUTCMonth(),
		wall.getUTCDate(),
	);
	const offset = wallClockMs(new Date(midnight), timeZone) - midnight;

	return new Date(midnight - offset);
}

export function nextFilingDayStart(now = new Date()): Date {
	return filingDayStart(new Date(filingDayStart(now).getTime() + 36 * HOUR_MS));
}

export async function businessFilingRunsToday(
	client: Client,
	now = new Date(),
): Promise<number> {
	return client.agentTask.count({
		where: {
			kind: "business-filing",
			sessionId: { not: null },
			startedAt: { gte: filingDayStart(now) },
		},
	});
}
