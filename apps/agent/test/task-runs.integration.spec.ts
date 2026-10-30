import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import {
	preflightTaskRun,
	submitTaskWork,
	taskRunMarkdown,
} from "../agent/lib/task-runs";

const suffix = process.env.TEST_RUN_ID ?? "task-runs-spec";
const userId = `task-runs-${suffix}`;

let taskRunId = "";

const email = {
	kind: "EMAIL",
	why: "They asked for this.",
	to: "dan@example.test",
	cc: [],
	subject: "VAT registration",
	body: "Could you confirm whether we need to register?",
	emailThreadId: null,
};

const repoEnv = {
	token: process.env.AGENT_REPO_TOKEN,
	repos: process.env.AGENT_REPOS,
};

beforeEach(async () => {
	delete process.env.AGENT_REPO_TOKEN;
	delete process.env.AGENT_REPOS;
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.user.upsert({
		where: { id: userId },
		create: { id: userId, name: "Sayu Test", email: `${userId}@example.test` },
		update: {},
	});
	const task = await db.activity.create({
		data: {
			type: "TASK",
			subject: "Check with Dan Cox about VAT",
			createdById: userId,
		},
		select: { id: true },
	});
	const run = await db.taskRun.create({
		data: { taskId: task.id, userId, instructions: "Keep it short." },
		select: { id: true },
	});
	taskRunId = run.id;
});

afterEach(() => {
	if (repoEnv.token) process.env.AGENT_REPO_TOKEN = repoEnv.token;
	if (repoEnv.repos) process.env.AGENT_REPOS = repoEnv.repos;
});

afterAll(async () => {
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("a task run", () => {
	it("briefs the agent with the to-do, the instructions and the approval rule", async () => {
		const brief = await taskRunMarkdown(taskRunId);

		expect(brief).toContain("Check with Dan Cox about VAT");
		expect(brief).toContain("Keep it short.");
		expect(brief).toContain("Each one waits for approval");
		expect(brief).toContain("no code repository access");
	});

	it("saves the work and its steps as proposals, with nothing carried out", async () => {
		await preflightTaskRun({ taskRunId });

		const outcome = await submitTaskWork(taskRunId, {
			summary: "I drafted the question for Dan.",
			deliverable: "# VAT note",
			actions: [email],
		});

		expect(outcome).toEqual({ ok: true, saved: 1, dropped: [] });
		const run = await db.taskRun.findUniqueOrThrow({
			where: { id: taskRunId },
			select: {
				status: true,
				deliverable: true,
				actions: { select: { kind: true, status: true, why: true } },
			},
		});
		expect(run).toEqual({
			status: "AWAITING_APPROVAL",
			deliverable: "# VAT note",
			actions: [
				{ kind: "EMAIL", status: "PROPOSED", why: "They asked for this." },
			],
		});
	});

	it("drops a bad address and a code change it has no access for", async () => {
		const outcome = await submitTaskWork(taskRunId, {
			summary: "Done.",
			deliverable: null,
			actions: [
				{ ...email, to: "not an address" },
				{
					kind: "PULL_REQUEST",
					why: "Fix it.",
					repo: "acme/app",
					title: "Fix",
					body: "",
					files: [{ path: "a.ts", content: "x" }],
				},
			],
		});

		expect(outcome.ok && outcome.saved).toBe(0);
		expect(outcome.ok && outcome.dropped[1]?.reason).toBe(
			"This session has no repository access.",
		);
	});

	it("takes the hand-over once", async () => {
		const input = { summary: "Done.", deliverable: null, actions: [email] };

		await submitTaskWork(taskRunId, input);
		const second = await submitTaskWork(taskRunId, input);

		expect(second.ok).toBe(false);
		expect(await db.taskRunAction.count({ where: { runId: taskRunId } })).toBe(
			1,
		);
	});
});
