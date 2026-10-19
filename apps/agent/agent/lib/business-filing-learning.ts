import { db } from "@crm/db";
import { BUSINESS_FILING } from "@crm/validation/business-filing";

export type FilingDecision = {
	status: "ACCEPTED" | "DISMISSED";
	business: string;
	record: string;
	detail: string | null;
	reason: string | null;
	at: Date;
};

const CONTACT_DETAIL = {
	firstName: true,
	lastName: true,
	title: true,
	company: { select: { name: true } },
} as const;

type ContactDetail = {
	firstName: string;
	lastName: string | null;
	title: string | null;
	company: { name: string } | null;
};

type RecordDescription = Pick<FilingDecision, "record" | "detail">;

function describeRecord(
	company: { name: string; domain: string | null } | null,
	contact: ContactDetail | null,
): RecordDescription {
	if (company) return { record: company.name, detail: company.domain };

	return {
		record: [contact?.firstName, contact?.lastName].filter(Boolean).join(" "),
		detail:
			[contact?.title, contact?.company?.name].filter(Boolean).join(" at ") ||
			null,
	};
}

async function suggestionDecisions(limit: number): Promise<FilingDecision[]> {
	const rows = await db.businessSuggestion.findMany({
		where: {
			status: { in: ["ACCEPTED", "DISMISSED"] },
			decidedById: { not: null },
			decidedAt: { not: null },
		},
		orderBy: [{ decidedAt: "desc" }, { id: "asc" }],
		take: limit,
		select: {
			status: true,
			reason: true,
			decidedAt: true,
			business: { select: { name: true } },
			company: { select: { name: true, domain: true } },
			contact: { select: CONTACT_DETAIL },
		},
	});

	return rows.flatMap((row) =>
		row.status === "PROPOSED" || !row.decidedAt
			? []
			: [
					{
						status: row.status,
						business: row.business.name,
						...describeRecord(row.company, row.contact),
						reason: row.reason,
						at: row.decidedAt,
					},
				],
	);
}

async function manualFilings(limit: number): Promise<FilingDecision[]> {
	const where = { source: "MANUAL", addedById: { not: null } } as const;
	const orderBy = [{ createdAt: "desc" as const }];

	const [companies, contacts] = await Promise.all([
		db.companyBusiness.findMany({
			where,
			orderBy,
			take: limit,
			select: {
				createdAt: true,
				business: { select: { name: true } },
				company: { select: { name: true, domain: true } },
			},
		}),
		db.contactBusiness.findMany({
			where,
			orderBy,
			take: limit,
			select: {
				createdAt: true,
				business: { select: { name: true } },
				contact: { select: CONTACT_DETAIL },
			},
		}),
	]);

	return [
		...companies.map((row) => ({
			status: "ACCEPTED" as const,
			business: row.business.name,
			...describeRecord(row.company, null),
			reason: null,
			at: row.createdAt,
		})),
		...contacts.map((row) => ({
			status: "ACCEPTED" as const,
			business: row.business.name,
			...describeRecord(null, row.contact),
			reason: null,
			at: row.createdAt,
		})),
	];
}

export async function recentDecisions(
	limit: number = BUSINESS_FILING.learning.examples,
): Promise<FilingDecision[]> {
	const [answered, filed] = await Promise.all([
		suggestionDecisions(limit),
		manualFilings(limit),
	]);

	return [...answered, ...filed]
		.sort((left, right) => right.at.getTime() - left.at.getTime())
		.slice(0, limit);
}

export function decisionsMarkdown(decisions: FilingDecision[]): string {
	if (decisions.length === 0) return "";

	const lines = decisions.map((decision) => {
		const who = decision.detail
			? `**${decision.record}** (${decision.detail})`
			: `**${decision.record}**`;
		return decision.status === "ACCEPTED"
			? `- A person filed ${who} into **${decision.business}**.`
			: `- A person ruled ${who} out of **${decision.business}**${decision.reason ? `: ${decision.reason}` : "."}`;
	});

	return [
		"## How people have filed recently",
		"",
		"Follow the same judgement. These are real decisions, newest first.",
		"",
		...lines,
	].join("\n");
}
