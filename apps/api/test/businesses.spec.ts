import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import { applyRules } from "@crm/db/business-filing";
import { writeReportingCurrency } from "@crm/db/settings";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { BusinessRulesService } from "../src/businesses/business-rules.service";
import { BusinessSuggestionsService } from "../src/businesses/business-suggestions.service";
import { BusinessesService } from "../src/businesses/businesses.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { businessTargets } from "../src/dashboard/business-targets";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "businesses-spec";
const domain = `businesses-${suffix}.test`;
const sayu = `sayu-${suffix}`;
const luke = `luke-${suffix}`;
const namePrefix = `Spec ${suffix}`;

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	companyRequested: async () => true,
	withCrmEvents: withDiscardedCrmEvents,
	fieldBackfillRecords: async () => ({ queued: 0, merged: 0 }),
} as unknown as AgentTriggerService;

const businesses = new BusinessesService(db);
const rules = new BusinessRulesService(db);
const queuedForSorting: { contactId?: string; companyId?: string }[][] = [];
const suggestions = new BusinessSuggestionsService(db, {
	businessFilingRequested: async (
		records: { contactId?: string; companyId?: string }[],
	) => {
		queuedForSorting.push(records);
		return records.length;
	},
} as unknown as AgentTriggerService);
const fields = new FieldsService(db, agent);
const contacts = new ContactsService(
	db,
	new CompanyDirectoryService(agent),
	agent,
	new AgentQueueService(db),
	new ActivityStampService(db),
	fields,
);

const contactList = {
	q: "",
	sort: "",
	dir: "asc" as const,
	page: 1,
	pageSize: 100,
	owner: [],
	company: [],
	source: [],
	title: [],
	seniority: [],
	persona: [],
	activity: [],
	fields: {},
	archived: false,
	businesses: [],
};

function named(name: string): string {
	return `${namePrefix} ${name}`;
}

async function cleanThreads() {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `@${domain}` } },
	});
}

async function clean() {
	await cleanThreads();
	const companies = await db.company.findMany({
		where: { domain: { endsWith: domain } },
		select: { id: true },
	});
	const companyIds = companies.map((row) => row.id);

	await db.deal.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.contact.deleteMany({
		where: { email: { endsWith: `@${domain}` } },
	});
	await db.company.deleteMany({ where: { id: { in: companyIds } } });
	await db.business.deleteMany({ where: { name: { startsWith: namePrefix } } });
	await db.user.deleteMany({ where: { id: { in: [sayu, luke] } } });
}

async function makeCompany(name: string): Promise<string> {
	const company = await db.company.create({
		data: { name: named(name), domain: `${name}.${domain}` },
		select: { id: true },
	});
	return company.id;
}

async function makeContact(firstName: string): Promise<string> {
	const contact = await db.contact.create({
		data: { firstName, email: `${firstName}@${domain}` },
		select: { id: true },
	});
	return contact.id;
}

beforeAll(async () => {
	await clean();
	await db.user.createMany({
		data: [
			{ id: sayu, name: "Sayu", email: `sayu@${domain}` },
			{ id: luke, name: "Luke", email: `luke@${domain}` },
		],
	});
});

beforeEach(async () => {
	await db.deal.deleteMany({
		where: { company: { domain: { endsWith: domain } } },
	});
	await db.contact.deleteMany({
		where: { email: { endsWith: `@${domain}` } },
	});
	await db.company.deleteMany({ where: { domain: { endsWith: domain } } });
	await db.business.deleteMany({ where: { name: { startsWith: namePrefix } } });
});

afterAll(clean);

describe("adding a business", () => {
	it("records who added it", async () => {
		const created = await businesses.create({ name: named("WDTO") }, sayu);

		const row = await db.business.findUniqueOrThrow({
			where: { id: created.id },
			select: { createdById: true, updatedById: true },
		});
		expect(row).toEqual({ createdById: sayu, updatedById: sayu });
	});

	it("gives each new business a colour nobody else uses yet", async () => {
		const investor = await businesses.create({ name: named("Investor") }, sayu);
		const agentBusiness = await businesses.create(
			{ name: named("Agent") },
			sayu,
		);
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);

		const tones = new Set([investor.tone, agentBusiness.tone, wdto.tone]);
		expect(tones.size).toBe(3);
	});

	it("refuses a name that differs only in case", async () => {
		await businesses.create({ name: named("BS Agent") }, sayu);

		await expect(
			businesses.create({ name: named("bs agent") }, luke),
		).rejects.toThrow("There is already a business called");
	});

	it("records who renamed it", async () => {
		const created = await businesses.create({ name: named("BS Inv") }, sayu);

		const renamed = await businesses.update(
			{
				id: created.id,
				name: named("BS Investor"),
				playbook: null,
				monthlyTargetCents: null,
			},
			luke,
		);

		expect(renamed.name).toBe(named("BS Investor"));
		const row = await db.business.findUniqueOrThrow({
			where: { id: created.id },
			select: { updatedById: true },
		});
		expect(row.updatedById).toBe(luke);
	});
});

describe("ordering businesses", () => {
	it("keeps a separate order for each person", async () => {
		const investor = await businesses.create({ name: named("Investor") }, sayu);
		const agentBusiness = await businesses.create(
			{ name: named("Agent") },
			sayu,
		);
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);

		await businesses.reorder(
			{ ids: [wdto.id, investor.id, agentBusiness.id] },
			sayu,
		);

		const mine = (await businesses.list(sayu)).filter((row) =>
			row.name.startsWith(namePrefix),
		);
		const theirs = (await businesses.list(luke)).filter((row) =>
			row.name.startsWith(namePrefix),
		);

		expect(mine.map((row) => row.id)).toEqual([
			wdto.id,
			investor.id,
			agentBusiness.id,
		]);
		expect(theirs.map((row) => row.id)).toEqual([
			investor.id,
			agentBusiness.id,
			wdto.id,
		]);
	});

	it("refuses an order that names an unknown business", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);

		await expect(
			businesses.reorder({ ids: [wdto.id, "missing"] }, sayu),
		).rejects.toThrow("does not exist");
	});
});

describe("the business someone is looking at", () => {
	it("is personal and falls back to everything when the business goes", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);

		await businesses.setFocus(sayu, wdto.id);

		expect(await businesses.focus(sayu)).toEqual({ businessId: wdto.id });
		expect(await businesses.focus(luke)).toEqual({ businessId: null });

		await businesses.delete(wdto.id, sayu);

		expect(await businesses.focus(sayu)).toEqual({ businessId: null });
	});
});

describe("filing records into businesses", () => {
	it("lets a company sit in several businesses at once", async () => {
		const investor = await businesses.create({ name: named("Investor") }, sayu);
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		const companyId = await makeCompany("acme");

		await businesses.addRecords(
			{ entity: "COMPANY", ids: [companyId], businessId: investor.id },
			sayu,
		);
		await businesses.addRecords(
			{ entity: "COMPANY", ids: [companyId], businessId: wdto.id },
			luke,
		);

		const held = await businesses.forRecord({
			entity: "COMPANY",
			id: companyId,
		});
		expect(held.map((row) => row.id).sort()).toEqual(
			[investor.id, wdto.id].sort(),
		);

		const membership = await db.companyBusiness.findUniqueOrThrow({
			where: { companyId_businessId: { companyId, businessId: wdto.id } },
			select: { addedById: true },
		});
		expect(membership.addedById).toBe(luke);
	});

	it("counts records already filed as skipped and missing ones as failed", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		const contactId = await makeContact("ada");

		await businesses.addRecords(
			{ entity: "CONTACT", ids: [contactId], businessId: wdto.id },
			sayu,
		);
		const again = await businesses.addRecords(
			{ entity: "CONTACT", ids: [contactId, "missing"], businessId: wdto.id },
			sayu,
		);

		expect(again).toEqual({
			requested: 2,
			succeeded: 0,
			skipped: 1,
			failed: 1,
			message: "They are already in that business.",
		});
	});

	it("moves a deal to one business only", async () => {
		const investor = await businesses.create({ name: named("Investor") }, sayu);
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		const companyId = await makeCompany("dealco");
		const deal = await db.deal.create({
			data: { name: "Deal", companyId, ownerId: sayu, businessId: investor.id },
			select: { id: true },
		});

		await businesses.addRecords(
			{ entity: "DEAL", ids: [deal.id], businessId: wdto.id },
			sayu,
		);

		expect(await businesses.forRecord({ entity: "DEAL", id: deal.id })).toEqual(
			[{ ...wdto, source: null, reason: null }],
		);

		const removed = await businesses.removeRecords(
			{ entity: "DEAL", ids: [deal.id], businessId: wdto.id },
			sayu,
		);
		expect(removed.succeeded).toBe(1);
		expect(await businesses.forRecord({ entity: "DEAL", id: deal.id })).toEqual(
			[],
		);
	});

	it("keeps the records when a business is removed", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		const contactId = await makeContact("grace");
		await businesses.addRecords(
			{ entity: "CONTACT", ids: [contactId], businessId: wdto.id },
			sayu,
		);

		await businesses.delete(wdto.id, sayu);

		expect(await db.contact.count({ where: { id: contactId } })).toBe(1);
		expect(
			await businesses.forRecord({ entity: "CONTACT", id: contactId }),
		).toEqual([]);
	});
});

describe("lists scoped to a business", () => {
	it("shows only that business's contacts, and everyone without a business chosen", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		const inside = await makeContact("linus");
		const outside = await makeContact("barbara");
		await businesses.addRecords(
			{ entity: "CONTACT", ids: [inside], businessId: wdto.id },
			sayu,
		);

		const scoped = await contacts.list({ ...contactList, business: wdto.id });
		const everything = await contacts.list({ ...contactList, business: null });

		const scopedIds = scoped.rows.map((row) => row.id);
		const everyIds = everything.rows.map((row) => row.id);
		expect(scopedIds).toEqual([inside]);
		expect(everyIds).toContain(inside);
		expect(everyIds).toContain(outside);
	});

	it("files a new contact into the business it was created in", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);

		const created = await contacts.create(
			{
				firstName: "Margaret",
				email: `margaret@${domain}`,
				businessId: wdto.id,
			},
			sayu,
		);

		const membership = await db.contactBusiness.findUniqueOrThrow({
			where: {
				contactId_businessId: { contactId: created.id, businessId: wdto.id },
			},
			select: { addedById: true },
		});
		expect(membership.addedById).toBe(sayu);
	});
});

describe("playbooks", () => {
	it("stores a playbook and clears it when emptied", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);

		const saved = await businesses.update(
			{
				id: wdto.id,
				name: wdto.name,
				playbook: "Compliance teams.",
				monthlyTargetCents: null,
			},
			sayu,
		);
		expect(saved.playbook).toBe("Compliance teams.");

		const cleared = await businesses.update(
			{
				id: wdto.id,
				name: wdto.name,
				playbook: null,
				monthlyTargetCents: null,
			},
			sayu,
		);
		expect(cleared.playbook).toBeNull();
	});
});

describe("the agent's suggestions", () => {
	async function suggestFor(contactId: string, businessId: string) {
		return db.businessSuggestion.create({
			data: {
				contactId,
				businessId,
				reason: "Asked about compliance checks.",
				evidence: [{ kind: "record", id: contactId, quote: "Head of KYC" }],
			},
			select: { id: true },
		});
	}

	it("files the record with the agent's reason when a person accepts", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		const contactId = await makeContact("kyc");
		const suggestion = await suggestFor(contactId, wdto.id);

		const listed = await suggestions.list({
			entity: "CONTACT",
			recordId: contactId,
		});
		expect(listed.rows.map((row) => row.id)).toEqual([suggestion.id]);
		expect(listed.rows[0]?.evidence[0]?.quote).toBe("Head of KYC");

		await suggestions.decide({ id: suggestion.id, decision: "accept" }, luke);

		const membership = await db.contactBusiness.findUniqueOrThrow({
			where: { contactId_businessId: { contactId, businessId: wdto.id } },
			select: { source: true, reason: true, addedById: true },
		});
		expect(membership).toEqual({
			source: "MANUAL",
			reason: "Suggested by the agent: Asked about compliance checks.",
			addedById: luke,
		});
		await expect(
			suggestions.decide({ id: suggestion.id, decision: "dismiss" }, sayu),
		).rejects.toThrow("already decided");
	});

	it("files nothing when a person dismisses", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		const contactId = await makeContact("noise");
		const suggestion = await suggestFor(contactId, wdto.id);

		const result = await suggestions.decide(
			{ id: suggestion.id, decision: "dismiss" },
			sayu,
		);

		expect(result.status).toBe("DISMISSED");
		expect(await db.contactBusiness.count({ where: { contactId } })).toBe(0);
	});

	it("remembers when a person removes a record from a business", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		const contactId = await makeContact("removed");
		await businesses.addRecords(
			{ entity: "CONTACT", ids: [contactId], businessId: wdto.id },
			sayu,
		);

		await businesses.removeRecords(
			{ entity: "CONTACT", ids: [contactId], businessId: wdto.id },
			luke,
		);

		const ruling = await db.businessSuggestion.findUniqueOrThrow({
			where: { businessId_contactId: { businessId: wdto.id, contactId } },
			select: { status: true, decidedById: true },
		});
		expect(ruling).toEqual({ status: "DISMISSED", decidedById: luke });
	});

	it("settles a waiting suggestion when a person files the record by hand", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		const contactId = await makeContact("byhand");
		const suggestion = await suggestFor(contactId, wdto.id);

		await businesses.addRecords(
			{ entity: "CONTACT", ids: [contactId], businessId: wdto.id },
			sayu,
		);

		const settled = await db.businessSuggestion.findUniqueOrThrow({
			where: { id: suggestion.id },
			select: { status: true },
		});
		expect(settled.status).toBe("ACCEPTED");
	});
});

describe("sorting unfiled records", () => {
	it("queues only records that are in no business", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		const filed = await makeContact("filed");
		const unfiled = await makeContact("unfiled");
		await businesses.addRecords(
			{ entity: "CONTACT", ids: [filed], businessId: wdto.id },
			sayu,
		);
		queuedForSorting.length = 0;

		await suggestions.sortUnfiled(sayu);

		const queuedContacts = (queuedForSorting[0] ?? []).map(
			(record) => record.contactId,
		);
		expect(queuedContacts).toContain(unfiled);
		expect(queuedContacts).not.toContain(filed);
	});
});

async function contactAt(firstName: string, companyId: string) {
	const contact = await db.contact.create({
		data: { firstName, email: `${firstName}@${domain}`, companyId },
		select: { id: true },
	});
	return contact.id;
}

function membersOf(contactId: string) {
	return db.contactBusiness.findMany({
		where: { contactId },
		select: { businessId: true, source: true, reason: true },
	});
}

describe("records follow their company", () => {
	it("files a company's people when a person files the company", async () => {
		const agency = await businesses.create({ name: named("Agent") }, sayu);
		const companyId = await makeCompany("estates");
		const alice = await contactAt("alice", companyId);
		const bob = await contactAt("bob", companyId);
		await db.businessSuggestion.create({
			data: {
				contactId: bob,
				businessId: agency.id,
				status: "DISMISSED",
				reason: "A person removed it from this business.",
			},
		});

		await businesses.addRecords(
			{ entity: "COMPANY", ids: [companyId], businessId: agency.id },
			sayu,
		);

		expect(await membersOf(alice)).toEqual([
			{
				businessId: agency.id,
				source: "MANUAL",
				reason: `Follows its company ${named("estates")}`,
			},
		]);
		expect(await membersOf(bob)).toEqual([]);
	});

	it("files a contact's company when the company is in no business", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		const companyId = await makeCompany("lawfirm");
		const carol = await contactAt("carol", companyId);

		await businesses.addRecords(
			{ entity: "CONTACT", ids: [carol], businessId: wdto.id },
			sayu,
		);

		expect(
			await db.companyBusiness.count({
				where: { companyId, businessId: wdto.id },
			}),
		).toBe(1);
	});
});

describe("filing rules", () => {
	it("refuses a domain that is not a domain", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);

		await expect(
			rules.add(
				{ businessId: wdto.id, kind: "EMAIL_DOMAIN", value: "not a domain" },
				sayu,
			),
		).rejects.toThrow("That is not a domain");
	});

	it("stores a domain in its bare form and refuses a duplicate", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);

		const rule = await rules.add(
			{
				businessId: wdto.id,
				kind: "EMAIL_DOMAIN",
				value: "@WWW.KnightFrank.com",
			},
			sayu,
		);
		expect(rule.value).toBe("knightfrank.com");

		await expect(
			rules.add(
				{ businessId: wdto.id, kind: "EMAIL_DOMAIN", value: "knightfrank.com" },
				sayu,
			),
		).rejects.toThrow("already there");
	});

	it("files a contact by email domain and writes it on the timeline", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		await rules.add(
			{ businessId: wdto.id, kind: "EMAIL_DOMAIN", value: domain },
			sayu,
		);
		const dana = await makeContact("dana");

		const filed = await applyRules(db, { kind: "contact", id: dana });

		expect(filed.map((entry) => entry.businessId)).toEqual([wdto.id]);
		expect((await membersOf(dana))[0]?.source).toBe("RULE");
		const trail = await db.activity.findFirst({
			where: { contactId: dana, type: "ENRICHMENT" },
			select: { subject: true },
		});
		expect(trail?.subject).toBe(`Filed into ${named("WDTO")} by a filing rule`);
	});

	it("files a contact who wrote to one of our addresses", async () => {
		const investor = await businesses.create({ name: named("Investor") }, sayu);
		await rules.add(
			{
				businessId: investor.id,
				kind: "MAILBOX",
				value: "info@bricksmart.test",
			},
			sayu,
		);
		const erin = await makeContact("erin");
		const now = new Date();
		await db.emailThread.create({
			data: {
				rootMessageId: `erin-thread@${domain}`,
				firstMessageAt: now,
				lastMessageAt: now,
				contactId: erin,
				messages: {
					create: {
						rfcMessageId: `erin-message@${domain}`,
						direction: "INBOUND",
						fromEmail: `erin@${domain}`,
						recipients: [
							{ email: "info@bricksmart.test", name: null, kind: "to" },
						],
						sentAt: now,
					},
				},
			},
		});

		const filed = await applyRules(db, { kind: "contact", id: erin });

		expect(filed.map((entry) => entry.businessId)).toEqual([investor.id]);
	});

	it("never overrides a removal a person made", async () => {
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		await rules.add(
			{ businessId: wdto.id, kind: "EMAIL_DOMAIN", value: domain },
			sayu,
		);
		const frank = await makeContact("frank");
		await businesses.addRecords(
			{ entity: "CONTACT", ids: [frank], businessId: wdto.id },
			sayu,
		);
		await businesses.removeRecords(
			{ entity: "CONTACT", ids: [frank], businessId: wdto.id },
			sayu,
		);

		expect(await applyRules(db, { kind: "contact", id: frank })).toEqual([]);
		expect(await membersOf(frank)).toEqual([]);
	});
});

describe("the daily filing limit", () => {
	it("keeps the limit inside its bounds", async () => {
		const high = await suggestions.setFilingLimit(1_000_000, sayu);
		expect(high.limit).toBe(high.max);

		const off = await suggestions.setFilingLimit(-5, sayu);
		expect(off.limit).toBe(0);

		await suggestions.setFilingLimit(100, sayu);
	});
});

describe("monthly targets", () => {
	it("stores a target in the reporting currency and measures this month's wins", async () => {
		await writeReportingCurrency(db, "GBP");
		const wdto = await businesses.create({ name: named("WDTO") }, sayu);
		const saved = await businesses.update(
			{
				id: wdto.id,
				name: wdto.name,
				playbook: null,
				monthlyTargetCents: 2_500_000,
			},
			sayu,
		);
		expect(saved.target).toEqual({ cents: 2_500_000, currency: "GBP" });

		const companyId = await makeCompany("winner");
		const now = new Date();
		await db.deal.create({
			data: {
				name: "Won deal",
				companyId,
				ownerId: sayu,
				businessId: wdto.id,
				stage: "CLOSED_WON",
				closedAt: now,
				amount: 10_000,
				currency: "GBP",
				baseAmount: 10_000,
				baseCurrency: "GBP",
			},
		});

		const targets = await businessTargets(db, {
			business: wdto.id,
			base: "GBP",
			counted: { baseCurrency: "GBP", baseAmount: { not: null } },
			month: {
				start: new Date(now.getFullYear(), now.getMonth(), 1),
				end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
			},
		});

		expect(targets.overall).toEqual({
			targetCents: 2_500_000,
			wonCents: 1_000_000,
		});
	});
});
