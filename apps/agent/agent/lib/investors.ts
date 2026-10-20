import { db, type Prisma } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { nextWorkspaceDayStart } from "@crm/db/day";
import {
	addInvestors,
	investorResearchRunsToday,
	type NewInvestor,
	queueInvestorResearchTasks,
} from "@crm/db/investors";
import {
	type FitReason,
	fitScore,
	INVESTORS,
	type InvestorKind,
	type InvestorTaskPayload,
	investorTaskPayload,
	type ProfileCriterion,
	parseInvestorProfile,
} from "@crm/validation/investors";

const HOUR_MS = 60 * 60 * 1000;

const KIND_LABEL = {
	ANGEL: "angel investor",
	ANGEL_GROUP: "angel group or network",
	VC: "venture capital firm",
	FAMILY_OFFICE: "family office",
	CORPORATE_VC: "corporate venture arm",
	ACCELERATOR: "accelerator",
	OTHER: "other investor",
} satisfies Record<InvestorKind, string>;

const CRITERION_HEADING = {
	MUST: "Must have",
	NICE: "Nice to have",
	RULE_OUT: "Rules them out",
} satisfies Record<ProfileCriterion["kind"], string>;

export function investorPayload(
	payload: Prisma.JsonValue,
): InvestorTaskPayload | null {
	const parsed = investorTaskPayload.safeParse(payload);
	return parsed.success ? parsed.data : null;
}

async function loadFundraise(fundraiseId: string) {
	const row = await db.fundraise.findUnique({ where: { id: fundraiseId } });
	return row ? { ...row, profile: parseInvestorProfile(row.profile) } : null;
}

type LoadedFundraise = NonNullable<Awaited<ReturnType<typeof loadFundraise>>>;

function criteriaMarkdown(criteria: readonly ProfileCriterion[]): string {
	const groups = (["MUST", "NICE", "RULE_OUT"] as const).map((kind) => {
		const rows = criteria.filter((criterion) => criterion.kind === kind);
		if (rows.length === 0) return null;
		return [
			`**${CRITERION_HEADING[kind]}**`,
			...rows.map(
				(criterion) =>
					`- \`${criterion.id}\` ${criterion.label}${criterion.values.length > 0 ? `: ${criterion.values.join(", ")}` : ""}${kind === "RULE_OUT" ? "" : ` (weight ${criterion.weight})`}`,
			),
		].join("\n");
	});
	return groups.filter(Boolean).join("\n\n");
}

export function fundraiseMarkdown(fundraise: LoadedFundraise): string {
	const round = fundraise.roundSize
		? `${fundraise.roundCurrency} ${fundraise.roundSize.toNumber().toLocaleString("en-GB")}`
		: "not set";

	return [
		`## Our raise: ${fundraise.name}`,
		`Company: ${fundraise.company}${fundraise.website ? ` (${fundraise.website})` : ""}. Round size: ${round}.`,
		fundraise.summary ? `What we do: ${fundraise.summary}` : null,
		fundraise.whyNow ? `Why us, why now: ${fundraise.whyNow}` : null,
		fundraise.traction ? `Traction: ${fundraise.traction}` : null,
		"",
		"## Ideal investor profile",
		criteriaMarkdown(fundraise.profile.criteria),
	]
		.filter((line) => line !== null)
		.join("\n");
}

async function knownNames(fundraiseId: string): Promise<string[]> {
	const rows = await db.investor.findMany({
		where: { fundraiseId },
		orderBy: { createdAt: "desc" },
		take: INVESTORS.discovery.knownNames,
		select: { name: true, firm: true },
	});
	return rows.map((row) => (row.firm ? `${row.name} (${row.firm})` : row.name));
}

export async function investorPreamble(
	kind: string,
	fundraiseId: string | null,
	investorId: string | null,
): Promise<string | null> {
	const fundraise = fundraiseId ? await loadFundraise(fundraiseId) : null;
	if (!fundraise) return null;

	if (kind === "investor-discovery") {
		const known = await knownNames(fundraise.id);
		return [
			"**This is an investor-discovery task.** Find UK investors we have not met who could back this raise: angel groups and networks, individual angels who invest at pre-seed, and pre-seed or seed venture firms. Prefer ones that fit the must-haves below.",
			`Search the web, read what you find, and call \`add_investors\` with up to ${INVESTORS.discovery.perRun} of the best. The tool already knows which raise this is, so you pass no id. Every investor needs at least one source URL that shows they invest at our stage or in our sector. Use real names only. Never invent an email address. Skip anyone in the list of investors we already have.`,
			fundraiseMarkdown(fundraise),
			known.length > 0
				? `## Investors we already have\n${known.join("; ")}`
				: "## Investors we already have\nNone yet.",
		].join("\n\n");
	}

	const investor = investorId
		? await db.investor.findFirst({
				where: { id: investorId, fundraiseId: fundraise.id },
			})
		: null;
	if (!investor) return null;

	const facts = [
		`Name: ${investor.name}`,
		`Type: ${KIND_LABEL[investor.kind]}`,
		investor.firm ? `Firm: ${investor.firm}` : null,
		investor.website ? `Website: ${investor.website}` : null,
		investor.linkedinUrl ? `LinkedIn: ${investor.linkedinUrl}` : null,
		investor.location ? `Location: ${investor.location}` : null,
		investor.sectors.length > 0
			? `Sectors: ${investor.sectors.join(", ")}`
			: null,
		investor.stages.length > 0 ? `Stages: ${investor.stages.join(", ")}` : null,
		investor.thesis ? `Thesis: ${investor.thesis}` : null,
		investor.sourceDetail
			? `Where they came from: ${investor.sourceDetail}`
			: null,
	].filter(Boolean);

	return [
		`**This is an investor-research task.** Research the investor below and score how well they fit our raise. Read their website and recent deals, and their LinkedIn when there is one. Then call \`score_investor\` once with a verdict for every criterion id in the profile. For each criterion you mark as met, give the URL you read and copy the exact words from it that show it.

Be strict; a score that flatters everyone is useless. Mark a criterion met only when a source shows it for this investor specifically: a named portfolio company, a deal they did, or their own stated thesis or cheque size. A generalist fund that "backs great founders" or "invests in technology" does not meet a sector criterion; it needs a proptech, real estate or AI company in its portfolio or thesis. "Writes cheques at our stage" needs a pre-seed or seed deal in the last three years or a stated pre-seed cheque. When you are unsure, mark it not met and say what is missing. Missing a must-have caps the score at ${INVESTORS.scoring.mustMissCap}.

Fill in missing facts (type, website, LinkedIn, location, sectors, stages, cheque size, thesis) only from what you read. Record an email address only when the investor publishes it.`,
		`## The investor\n${facts.join("\n")}`,
		fundraiseMarkdown(fundraise),
	].join("\n\n");
}

export async function addDiscoveredInvestors(
	fundraiseId: string,
	investors: readonly NewInvestor[],
): Promise<{ added: string[]; alreadyKnown: string[] }> {
	const result = await addInvestors(db, {
		fundraiseId,
		investors,
		source: "AGENT",
		createdById: null,
	});

	await queueInvestorResearchTasks(db, {
		fundraiseId,
		investorIds: result.created.map((investor) => investor.id),
		reason: "Score an investor the agent found",
		budget: INVESTORS.research.budget,
	});

	return {
		added: result.created.map((investor) => investor.name),
		alreadyKnown: result.duplicates,
	};
}

export type InvestorFacts = {
	kind?: InvestorKind;
	website?: string | null;
	linkedinUrl?: string | null;
	email?: string | null;
	location?: string | null;
	stages?: string[];
	sectors?: string[];
	chequeMin?: number | null;
	chequeMax?: number | null;
	thesis?: string | null;
};

function fillBlank<T>(current: T | null, next: T | null | undefined): T | null {
	return current ?? next ?? null;
}

export async function scoreInvestor(input: {
	investorId: string;
	summary: string;
	reasons: FitReason[];
	facts: InvestorFacts;
}): Promise<
	| { ok: true; score: number; ruledOut: boolean; ignored: string[] }
	| { ok: false; reason: string }
> {
	const investor = await db.investor.findUnique({
		where: { id: input.investorId },
		include: { fundraise: { select: { profile: true } } },
	});
	if (!investor)
		return { ok: false, reason: "There is no investor with that id." };

	const criteria = parseInvestorProfile(investor.fundraise.profile).criteria;
	const known = new Set(criteria.map((criterion) => criterion.id));
	const reasons = input.reasons.filter((reason) =>
		known.has(reason.criterionId),
	);
	const ignored = input.reasons
		.filter((reason) => !known.has(reason.criterionId))
		.map((reason) => reason.criterionId);
	const unsourced = reasons.filter(
		(reason) => reason.met && (!reason.sourceUrl || !reason.quote),
	);
	if (unsourced.length > 0) {
		return {
			ok: false,
			reason: `Give a source URL and the words from it for every criterion you mark as met: ${unsourced.map((reason) => reason.criterionId).join(", ")}.`,
		};
	}

	const { score, ruledOut } = fitScore(criteria, reasons);
	const facts = input.facts;

	await db.investor.update({
		where: { id: investor.id },
		data: {
			fitScore: score,
			fit: { summary: input.summary, ruledOut, reasons },
			researchedAt: new Date(),
			kind:
				investor.kind === "OTHER" && facts.kind ? facts.kind : investor.kind,
			website: fillBlank(investor.website, facts.website),
			linkedinUrl: fillBlank(investor.linkedinUrl, facts.linkedinUrl),
			email: fillBlank(investor.email, facts.email?.toLowerCase()),
			location: fillBlank(investor.location, facts.location),
			thesis: fillBlank(investor.thesis, facts.thesis),
			stages:
				investor.stages.length > 0 ? investor.stages : (facts.stages ?? []),
			sectors:
				investor.sectors.length > 0 ? investor.sectors : (facts.sectors ?? []),
			chequeMin: investor.chequeMin ?? facts.chequeMin ?? null,
			chequeMax: investor.chequeMax ?? facts.chequeMax ?? null,
		},
	});

	return { ok: true, score, ruledOut, ignored };
}

export type InvestorPreflight =
	| { kind: "research" }
	| { kind: "done"; outcome: string }
	| { kind: "deferred"; until: Date; reason: string };

export async function preflightInvestorResearch(
	payload: Prisma.JsonValue,
	now = new Date(),
): Promise<InvestorPreflight> {
	const parsed = investorPayload(payload);
	if (!parsed) return { kind: "done", outcome: "The task names no fundraise." };

	const fundraise = await db.fundraise.findUnique({
		where: { id: parsed.fundraiseId },
		select: { researchDailyLimit: true },
	});
	if (!fundraise) return { kind: "done", outcome: "The fundraise is gone." };

	const used = await investorResearchRunsToday(db, now);
	if (used >= fundraise.researchDailyLimit) {
		return {
			kind: "deferred",
			until: nextWorkspaceDayStart(now),
			reason: `Waiting for tomorrow: today's limit of ${fundraise.researchDailyLimit} investor research sessions is used up.`,
		};
	}

	return { kind: "research" };
}

export async function queueScheduledDiscovery(
	now = new Date(),
): Promise<number> {
	const since = new Date(
		now.getTime() - INVESTORS.discovery.everyHours * HOUR_MS,
	);
	const fundraises = await db.fundraise.findMany({
		where: { autoDiscover: true },
		select: { id: true, profile: true },
	});

	let queued = 0;
	for (const fundraise of fundraises) {
		if (parseInvestorProfile(fundraise.profile).criteria.length === 0) continue;

		const recent = await db.agentTask.count({
			where: {
				kind: "investor-discovery",
				subject: fundraise.id,
				OR: [{ finishedAt: null }, { createdAt: { gte: since } }],
			},
		});
		if (recent > 0) continue;

		await db.agentTask.create({
			data: {
				kind: "investor-discovery",
				reason: "The daily search for new investors",
				priority: PRIORITY.investorDiscovery,
				budget: INVESTORS.discovery.budget,
				dueAt: now,
				subject: fundraise.id,
				payload: { fundraiseId: fundraise.id } satisfies InvestorTaskPayload,
			},
		});
		queued += 1;
	}

	return queued;
}
