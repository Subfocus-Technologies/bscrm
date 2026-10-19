import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	readBusinessFilingDailyLimit,
	writeBusinessFilingDailyLimit,
} from "@crm/db/settings";
import {
	fileIntoBusiness,
	preflightFiling,
	queueFilingForEvent,
} from "../agent/lib/business-filing";
import {
	decisionsMarkdown,
	recentDecisions,
} from "../agent/lib/business-filing-learning";

const suffix = process.env.TEST_RUN_ID ?? "business-filing-spec";
const domain = `filing-${suffix}.test`;
const prefix = `Filing ${suffix}`;

let investorId: string;
let agencyId: string;
let contactId: string;
let otherContactId: string;
let threadId: string;
let otherThreadId: string;
let meetingId: string;

async function clean() {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `@${domain}` } },
	});
	await db.calendarEvent.deleteMany({
		where: { iCalUid: { endsWith: `@${domain}` } },
	});
	const contacts = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	await db.agentTask.deleteMany({
		where: {
			kind: "business-filing",
			contactId: { in: contacts.map((contact) => contact.id) },
		},
	});
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.business.deleteMany({ where: { name: { startsWith: prefix } } });
}

async function makeThread(owner: string, key: string): Promise<string> {
	const now = new Date();
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `${key}@${domain}`,
			subject: "Buy-to-let yields in Leeds",
			firstMessageAt: now,
			lastMessageAt: now,
			contactId: owner,
		},
		select: { id: true },
	});
	return thread.id;
}

function membershipsOf(id: string) {
	return db.contactBusiness.findMany({
		where: { contactId: id },
		select: { businessId: true, source: true, reason: true },
	});
}

function suggestionOf(id: string, businessId: string) {
	return db.businessSuggestion.findUnique({
		where: { businessId_contactId: { businessId, contactId: id } },
		select: { status: true, reason: true, evidence: true },
	});
}

beforeEach(async () => {
	await clean();

	const [investor, agency] = await Promise.all([
		db.business.create({
			data: { name: `${prefix} Investor`, playbook: "Property investors." },
			select: { id: true },
		}),
		db.business.create({
			data: { name: `${prefix} Agent`, tone: 1 },
			select: { id: true },
		}),
	]);
	investorId = investor.id;
	agencyId = agency.id;

	const [contact, other] = await Promise.all([
		db.contact.create({
			data: { firstName: "Ivy", email: `ivy@${domain}` },
			select: { id: true },
		}),
		db.contact.create({
			data: { firstName: "Otto", email: `otto@${domain}` },
			select: { id: true },
		}),
	]);
	contactId = contact.id;
	otherContactId = other.id;

	threadId = await makeThread(contactId, "ivy-thread");
	otherThreadId = await makeThread(otherContactId, "otto-thread");

	const start = new Date();
	const meeting = await db.calendarEvent.create({
		data: {
			iCalUid: `ivy-meeting@${domain}`,
			originalStartTime: start,
			startsAt: start,
			endsAt: new Date(start.getTime() + 30 * 60_000),
			status: "confirmed",
			contactId,
		},
		select: { id: true },
	});
	meetingId = meeting.id;
});

afterAll(clean);

describe("fileIntoBusiness", () => {
	it("files an unfiled record when one of its own emails backs it", async () => {
		const outcome = await fileIntoBusiness({
			record: { kind: "contact", id: contactId },
			businessId: investorId,
			reason: "Asked about buy-to-let yields.",
			evidence: [{ kind: "email", id: threadId, quote: "yields in Leeds" }],
		});

		expect(outcome.outcome).toBe("filed");
		expect(await membershipsOf(contactId)).toEqual([
			{
				businessId: investorId,
				source: "AGENT",
				reason: "Asked about buy-to-let yields.",
			},
		]);
	});

	it("accepts a meeting with them as evidence", async () => {
		const outcome = await fileIntoBusiness({
			record: { kind: "contact", id: contactId },
			businessId: investorId,
			reason: "Met to talk about a portfolio.",
			evidence: [{ kind: "meeting", id: meetingId, quote: "Portfolio review" }],
		});

		expect(outcome.outcome).toBe("filed");
	});

	it("only suggests when the cited email belongs to someone else", async () => {
		const outcome = await fileIntoBusiness({
			record: { kind: "contact", id: contactId },
			businessId: investorId,
			reason: "Looks like an investor.",
			evidence: [{ kind: "email", id: otherThreadId, quote: "yields" }],
		});

		expect(outcome.outcome).toBe("suggested");
		expect(await membershipsOf(contactId)).toEqual([]);
		const suggestion = await suggestionOf(contactId, investorId);
		expect(suggestion?.status).toBe("PROPOSED");
		expect(suggestion?.evidence).toEqual([]);
	});

	it("only suggests when the record's profile is the only evidence", async () => {
		const outcome = await fileIntoBusiness({
			record: { kind: "contact", id: contactId },
			businessId: investorId,
			reason: "Title says property investor.",
			evidence: [{ kind: "record", id: contactId, quote: "Property investor" }],
		});

		expect(outcome.outcome).toBe("suggested");
	});

	it("only suggests a second business once the record is already filed", async () => {
		await db.contactBusiness.create({
			data: { contactId, businessId: agencyId },
		});

		const outcome = await fileIntoBusiness({
			record: { kind: "contact", id: contactId },
			businessId: investorId,
			reason: "Also invests.",
			evidence: [{ kind: "email", id: threadId, quote: "yields" }],
		});

		expect(outcome.outcome).toBe("suggested");
		expect(
			(await membershipsOf(contactId)).map((row) => row.businessId),
		).toEqual([agencyId]);
	});

	it("never re-offers a business a person ruled out", async () => {
		await db.businessSuggestion.create({
			data: {
				contactId,
				businessId: investorId,
				status: "DISMISSED",
				reason: "A person removed it from this business.",
			},
		});

		const outcome = await fileIntoBusiness({
			record: { kind: "contact", id: contactId },
			businessId: investorId,
			reason: "Asked about yields.",
			evidence: [{ kind: "email", id: threadId, quote: "yields" }],
		});

		expect(outcome.outcome).toBe("refused");
		expect(await membershipsOf(contactId)).toEqual([]);
	});

	it("refuses a filing with no reason", async () => {
		const outcome = await fileIntoBusiness({
			record: { kind: "contact", id: contactId },
			businessId: investorId,
			reason: "   ",
			evidence: [{ kind: "email", id: threadId, quote: "yields" }],
		});

		expect(outcome.outcome).toBe("refused");
	});
});

describe("queueFilingForEvent", () => {
	const event = (id: string) => ({
		type: "contact.created" as const,
		record: { kind: "contact", id },
		occurredAt: new Date().toISOString(),
		data: {},
	});

	it("queues one filing task for a new unfiled contact", async () => {
		expect(await queueFilingForEvent(event(contactId))).toBe("queued");
		expect(await queueFilingForEvent(event(contactId))).toBe("queued");

		const tasks = await db.agentTask.count({
			where: { kind: "business-filing", contactId, finishedAt: null },
		});
		expect(tasks).toBe(1);
	});

	it("skips a contact a person already filed", async () => {
		await db.contactBusiness.create({
			data: { contactId, businessId: agencyId },
		});

		expect(await queueFilingForEvent(event(contactId))).toBe("skipped");
	});

	it("ignores events other than a new record", async () => {
		expect(
			await queueFilingForEvent({
				...event(contactId),
				type: "deal.created",
				record: { kind: "deal", id: contactId },
			}),
		).toBe("skipped");
	});

	it("files by rule straight away instead of queueing the model", async () => {
		await db.businessRule.create({
			data: { businessId: agencyId, kind: "EMAIL_DOMAIN", value: domain },
		});

		expect(await queueFilingForEvent(event(contactId))).toBe("filed");
		expect(
			await db.agentTask.count({
				where: { kind: "business-filing", contactId, finishedAt: null },
			}),
		).toBe(0);
	});
});

describe("preflightFiling", () => {
	it("finishes without the model when a rule matches", async () => {
		await db.businessRule.create({
			data: { businessId: investorId, kind: "EMAIL_DOMAIN", value: domain },
		});

		const result = await preflightFiling({ contactId, companyId: null });

		expect(result.kind).toBe("done");
		expect((await membershipsOf(contactId))[0]?.source).toBe("RULE");
	});

	it("waits for tomorrow when AI filing is switched off", async () => {
		const previous = await readBusinessFilingDailyLimit(db);
		await writeBusinessFilingDailyLimit(db, 0);

		try {
			const now = new Date("2026-10-18T10:00:00Z");
			const result = await preflightFiling({ contactId, companyId: null }, now);

			expect(result).toEqual({
				kind: "deferred",
				until: new Date("2026-10-18T23:00:00Z"),
				reason:
					"Waiting for tomorrow: today's limit of 0 AI filings is used up.",
			});
		} finally {
			await writeBusinessFilingDailyLimit(db, previous);
		}
	});

	it("hands over to the model when nothing else decides it", async () => {
		expect(await preflightFiling({ contactId, companyId: null })).toEqual({
			kind: "research",
		});
	});
});

describe("recentDecisions", () => {
	it("shows people's filings and rulings, newest first", async () => {
		const person = await db.user.upsert({
			where: { id: `decider-${suffix}` },
			create: {
				id: `decider-${suffix}`,
				name: "Decider",
				email: `decider@${domain}`,
			},
			update: {},
			select: { id: true },
		});
		await db.contactBusiness.create({
			data: {
				contactId,
				businessId: investorId,
				addedById: person.id,
				createdAt: new Date(Date.now() - 60_000),
			},
		});
		await db.businessSuggestion.create({
			data: {
				contactId: otherContactId,
				businessId: agencyId,
				status: "DISMISSED",
				reason: "A person removed it from this business.",
				decidedById: person.id,
				decidedAt: new Date(),
			},
		});

		const decisions = (await recentDecisions(50)).filter((decision) =>
			decision.business.startsWith(prefix),
		);

		expect(
			decisions.map((decision) => [decision.status, decision.record]),
		).toEqual([
			["DISMISSED", "Otto"],
			["ACCEPTED", "Ivy"],
		]);
		expect(decisionsMarkdown(decisions)).toContain(
			`A person ruled **Otto** out of **${prefix} Agent**`,
		);

		await db.user.delete({ where: { id: person.id } });
	});
});
