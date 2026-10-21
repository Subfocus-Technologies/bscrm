import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import { noticeInvestorReply } from "@crm/db/investors";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import type { GmailClient } from "../src/google/gmail.client";
import { InvestorOutreachService } from "../src/investors/investor-outreach.service";
import type { InvestorImportRow } from "../src/investors/investors.contracts";
import { InvestorsService } from "../src/investors/investors.service";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";

const suffix = process.env.TEST_RUN_ID ?? "investors-spec";
const userId = `investors-user-${suffix}`;

const research: string[][] = [];
const discovery: string[] = [];
const agent = {
	investorResearchRequested: async (_fundraiseId: string, ids: string[]) => {
		research.push(ids);
		return ids.length;
	},
	investorDiscoveryRequested: async (fundraiseId: string) => {
		discovery.push(fundraiseId);
		return true;
	},
	investorOutreachRequested: async (_fundraiseId: string, ids: string[]) => {
		drafting.push(ids);
		return ids.length;
	},
} as unknown as AgentTriggerService;

const drafting: string[][] = [];
const sentRaw: { raw: string; threadId: string | null }[] = [];
let canSend = true;
const gmail = {
	sendMessage: async (
		_token: string,
		input: { raw: string; threadId: string | null },
	) => {
		sentRaw.push(input);
		return {
			outcome: "ok" as const,
			data: { id: `gmail-${sentRaw.length}`, threadId: "thread-1" },
		};
	},
	getMessage: async (_token: string, id: string) => ({
		outcome: "ok" as const,
		data: {
			id,
			payload: { headers: [{ name: "Message-ID", value: `<${id}@mail>` }] },
		},
	}),
} as unknown as GmailClient;
const tokens = {
	canSendGmail: async () => canSend,
	gmailSendToken: async () =>
		canSend
			? { outcome: "ok" as const, accessToken: "token" }
			: { outcome: "not-connected" as const, reason: "no" },
} as unknown as MailboxTokenService;

const outreach = new InvestorOutreachService(db, agent, gmail, tokens);
const investors = new InvestorsService(db, agent, outreach);

const PROFILE = {
	criteria: [
		{
			id: "sector",
			kind: "MUST" as const,
			label: "Invests in our sector",
			values: ["PropTech"],
			weight: 80,
		},
		{
			id: "uk",
			kind: "NICE" as const,
			label: "UK",
			values: ["United Kingdom"],
			weight: 20,
		},
	],
};

function row(
	name: string,
	extra: Partial<InvestorImportRow> = {},
): InvestorImportRow {
	return {
		name,
		kind: "VC" as const,
		firm: null,
		website: null,
		linkedinUrl: null,
		email: null,
		location: null,
		stages: [],
		sectors: [],
		chequeMinCents: null,
		chequeMaxCents: null,
		thesis: null,
		notes: null,
		...extra,
	};
}

const OTHER_SUITES_FROM = new Date("2900-01-01T00:00:00Z");

async function clean() {
	await db.fundraise.deleteMany({
		where: { createdAt: { lt: OTHER_SUITES_FROM } },
	});
	await db.user.deleteMany({ where: { id: userId } });
}

async function saveProfile(criteria = PROFILE) {
	return investors.save(
		{
			name: `Raise ${suffix}`,
			company: "Bricksmart.ai",
			summary: null,
			whyNow: null,
			traction: null,
			website: null,
			founderLinkedIn: null,
			roundSizeCents: 50_000_000,
			profile: criteria,
			researchDailyLimit: 40,
			autoDiscover: true,
			weeklyMeetingTarget: 5,
		},
		userId,
	);
}

beforeEach(async () => {
	await clean();
	research.length = 0;
	discovery.length = 0;
	drafting.length = 0;
	sentRaw.length = 0;
	canSend = true;
	await db.user.create({
		data: { id: userId, name: "Sayu", email: `${userId}@example.test` },
	});
});

afterAll(clean);

describe("the fundraise profile", () => {
	it("is empty until someone fills it in, then keeps one raise", async () => {
		expect(await investors.fundraise()).toBeNull();

		const first = await saveProfile();
		const second = await saveProfile({ criteria: [] });

		expect(second.id).toBe(first.id);
		expect(second.roundSizeCents).toBe(50_000_000);
		expect(
			await db.fundraise.count({
				where: { createdAt: { lt: OTHER_SUITES_FROM } },
			}),
		).toBe(1);
	});
});

describe("importing investors", () => {
	it("adds new investors, skips duplicates and asks for research", async () => {
		await saveProfile();

		const first = await investors.importRows(
			{
				label: "Jenna shortlist",
				rows: [
					row("NOA", { website: "https://www.noa.co" }),
					row("NOA Ventures", { website: "noa.co" }),
					row("Jane Angel", {
						kind: "ANGEL",
						linkedinUrl: "https://www.linkedin.com/in/jane-angel/",
					}),
				],
			},
			userId,
		);

		expect(first).toEqual({ created: 2, duplicates: 1, queued: 2 });
		expect(research).toHaveLength(1);

		const again = await investors.importRows(
			{
				label: "Second list",
				rows: [
					row("Jane A.", {
						kind: "ANGEL",
						linkedinUrl: "linkedin.com/in/Jane-Angel",
					}),
				],
			},
			userId,
		);
		expect(again).toEqual({ created: 0, duplicates: 1, queued: 0 });
	});

	it("needs the fundraise profile first", async () => {
		await expect(
			investors.importRows({ label: "x", rows: [row("A")] }, userId),
		).rejects.toThrow("Set up the fundraise profile first");
	});
});

describe("the investor pipeline", () => {
	it("lists one stage at a time and moves investors along", async () => {
		await saveProfile();
		await investors.importRows(
			{ label: "List", rows: [row("Alpha"), row("Beta"), row("Gamma")] },
			userId,
		);
		const toApprove = await investors.list({
			stage: "TO_APPROVE",
			kinds: [],
			q: "",
			sort: "name",
			page: 1,
		});
		expect(toApprove.items.map((item) => item.name)).toEqual([
			"Alpha",
			"Beta",
			"Gamma",
		]);

		const alpha = toApprove.items[0]?.id ?? "";
		expect(
			await investors.setStage({ ids: [alpha], stage: "APPROVED" }, userId),
		).toEqual({ updated: 1 });

		const after = await investors.list({
			stage: "APPROVED",
			kinds: [],
			q: "",
			sort: "fit",
			page: 1,
		});
		expect(after.items.map((item) => item.name)).toEqual(["Alpha"]);
		expect(after.counts.TO_APPROVE).toBe(2);
		expect(after.counts.APPROVED).toBe(1);
		const moved = await db.investor.findUniqueOrThrow({
			where: { id: alpha },
			select: { stageChangedById: true },
		});
		expect(moved.stageChangedById).toBe(userId);
	});

	it("asks the agent to find more only once the profile has criteria", async () => {
		await saveProfile({ criteria: [] });
		await expect(investors.findMore(userId)).rejects.toThrow(
			"Add the ideal investor profile first",
		);

		await saveProfile();
		expect(await investors.findMore(userId)).toEqual({ queued: 1 });
		expect(discovery).toHaveLength(1);
	});

	it("reports the latest agent search and why it stopped", async () => {
		const fundraise = await saveProfile();
		const listFirst = () =>
			investors.list({
				stage: "TO_APPROVE",
				kinds: [],
				q: "",
				sort: "fit",
				page: 1,
			});
		await db.agentTask.deleteMany({
			where: { kind: "investor-discovery", subject: fundraise.id },
		});

		expect((await listFirst()).search).toBeNull();

		await db.agentTask.create({
			data: {
				kind: "investor-discovery",
				reason: "The daily search for new investors",
				dueAt: new Date(),
				subject: fundraise.id,
				attempts: 3,
				finishedAt: new Date(),
				outcome: RETIRED_OUTCOME,
			},
		});
		const failed = (await listFirst()).search;
		expect(failed?.state).toBe("failed");
		expect(failed?.attempts).toBe(3);
		expect(failed?.outcome).toBe(RETIRED_OUTCOME);

		await db.agentTask.create({
			data: {
				kind: "investor-discovery",
				reason: "A person asked the agent to find more investors",
				dueAt: new Date(),
				subject: fundraise.id,
				leasedUntil: new Date(Date.now() + 60_000),
				startedAt: new Date(),
				attempts: 1,
				createdAt: new Date(Date.now() + 1_000),
			},
		});
		expect((await listFirst()).search?.state).toBe("running");

		await db.agentTask.deleteMany({
			where: { kind: "investor-discovery", subject: fundraise.id },
		});
	});
});

async function approvedInvestor(name: string, email: string | null) {
	await saveProfile();
	await investors.importRows(
		{ label: "Outreach", rows: [row(name, { email })] },
		userId,
	);
	const investor = await db.investor.findFirstOrThrow({
		where: { name },
		select: { id: true },
	});
	await investors.setStage({ ids: [investor.id], stage: "APPROVED" }, userId);
	return investor.id;
}

async function draft(investorId: string, step = 0) {
	return db.investorEmail.create({
		data: {
			investorId,
			step,
			subject: "Bricksmart.ai pre-seed",
			body: "Hello, would you take a 20 minute call?",
		},
		select: { id: true },
	});
}

describe("investor outreach", () => {
	it("asks the agent for a first email once an investor with an address is approved", async () => {
		const withAddress = await approvedInvestor(
			"Has Email VC",
			"deals@vc.example",
		);
		const without = await approvedInvestor("No Email VC", null);

		expect(drafting.flat()).toEqual([withAddress]);

		await outreach.setAddress(
			{ investorId: without, email: "hi@noemail.example" },
			userId,
		);
		expect(drafting.flat()).toEqual([withAddress, without]);
	});

	it("sends a draft from the person's Gmail, signed, and marks them contacted", async () => {
		const investorId = await approvedInvestor("Send VC", "deals@send.example");
		const first = await draft(investorId);

		await outreach.send(
			{ id: first.id, subject: "Bricksmart.ai pre-seed", body: "Hello there." },
			userId,
		);

		const raw = Buffer.from(sentRaw[0]?.raw ?? "", "base64url").toString(
			"utf8",
		);
		expect(raw).toContain("To: deals@send.example");
		expect(raw).toContain("Subject: Bricksmart.ai pre-seed");
		expect(
			Buffer.from(raw.split("\r\n\r\n")[1] ?? "", "base64").toString("utf8"),
		).toBe("Hello there.\n\nSayu");
		expect(sentRaw[0]?.threadId).toBeNull();
		const after = await db.investor.findUniqueOrThrow({
			where: { id: investorId },
			select: { stage: true, contactedAt: true },
		});
		expect(after.stage).toBe("CONTACTED");
		expect(after.contactedAt).not.toBeNull();

		const followUp = await draft(investorId, 1);
		await outreach.send(
			{
				id: followUp.id,
				subject: "Re: Bricksmart.ai pre-seed",
				body: "Following up.",
			},
			userId,
		);
		const second = Buffer.from(sentRaw[1]?.raw ?? "", "base64url").toString(
			"utf8",
		);
		expect(sentRaw[1]?.threadId).toBe("thread-1");
		expect(second).toContain("In-Reply-To: <gmail-1@mail>");
	});

	it("refuses without Gmail sending allowed, and past the daily limit", async () => {
		const investorId = await approvedInvestor(
			"Limit VC",
			"deals@limit.example",
		);
		const first = await draft(investorId);

		canSend = false;
		await expect(
			outreach.send({ id: first.id, subject: "Hi", body: "Hi" }, userId),
		).rejects.toThrow("Allow sending from Gmail");

		canSend = true;
		await db.fundraise.updateMany({ data: { dailySendLimit: 0 } });
		await expect(
			outreach.send({ id: first.id, subject: "Hi", body: "Hi" }, userId),
		).rejects.toThrow("Today's limit of 0 investor emails is reached.");
	});

	it("moves an investor to replied and cancels their drafts when they answer", async () => {
		const investorId = await approvedInvestor(
			"Reply VC",
			"deals@reply.example",
		);
		const first = await draft(investorId);
		await outreach.send({ id: first.id, subject: "Hi", body: "Hi" }, userId);
		const followUp = await draft(investorId, 1);

		expect(
			await noticeInvestorReply(db, {
				userId,
				mailbox: `${userId}@example.test`,
				threadId: "thread-1",
				fromEmail: `${userId}@example.test`,
				at: new Date(Date.now() + 60_000),
			}),
		).toBeNull();
		expect(
			await noticeInvestorReply(db, {
				userId,
				mailbox: `${userId}@example.test`,
				threadId: "thread-1",
				fromEmail: "deals@reply.example",
				at: new Date(Date.now() + 60_000),
			}),
		).toBe(investorId);

		const investor = await db.investor.findUniqueOrThrow({
			where: { id: investorId },
			select: { stage: true, repliedAt: true },
		});
		expect(investor.stage).toBe("REPLIED");
		expect(investor.repliedAt).not.toBeNull();
		const cancelled = await db.investorEmail.findUniqueOrThrow({
			where: { id: followUp.id },
			select: { status: true },
		});
		expect(cancelled.status).toBe("CANCELLED");
	});
});
