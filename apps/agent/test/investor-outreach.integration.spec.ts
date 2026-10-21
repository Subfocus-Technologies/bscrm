import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	draftInvestorEmail,
	outreachPreamble,
	preflightOutreach,
	queueDueFollowUps,
} from "../agent/lib/investor-outreach";

const LATER_THAN_OTHER_SUITES = new Date("2998-01-01T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

let fundraiseId: string;
let investorId: string;

async function clean() {
	const ours = await db.fundraise.findMany({
		where: { createdAt: LATER_THAN_OTHER_SUITES },
		select: { id: true, investors: { select: { id: true } } },
	});
	await db.agentTask.deleteMany({
		where: {
			kind: "investor-outreach",
			subject: {
				in: ours.flatMap((raise) =>
					raise.investors.map((investor) => investor.id),
				),
			},
		},
	});
	await db.fundraise.deleteMany({
		where: { createdAt: LATER_THAN_OTHER_SUITES },
	});
}

beforeEach(async () => {
	await clean();
	const fundraise = await db.fundraise.create({
		data: {
			name: "Outreach spec raise",
			company: "Bricksmart.ai",
			traction: "£65,000 revenue since July.",
			profile: { criteria: [] },
			createdAt: LATER_THAN_OTHER_SUITES,
		},
		select: { id: true },
	});
	fundraiseId = fundraise.id;
	const investor = await db.investor.create({
		data: {
			fundraiseId,
			name: "Proptech Seed Fund",
			kind: "VC",
			email: "deals@seed.example",
			source: "AGENT",
			dedupeKey: `outreach-spec-${Date.now()}`,
			stage: "APPROVED",
		},
		select: { id: true },
	});
	investorId = investor.id;
});

afterAll(clean);

describe("drafting investor emails", () => {
	it("saves a first draft, replaces it, and keeps the subject on follow-ups", async () => {
		const first = await draftInvestorEmail({
			investorId,
			subject: "Bricksmart.ai pre-seed",
			body: "A short first email.",
		});
		const again = await draftInvestorEmail({
			investorId,
			subject: "Another subject",
			body: "A better first email.",
		});
		expect(first).toMatchObject({ ok: true, step: 0 });
		expect(again).toMatchObject({ ok: true, step: 0 });
		expect(await db.investorEmail.count({ where: { investorId } })).toBe(1);

		await db.investorEmail.updateMany({
			where: { investorId },
			data: {
				status: "SENT",
				sentAt: new Date(),
				subject: "Bricksmart.ai pre-seed",
			},
		});
		await db.investor.update({
			where: { id: investorId },
			data: { stage: "CONTACTED" },
		});

		const followUp = await draftInvestorEmail({
			investorId,
			subject: "ignored",
			body: "Following up with one new number.",
		});
		expect(followUp).toMatchObject({ ok: true, step: 1 });
		const saved = await db.investorEmail.findFirstOrThrow({
			where: { investorId, status: "DRAFT" },
			select: { subject: true },
		});
		expect(saved.subject).toBe("Re: Bricksmart.ai pre-seed");
	});

	it("refuses an email that is too long, or to an investor who replied", async () => {
		const long = await draftInvestorEmail({
			investorId,
			subject: "Hi",
			body: Array.from({ length: 200 }, () => "word").join(" "),
		});
		expect(long).toEqual({
			ok: false,
			reason: "That is 200 words; keep it to 180.",
		});

		await db.investor.update({
			where: { id: investorId },
			data: { stage: "REPLIED" },
		});
		expect(
			await draftInvestorEmail({ investorId, subject: "Hi", body: "Hi" }),
		).toEqual({
			ok: false,
			reason: "This investor is no longer waiting for an email.",
		});
	});

	it("skips the session when there is nothing to write", async () => {
		expect(await preflightOutreach(investorId)).toEqual({ kind: "research" });
		await db.investor.update({
			where: { id: investorId },
			data: { email: null },
		});
		expect(await preflightOutreach(investorId)).toEqual({
			kind: "done",
			outcome: "The investor has no email address yet.",
		});
	});

	it("briefs the agent with the evidence and the rules", async () => {
		const markdown = await outreachPreamble(investorId);
		expect(markdown).toContain("investor-outreach task: a first email");
		expect(markdown).toContain("at most 180 words");
		expect(markdown).toContain("£65,000 revenue since July.");
	});
});

describe("follow-ups", () => {
	it("queues one follow-up once the wait has passed, and not again", async () => {
		const sentAt = new Date(Date.now() - 5 * DAY_MS);
		await db.investorEmail.create({
			data: {
				investorId,
				step: 0,
				subject: "Hi",
				body: "Hi",
				status: "SENT",
				sentAt,
			},
		});
		await db.investor.update({
			where: { id: investorId },
			data: { stage: "CONTACTED", contactedAt: sentAt },
		});

		await queueDueFollowUps();
		await queueDueFollowUps();
		await db.agentTask.updateMany({
			where: { kind: "investor-outreach", subject: investorId },
			data: { finishedAt: new Date(), outcome: "ran" },
		});
		await queueDueFollowUps();

		expect(
			await db.agentTask.count({
				where: { kind: "investor-outreach", subject: investorId },
			}),
		).toBe(1);
	});

	it("waits while the first email is still recent", async () => {
		await db.investorEmail.create({
			data: {
				investorId,
				step: 0,
				subject: "Hi",
				body: "Hi",
				status: "SENT",
				sentAt: new Date(),
			},
		});
		await db.investor.update({
			where: { id: investorId },
			data: { stage: "CONTACTED" },
		});

		await queueDueFollowUps();

		expect(
			await db.agentTask.count({
				where: { kind: "investor-outreach", subject: investorId },
			}),
		).toBe(0);
	});
});
