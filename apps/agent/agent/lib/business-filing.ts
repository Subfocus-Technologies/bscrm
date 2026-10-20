import { db, type Prisma } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import {
	applyRules,
	businessFilingRunsToday,
	type FiledMembership,
	type FilingRecord,
	fileRecord,
	followCompany,
	recordColumn,
} from "@crm/db/business-filing";
import { nextWorkspaceDayStart } from "@crm/db/day";
import { readBusinessFilingDailyLimit } from "@crm/db/settings";
import type { CrmEventTask } from "@crm/validation/agent-events";
import {
	BUSINESS_FILING,
	type BusinessFilingEvidence,
	businessFilingEvidence,
} from "@crm/validation/business-filing";
import { DISPATCH } from "./dispatch-config";
import { type LeasedTask, scheduleTask } from "./tasks";

export type { FilingRecord };

export type FilingBusiness = {
	id: string;
	name: string;
	playbook: string | null;
};

export type FilingOutcome =
	| { outcome: "filed"; business: string; reason: string }
	| { outcome: "suggested"; business: string; reason: string }
	| { outcome: "unchanged"; reason: string }
	| { outcome: "refused"; reason: string };

export async function listFilingBusinesses(): Promise<FilingBusiness[]> {
	return db.business.findMany({
		select: { id: true, name: true, playbook: true },
		orderBy: [{ createdAt: "asc" }, { name: "asc" }],
	});
}

export function businessesMarkdown(businesses: FilingBusiness[]): string {
	if (businesses.length === 0) return "";

	const lines = businesses.map((business) =>
		[
			`### ${business.name} \`${business.id}\``,
			business.playbook ?? "No playbook yet. Go by the name alone.",
		].join("\n"),
	);

	return ["## Our businesses", "", ...lines].join("\n\n");
}

function threadOwnerWhere(record: FilingRecord): Prisma.EmailThreadWhereInput {
	return record.kind === "contact"
		? { contactId: record.id }
		: { OR: [{ companyId: record.id }, { contact: { companyId: record.id } }] };
}

function meetingOwnerWhere(
	record: FilingRecord,
): Prisma.CalendarEventWhereInput {
	return record.kind === "contact"
		? {
				OR: [
					{ contactId: record.id },
					{ attendees: { some: { contactId: record.id } } },
				],
			}
		: {
				OR: [
					{ companyId: record.id },
					{ contact: { companyId: record.id } },
					{ attendees: { some: { contact: { companyId: record.id } } } },
				],
			};
}

async function verifiedEvidence(
	record: FilingRecord,
	evidence: BusinessFilingEvidence,
): Promise<{ kept: BusinessFilingEvidence; interactions: number }> {
	const kept: BusinessFilingEvidence = [];
	let interactions = 0;

	for (const item of evidence) {
		if (item.kind === "record") {
			if (item.id === record.id) kept.push(item);
			continue;
		}

		const found =
			item.kind === "email"
				? await db.emailThread.count({
						where: { AND: [{ id: item.id }, threadOwnerWhere(record)] },
					})
				: await db.calendarEvent.count({
						where: { AND: [{ id: item.id }, meetingOwnerWhere(record)] },
					});

		if (found > 0) {
			kept.push(item);
			interactions += 1;
		}
	}

	return { kept, interactions };
}

async function recordExists(record: FilingRecord): Promise<boolean> {
	const count =
		record.kind === "company"
			? await db.company.count({ where: { id: record.id } })
			: await db.contact.count({ where: { id: record.id } });
	return count > 0;
}

async function memberships(record: FilingRecord): Promise<string[]> {
	const rows =
		record.kind === "company"
			? await db.companyBusiness.findMany({
					where: { companyId: record.id },
					select: { businessId: true },
				})
			: await db.contactBusiness.findMany({
					where: { contactId: record.id },
					select: { businessId: true },
				});
	return rows.map((row) => row.businessId);
}

function suggestionKey(record: FilingRecord, businessId: string) {
	return record.kind === "company"
		? { businessId_companyId: { businessId, companyId: record.id } }
		: { businessId_contactId: { businessId, contactId: record.id } };
}

async function fileDirectly(
	record: FilingRecord,
	businessId: string,
	reason: string,
): Promise<void> {
	await db.$transaction((tx) =>
		fileRecord(tx, {
			record,
			businessId,
			source: "AGENT",
			reason,
			addedById: null,
		}),
	);
}

async function suggest(
	record: FilingRecord,
	businessId: string,
	reason: string,
	evidence: BusinessFilingEvidence,
): Promise<void> {
	await db.businessSuggestion.upsert({
		where: suggestionKey(record, businessId),
		create: { businessId, ...recordColumn(record), reason, evidence },
		update: { reason, evidence },
	});
}

export async function fileIntoBusiness(input: {
	record: FilingRecord;
	businessId: string;
	reason: string;
	evidence: unknown;
}): Promise<FilingOutcome> {
	const parsed = businessFilingEvidence.safeParse(input.evidence);
	if (!parsed.success) {
		return {
			outcome: "refused",
			reason: `The evidence is not readable: ${parsed.error.message}`,
		};
	}

	const reason = input.reason.trim().slice(0, BUSINESS_FILING.reason.maxLength);
	if (!reason) {
		return { outcome: "refused", reason: "Say why it belongs there." };
	}

	const business = await db.business.findUnique({
		where: { id: input.businessId },
		select: { id: true, name: true },
	});
	if (!business) {
		return {
			outcome: "refused",
			reason: "There is no such business. Call list_businesses for the ids.",
		};
	}
	if (!(await recordExists(input.record))) {
		return {
			outcome: "refused",
			reason: `There is no such ${input.record.kind}.`,
		};
	}

	const held = await memberships(input.record);
	if (held.includes(business.id)) {
		return {
			outcome: "unchanged",
			reason: `It is already in ${business.name}.`,
		};
	}

	const prior = await db.businessSuggestion.findUnique({
		where: suggestionKey(input.record, business.id),
		select: { status: true },
	});
	if (prior?.status === "DISMISSED") {
		return {
			outcome: "refused",
			reason: `A person decided it does not belong in ${business.name}. Leave it.`,
		};
	}

	const { kept, interactions } = await verifiedEvidence(
		input.record,
		parsed.data,
	);

	if (held.length === 0 && interactions > 0) {
		await fileDirectly(input.record, business.id, reason);
		return { outcome: "filed", business: business.name, reason };
	}

	await suggest(input.record, business.id, reason, kept);
	return {
		outcome: "suggested",
		business: business.name,
		reason:
			held.length > 0
				? "It is already in another business, so a person decides."
				: "No email or meeting with them backs this up, so a person decides.",
	};
}

const FILING_EVENTS = new Set(["contact.created", "company.created"]);

export async function fileWithoutModel(
	record: FilingRecord,
): Promise<FiledMembership[]> {
	const byRule = await applyRules(db, record);
	if (byRule.length > 0 || record.kind === "company") return byRule;

	return followCompany(db, record.id);
}

function describeFiled(filed: FiledMembership[]): string {
	return filed.length === 1
		? `Filed without the model: ${filed[0]?.reason ?? "a rule matched"}.`
		: `Filed ${filed.length} memberships without the model.`;
}

function recordOfTask(
	task: Pick<LeasedTask, "contactId" | "companyId">,
): FilingRecord | null {
	if (task.contactId) return { kind: "contact", id: task.contactId };
	if (task.companyId) return { kind: "company", id: task.companyId };
	return null;
}

export type QueueOutcome = "filed" | "queued" | "skipped";

export async function queueFilingForEvent(
	event: CrmEventTask,
): Promise<QueueOutcome> {
	if (!FILING_EVENTS.has(event.type)) return "skipped";

	const businesses = await db.business.count();
	if (businesses === 0) return "skipped";

	const record: FilingRecord =
		event.type === "company.created"
			? { kind: "company", id: event.record.id }
			: { kind: "contact", id: event.record.id };

	if (!(await recordExists(record))) return "skipped";
	if ((await memberships(record)).length > 0) return "skipped";

	const filed = await fileWithoutModel(record);
	if (filed.length > 0) return "filed";

	await scheduleTask({
		...recordColumn(record),
		kind: "business-filing",
		reason: `New ${record.kind}: decide which business it belongs to`,
		dueAt: new Date(Date.now() + DISPATCH.businessFiling.delayMs),
		priority: PRIORITY.businessFiling,
		budget: DISPATCH.businessFiling.budget,
	});

	return "queued";
}

export type Preflight =
	| { kind: "done"; outcome: string }
	| { kind: "deferred"; until: Date; reason: string }
	| { kind: "research" };

export async function preflightFiling(
	task: Pick<LeasedTask, "contactId" | "companyId">,
	now = new Date(),
): Promise<Preflight> {
	const record = recordOfTask(task);
	if (!record || !(await recordExists(record))) {
		return { kind: "done", outcome: "The record this names is gone." };
	}
	if ((await memberships(record)).length > 0) {
		return { kind: "done", outcome: "Someone filed it before the agent did." };
	}

	const filed = await fileWithoutModel(record);
	if (filed.length > 0) return { kind: "done", outcome: describeFiled(filed) };

	const [limit, used] = await Promise.all([
		readBusinessFilingDailyLimit(db),
		businessFilingRunsToday(db, now),
	]);
	if (used >= limit) {
		return {
			kind: "deferred",
			until: nextWorkspaceDayStart(now),
			reason: `Waiting for tomorrow: today's limit of ${limit} AI filings is used up.`,
		};
	}

	return { kind: "research" };
}
