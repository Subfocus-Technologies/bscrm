import { PRIORITY } from "./agent-tasks";
import type { Db } from "./client";
import { workspaceDayStart } from "./day";
import { normalizeDomain } from "./domain";
import type { Prisma } from "./generated/prisma/client";
import type { InvestorKind, InvestorSource } from "./generated/prisma/enums";

type Client = Db | Prisma.TransactionClient;

export type NewInvestor = {
	name: string;
	kind?: InvestorKind;
	firm?: string | null;
	website?: string | null;
	linkedinUrl?: string | null;
	email?: string | null;
	location?: string | null;
	stages?: string[];
	sectors?: string[];
	chequeMin?: number | null;
	chequeMax?: number | null;
	thesis?: string | null;
	notes?: string | null;
	sourceDetail?: string | null;
};

export type AddedInvestors = {
	created: { id: string; name: string }[];
	duplicates: string[];
};

function squash(text: string | null | undefined): string {
	return (text ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function linkedinKey(url: string | null | undefined): string | null {
	const match = /linkedin\.com\/(in|company|pub)\/([^/?#\s]+)/i.exec(url ?? "");
	return match?.[1] && match[2]
		? `${match[1].toLowerCase()}/${decodeURIComponent(match[2]).toLowerCase()}`
		: null;
}

export function investorDedupeKey(investor: NewInvestor): string {
	const linkedin = linkedinKey(investor.linkedinUrl);
	if (linkedin) return `linkedin:${linkedin}`;

	const email = investor.email?.trim().toLowerCase();
	if (email) return `email:${email}`;

	const domain =
		investor.kind === "ANGEL" ? null : normalizeDomain(investor.website);
	if (domain) return `domain:${domain}`;

	return `name:${squash(investor.name)}|${squash(investor.firm)}`;
}

function blankToNull(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export async function addInvestors(
	client: Client,
	input: {
		fundraiseId: string;
		investors: readonly NewInvestor[];
		source: InvestorSource;
		createdById: string | null;
	},
): Promise<AddedInvestors> {
	const byKey = new Map<string, NewInvestor>();
	const duplicates: string[] = [];

	for (const investor of input.investors) {
		const key = investorDedupeKey(investor);
		if (byKey.has(key)) duplicates.push(investor.name);
		else byKey.set(key, investor);
	}

	const existing = await client.investor.findMany({
		where: {
			fundraiseId: input.fundraiseId,
			dedupeKey: { in: [...byKey.keys()] },
		},
		select: { dedupeKey: true },
	});
	for (const row of existing) {
		const investor = byKey.get(row.dedupeKey);
		if (investor) duplicates.push(investor.name);
		byKey.delete(row.dedupeKey);
	}

	const created = await client.investor.createManyAndReturn({
		data: [...byKey.entries()].map(([dedupeKey, investor]) => ({
			fundraiseId: input.fundraiseId,
			dedupeKey,
			name: investor.name.trim(),
			kind: investor.kind ?? "OTHER",
			firm: blankToNull(investor.firm),
			website: blankToNull(investor.website),
			linkedinUrl: blankToNull(investor.linkedinUrl),
			email: blankToNull(investor.email)?.toLowerCase() ?? null,
			location: blankToNull(investor.location),
			stages: investor.stages ?? [],
			sectors: investor.sectors ?? [],
			chequeMin: investor.chequeMin ?? null,
			chequeMax: investor.chequeMax ?? null,
			thesis: blankToNull(investor.thesis),
			notes: blankToNull(investor.notes),
			source: input.source,
			sourceDetail: blankToNull(investor.sourceDetail),
			createdById: input.createdById,
			stageChangedById: input.createdById,
		})),
		skipDuplicates: true,
		select: { id: true, name: true },
	});

	return { created, duplicates };
}

export async function investorResearchRunsToday(
	client: Client,
	now = new Date(),
): Promise<number> {
	return client.agentTask.count({
		where: {
			kind: "investor-research",
			sessionId: { not: null },
			startedAt: { gte: workspaceDayStart(now) },
		},
	});
}

export async function queueInvestorResearchTasks(
	client: Client,
	input: {
		fundraiseId: string;
		investorIds: readonly string[];
		reason: string;
		budget: number;
	},
): Promise<number> {
	if (input.investorIds.length === 0) return 0;

	const pending = await client.agentTask.findMany({
		where: {
			kind: "investor-research",
			finishedAt: null,
			subject: { in: [...input.investorIds] },
		},
		select: { subject: true },
	});
	const waiting = new Set(pending.map((task) => task.subject));
	const now = new Date();

	const { count } = await client.agentTask.createMany({
		data: input.investorIds
			.filter((id) => !waiting.has(id))
			.map((investorId) => ({
				kind: "investor-research",
				reason: input.reason,
				priority: PRIORITY.investorResearch,
				budget: input.budget,
				dueAt: now,
				subject: investorId,
				payload: { fundraiseId: input.fundraiseId, investorId },
			})),
	});

	return count;
}
