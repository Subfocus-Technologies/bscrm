import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import type { CompanyListInput } from "../src/companies/companies.contracts";
import { CompaniesService } from "../src/companies/companies.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import type { FaviconService } from "../src/companies/favicon.service";
import type { ContactListInput } from "../src/contacts/contacts.contracts";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import type { DealListInput } from "../src/deals/deals.contracts";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { NO_BUSINESS } from "../src/trpc/list-input";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "business-facet-spec";
const token = `bizfacet${suffix.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
const domain = `${token}.test`;
const ownerId = `facet-owner-${suffix}`;
const namePrefix = `Facet ${suffix}`;

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	companyRequested: async () => true,
	withCrmEvents: withDiscardedCrmEvents,
	fieldBackfillRecords: async () => ({ queued: 0, merged: 0 }),
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const conversion = new ConversionService(db);
const fields = new FieldsService(db, agent);
const queue = new AgentQueueService(db);
const companies = new CompaniesService(
	db,
	agent,
	queue,
	{ backfill: async () => undefined } as unknown as FaviconService,
	stamp,
	conversion,
	fields,
);
const contacts = new ContactsService(
	db,
	new CompanyDirectoryService(agent),
	agent,
	queue,
	stamp,
	fields,
);
const deals = new DealsService(db, agent, stamp, conversion, fields);

const baseList = {
	q: token,
	sort: "name",
	dir: "asc" as const,
	page: 1,
	pageSize: 100,
	owner: [],
	fields: {},
	archived: false,
	business: null,
	businesses: [],
};

function companyList(input: Partial<CompanyListInput>): CompanyListInput {
	return {
		...baseList,
		industry: [],
		enrichment: [],
		source: [],
		activity: [],
		...input,
	};
}

function contactList(input: Partial<ContactListInput>): ContactListInput {
	return {
		...baseList,
		company: [],
		source: [],
		title: [],
		seniority: [],
		persona: [],
		activity: [],
		...input,
	};
}

function dealList(input: Partial<DealListInput>): DealListInput {
	return {
		...baseList,
		status: "all",
		stage: [],
		closing: [],
		...input,
	};
}

let alphaId = "";
let betaId = "";
const company = { only: "", both: "", none: "" };
const contact = { only: "", none: "" };
const deal = { alpha: "", none: "" };

async function clean() {
	await db.deal.deleteMany({
		where: { company: { domain: { endsWith: domain } } },
	});
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.company.deleteMany({ where: { domain: { endsWith: domain } } });
	await db.business.deleteMany({ where: { name: { startsWith: namePrefix } } });
	await db.user.deleteMany({ where: { id: ownerId } });
}

async function makeCompany(key: string, businessIds: string[]) {
	const row = await db.company.create({
		data: {
			name: `${token} ${key}`,
			domain: `${key}.${domain}`,
			businesses: {
				create: businessIds.map((businessId) => ({ businessId })),
			},
		},
		select: { id: true },
	});
	return row.id;
}

async function makeContact(key: string, businessIds: string[]) {
	const row = await db.contact.create({
		data: {
			firstName: key,
			email: `${key}@${domain}`,
			businesses: {
				create: businessIds.map((businessId) => ({ businessId })),
			},
		},
		select: { id: true },
	});
	return row.id;
}

async function makeDeal(key: string, businessId: string | null) {
	const row = await db.deal.create({
		data: {
			name: `${token} ${key}`,
			companyId: company.none,
			ownerId,
			businessId,
		},
		select: { id: true },
	});
	return row.id;
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: ownerId, name: "Facet Rep", email: `rep@${domain}` },
	});

	const [alpha, beta] = await Promise.all([
		db.business.create({ data: { name: `${namePrefix} Alpha` } }),
		db.business.create({ data: { name: `${namePrefix} Beta` } }),
	]);
	alphaId = alpha.id;
	betaId = beta.id;

	company.only = await makeCompany("a-only", [alphaId]);
	company.both = await makeCompany("b-both", [betaId, alphaId]);
	company.none = await makeCompany("c-none", []);

	contact.only = await makeContact("anna", [alphaId]);
	contact.none = await makeContact("bert", []);

	deal.alpha = await makeDeal("a-alpha", alphaId);
	deal.none = await makeDeal("b-none", null);
});

afterAll(clean);

describe("filtering companies by business", () => {
	it("keeps the companies filed into the chosen business", async () => {
		const result = await companies.list(companyList({ businesses: [alphaId] }));

		expect(result.rows.map((row) => row.id)).toEqual([
			company.only,
			company.both,
		]);
	});

	it("keeps the companies with no business when No business is chosen", async () => {
		const result = await companies.list(
			companyList({ businesses: [NO_BUSINESS] }),
		);

		expect(result.rows.map((row) => row.id)).toEqual([company.none]);
	});

	it("joins a business and No business with OR", async () => {
		const result = await companies.list(
			companyList({ businesses: [betaId, NO_BUSINESS] }),
		);

		expect(result.rows.map((row) => row.id)).toEqual([
			company.both,
			company.none,
		]);
	});

	it("narrows inside a focused business", async () => {
		const result = await companies.list(
			companyList({ business: alphaId, businesses: [betaId] }),
		);

		expect(result.rows.map((row) => row.id)).toEqual([company.both]);
	});

	it("counts each business and the companies with none", async () => {
		const result = await companies.list(companyList({}));

		expect(result.facetCounts.businesses).toEqual({
			[alphaId]: 2,
			[betaId]: 1,
			[NO_BUSINESS]: 1,
		});
	});

	it("lists every business of a row in name order", async () => {
		const result = await companies.list(companyList({}));
		const both = result.rows.find((row) => row.id === company.both);

		expect(both?.businesses.map((business) => business.id)).toEqual([
			alphaId,
			betaId,
		]);
		expect(
			result.rows.find((row) => row.id === company.none)?.businesses,
		).toEqual([]);
	});
});

describe("filtering contacts by business", () => {
	it("keeps the contacts filed into the chosen business", async () => {
		const result = await contacts.list(contactList({ businesses: [alphaId] }));

		expect(result.rows.map((row) => row.id)).toEqual([contact.only]);
		expect(result.rows[0]?.businesses).toEqual([
			{ id: alphaId, name: `${namePrefix} Alpha`, tone: 0 },
		]);
	});

	it("keeps the contacts with no business when No business is chosen", async () => {
		const result = await contacts.list(
			contactList({ businesses: [NO_BUSINESS] }),
		);

		expect(result.rows.map((row) => row.id)).toEqual([contact.none]);
	});

	it("counts each business and the contacts with none", async () => {
		const result = await contacts.list(contactList({}));

		expect(result.facetCounts.businesses).toEqual({
			[alphaId]: 1,
			[NO_BUSINESS]: 1,
		});
	});
});

describe("filtering deals by business", () => {
	it("keeps the deals in the chosen business", async () => {
		const result = await deals.list(dealList({ businesses: [alphaId] }));

		expect(result.rows.map((row) => row.id)).toEqual([deal.alpha]);
		expect(result.rows[0]?.business?.id).toBe(alphaId);
	});

	it("keeps the deals with no business when No business is chosen", async () => {
		const result = await deals.list(dealList({ businesses: [NO_BUSINESS] }));

		expect(result.rows.map((row) => row.id)).toEqual([deal.none]);
		expect(result.rows[0]?.business).toBeNull();
	});

	it("counts each business and the deals with none", async () => {
		const result = await deals.list(dealList({}));

		expect(result.facetCounts.businesses).toEqual({
			[alphaId]: 1,
			[NO_BUSINESS]: 1,
		});
	});
});
