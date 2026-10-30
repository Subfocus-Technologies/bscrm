import { db } from "@crm/db";
import { queueInvestorTasks } from "@crm/db/investors";
import {
	INVESTORS,
	parseInvestorFit,
	parseInvestorProfile,
} from "@crm/validation/investors";
import { withoutEmDashes } from "@crm/validation/plain-text";
import { fundraiseMarkdown } from "./investors";

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STAGES = ["APPROVED", "CONTACTED"] as const;

function words(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

async function loadInvestor(investorId: string) {
	return db.investor.findUnique({
		where: { id: investorId },
		include: {
			fundraise: { include: { createdBy: { select: { name: true } } } },
			emails: {
				where: { status: "SENT" },
				orderBy: { step: "asc" },
				select: { step: true, subject: true, body: true, sentAt: true },
			},
		},
	});
}

export async function outreachPreamble(
	investorId: string | null,
): Promise<string | null> {
	const investor = investorId ? await loadInvestor(investorId) : null;
	if (!investor) return null;

	const fundraise = {
		...investor.fundraise,
		profile: parseInvestorProfile(investor.fundraise.profile),
	};
	const fit = parseInvestorFit(investor.fit);
	const evidence = (fit?.reasons ?? [])
		.filter((reason) => reason.met && reason.quote)
		.map((reason) => `- ${reason.note} ("${reason.quote}")`);
	const followUp = investor.emails.length > 0;
	const founder = investor.fundraise.createdBy?.name ?? "the founder";

	return [
		followUp
			? `**This is an investor-outreach task: a follow-up.** ${investor.name} has not replied to the emails below. Write follow-up number ${investor.emails.length}: shorter than the first, add one new and true piece of news or proof from our raise, and ask once more for a short call. Do not repeat the first email.`
			: `**This is an investor-outreach task: a first email.** Write the first email from ${founder} to ${investor.name}. Open with one specific, true reason you are writing to them in particular, taken from the evidence below. Say in two sentences what we do and our strongest traction, then ask for a 20 minute call.`,
		`Call \`draft_investor_email\` once. A person reads and approves it before anything is sent. Rules: at most ${INVESTORS.outreach.maxWords} words; British English; plain text, no markdown and no links you did not read; do not sign off with a name (the sender's name is added); never invent a fact, a mutual contact or a number; no "I hope this finds you well".`,
		`## The investor\nName: ${investor.name}${investor.firm ? `\nFirm: ${investor.firm}` : ""}${fit?.summary ? `\nWhy they fit: ${fit.summary}` : ""}${evidence.length > 0 ? `\nEvidence:\n${evidence.join("\n")}` : ""}`,
		followUp
			? `## Emails already sent\n${investor.emails
					.map(
						(email) =>
							`### ${email.sentAt?.toDateString() ?? "Sent"}: ${email.subject}\n${email.body}`,
					)
					.join("\n\n")}`
			: null,
		fundraiseMarkdown(fundraise),
	]
		.filter(Boolean)
		.join("\n\n");
}

export async function draftInvestorEmail(input: {
	investorId: string;
	subject: string;
	body: string;
}): Promise<
	{ ok: true; emailId: string; step: number } | { ok: false; reason: string }
> {
	const investor = await loadInvestor(input.investorId);
	if (!investor) return { ok: false, reason: "There is no such investor." };
	if (!(OPEN_STAGES as readonly string[]).includes(investor.stage)) {
		return {
			ok: false,
			reason: "This investor is no longer waiting for an email.",
		};
	}

	const count = words(input.body);
	if (count > INVESTORS.outreach.maxWords) {
		return {
			ok: false,
			reason: `That is ${count} words; keep it to ${INVESTORS.outreach.maxWords}.`,
		};
	}

	const step = investor.emails.length;
	const first = investor.emails[0];
	const subject = first
		? `Re: ${first.subject.replace(/^re:\s*/i, "")}`
		: input.subject;

	const existing = await db.investorEmail.findFirst({
		where: { investorId: investor.id, status: "DRAFT" },
		select: { id: true },
	});
	const email = existing
		? await db.investorEmail.update({
				where: { id: existing.id },
				data: { step, subject, body: withoutEmDashes(input.body) },
				select: { id: true },
			})
		: await db.investorEmail.create({
				data: {
					investorId: investor.id,
					step,
					subject,
					body: withoutEmDashes(input.body),
				},
				select: { id: true },
			});

	return { ok: true, emailId: email.id, step };
}

export type OutreachPreflight =
	| { kind: "research" }
	| { kind: "done"; outcome: string };

export async function preflightOutreach(
	investorId: string | null,
): Promise<OutreachPreflight> {
	if (!investorId)
		return { kind: "done", outcome: "The task names no investor." };

	const investor = await db.investor.findUnique({
		where: { id: investorId },
		select: {
			stage: true,
			email: true,
			emails: { where: { status: "DRAFT" }, select: { id: true } },
		},
	});
	if (!investor) return { kind: "done", outcome: "The investor is gone." };
	if (!(OPEN_STAGES as readonly string[]).includes(investor.stage)) {
		return {
			kind: "done",
			outcome: "The investor is no longer waiting for an email.",
		};
	}
	if (!investor.email) {
		return { kind: "done", outcome: "The investor has no email address yet." };
	}
	if (investor.emails.length > 0) {
		return {
			kind: "done",
			outcome: "A draft is already waiting for approval.",
		};
	}

	return { kind: "research" };
}

export async function queueDueFollowUps(now = new Date()): Promise<number> {
	const { followUpDays, followUpsPerTick, draftBudget } = INVESTORS.outreach;

	const candidates = await db.investor.findMany({
		where: {
			stage: "CONTACTED",
			repliedAt: null,
			email: { not: null },
			emails: { some: { status: "SENT" }, none: { status: "DRAFT" } },
		},
		orderBy: { contactedAt: "asc" },
		take: followUpsPerTick * 5,
		select: {
			id: true,
			fundraiseId: true,
			emails: {
				where: { status: "SENT" },
				orderBy: { sentAt: "desc" },
				select: { sentAt: true },
			},
		},
	});

	const due = candidates.filter((investor) => {
		const sent = investor.emails.length;
		const wait = followUpDays[sent - 1];
		const last = investor.emails[0]?.sentAt;
		return (
			wait !== undefined &&
			last !== null &&
			last !== undefined &&
			last.getTime() + wait * DAY_MS <= now.getTime()
		);
	});

	const attempted = await db.agentTask.findMany({
		where: {
			kind: "investor-outreach",
			subject: { in: due.map((investor) => investor.id) },
		},
		select: { subject: true, createdAt: true },
	});
	const lastAttempt = new Map<string, number>();
	for (const task of attempted) {
		if (!task.subject) continue;
		const at = task.createdAt.getTime();
		lastAttempt.set(
			task.subject,
			Math.max(at, lastAttempt.get(task.subject) ?? 0),
		);
	}

	const fresh = due
		.filter(
			(investor) =>
				(lastAttempt.get(investor.id) ?? 0) <
				(investor.emails[0]?.sentAt?.getTime() ?? 0),
		)
		.slice(0, followUpsPerTick);

	const byRaise = new Map<string, string[]>();
	for (const investor of fresh) {
		byRaise.set(investor.fundraiseId, [
			...(byRaise.get(investor.fundraiseId) ?? []),
			investor.id,
		]);
	}

	let queued = 0;
	for (const [fundraiseId, investorIds] of byRaise) {
		queued += await queueInvestorTasks(db, {
			kind: "investor-outreach",
			fundraiseId,
			investorIds,
			reason: "Write a follow-up to an investor who has not replied",
			budget: draftBudget,
		});
	}

	return queued;
}
