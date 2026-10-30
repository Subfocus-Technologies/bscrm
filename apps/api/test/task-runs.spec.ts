import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { TaskRunActionPayload } from "@crm/validation/task-runs";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import type { CalendarClient } from "../src/google/calendar.client";
import type { GmailClient } from "../src/google/gmail.client";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import { CalendarSlotsService } from "../src/todos/calendar-slots.service";
import { EmailReplyService } from "../src/todos/email-reply.service";
import { TaskRunsService } from "../src/todos/task-runs.service";

const suffix = process.env.TEST_RUN_ID ?? "task-runs-api-spec";
const userId = `task-runs-api-${suffix}`;
const otherId = `task-runs-other-${suffix}`;

const sentRaw: string[] = [];
const events: { summary: string; attendees?: readonly string[] }[] = [];
let sendWorks = true;

const gmail = {
	sendMessage: async (_token: string, input: { raw: string }) => {
		if (!sendWorks) {
			return { outcome: "failed" as const, reason: "boom", retryable: false };
		}
		sentRaw.push(input.raw);
		return { outcome: "ok" as const, data: { id: `gmail-${sentRaw.length}` } };
	},
	getMessage: async (_token: string, id: string) => ({
		outcome: "ok" as const,
		data: { id, payload: { headers: [] } },
	}),
} as unknown as GmailClient;
const calendar = {
	busyTimes: async () => ({ outcome: "ok" as const, data: [] }),
	insertEvent: async (
		_token: string,
		event: { summary: string; attendees?: readonly string[] },
	) => {
		events.push(event);
		return {
			outcome: "ok" as const,
			data: { htmlLink: "https://calendar.test/event" },
		};
	},
} as unknown as CalendarClient;
const tokens = {
	canSendGmail: async () => true,
	canWriteCalendar: async () => true,
	gmailSendToken: async () => ({ outcome: "ok" as const, accessToken: "t" }),
	calendarWriteToken: async () => ({
		outcome: "ok" as const,
		accessToken: "t",
	}),
} as unknown as MailboxTokenService;

const agent = new AgentTriggerService(db);
const runs = new TaskRunsService(
	db,
	agent,
	new EmailReplyService(db, agent, gmail, tokens),
	tokens,
	calendar,
	new CalendarSlotsService(calendar),
);

const emailPayload = {
	kind: "EMAIL" as const,
	to: "dan@example.test",
	cc: [],
	subject: "VAT",
	body: "Draft words",
	emailThreadId: null,
};

let taskId = "";
let runId = "";

async function addAction(payload: TaskRunActionPayload) {
	const row = await db.taskRunAction.create({
		data: {
			runId,
			position: 0,
			kind: payload.kind,
			why: "Next step",
			payload,
		},
		select: { id: true },
	});
	return row.id;
}

async function clean() {
	await db.activity.deleteMany({
		where: { createdById: { in: [userId, otherId] } },
	});
	await db.agentTask.deleteMany({
		where: { kind: "task-run", reason: "A person pressed Do it for me" },
	});
}

beforeEach(async () => {
	await clean();
	sentRaw.length = 0;
	events.length = 0;
	sendWorks = true;
	for (const id of [userId, otherId]) {
		await db.user.upsert({
			where: { id },
			create: { id, name: `Rep ${id}`, email: `${id}@example.test` },
			update: {},
		});
	}
	const task = await db.activity.create({
		data: { type: "TASK", subject: "Check VAT", createdById: userId },
		select: { id: true },
	});
	taskId = task.id;
	const run = await db.taskRun.create({
		data: { taskId, userId, status: "AWAITING_APPROVAL" },
		select: { id: true },
	});
	runId = run.id;
});

afterAll(async () => {
	await clean();
	await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
});

describe("approving a step", () => {
	it("sends nothing until a person approves, then sends their edited words", async () => {
		const actionId = await addAction(emailPayload);
		expect(sentRaw).toHaveLength(0);

		const decision = await runs.approve(
			{ actionId, payload: { ...emailPayload, body: "My own words" } },
			userId,
		);

		expect(decision.status).toBe("DONE");
		expect(sentRaw).toHaveLength(1);
		const raw = Buffer.from(sentRaw[0] ?? "", "base64url").toString();
		const body = Buffer.from(
			raw.split("\r\n\r\n")[1] ?? "",
			"base64",
		).toString();
		expect(body).toContain("My own words");
		const run = await db.taskRun.findUniqueOrThrow({
			where: { id: runId },
			select: { status: true },
		});
		expect(run.status).toBe("FINISHED");
	});

	it("refuses a second approval, so an email cannot go twice", async () => {
		const actionId = await addAction(emailPayload);
		await runs.approve({ actionId, payload: emailPayload }, userId);

		expect(
			runs.approve({ actionId, payload: emailPayload }, userId),
		).rejects.toThrow("already decided");
		expect(sentRaw).toHaveLength(1);
	});

	it("refuses anyone but the person who asked for the work", async () => {
		const actionId = await addAction(emailPayload);

		expect(
			runs.approve({ actionId, payload: emailPayload }, otherId),
		).rejects.toThrow("No step");
		expect(sentRaw).toHaveLength(0);
	});

	it("keeps a failed step open to try again", async () => {
		sendWorks = false;
		const actionId = await addAction(emailPayload);

		const failed = await runs.approve(
			{ actionId, payload: emailPayload },
			userId,
		);
		sendWorks = true;
		const retried = await runs.approve(
			{ actionId, payload: emailPayload },
			userId,
		);

		expect(failed.status).toBe("FAILED");
		expect(retried.status).toBe("DONE");
	});

	it("adds a calendar event with its guests in a free slot", async () => {
		const payload = {
			kind: "EVENT" as const,
			title: "Call with Dan",
			description: "",
			startsAt: null,
			minutes: 30,
			attendees: ["dan@example.test"],
		};
		const actionId = await addAction(payload);

		const decision = await runs.approve({ actionId, payload }, userId);

		expect(decision.result).toBe("https://calendar.test/event");
		expect(events[0]?.attendees).toEqual(["dan@example.test"]);
	});

	it("adds a follow-up to-do on the same record", async () => {
		const payload = {
			kind: "TODO" as const,
			title: "Chase Dan",
			dueDate: "2026-11-06",
		};
		const actionId = await addAction(payload);

		await runs.approve({ actionId, payload }, userId);

		const task = await db.activity.findFirstOrThrow({
			where: { subject: "Chase Dan", createdById: userId },
			select: { type: true, dueAt: true },
		});
		expect(task).toEqual({
			type: "TASK",
			dueAt: new Date("2026-11-06T09:00:00Z"),
		});
	});

	it("queues a draft code change for the agent rather than making it here", async () => {
		const payload = {
			kind: "PULL_REQUEST" as const,
			repo: "acme/app",
			title: "Fix",
			body: "",
			files: [{ path: "a.ts", content: "x" }],
		};
		const actionId = await addAction(payload);

		const decision = await runs.approve({ actionId, payload }, userId);

		expect(decision.status).toBe("RUNNING");
		const queued = await db.agentTask.count({
			where: { kind: "task-run-pull-request", subject: actionId },
		});
		expect(queued).toBe(1);
		await db.agentTask.deleteMany({ where: { subject: actionId } });
	});

	it("finishes the run when every step is decided", async () => {
		const actionId = await addAction(emailPayload);

		await runs.skip(actionId, userId);

		const run = await runs.get(runId, userId);
		expect(run.status).toBe("FINISHED");
		expect(sentRaw).toHaveLength(0);
	});
});

describe("starting a run", () => {
	it("starts one run per to-do while it is working", async () => {
		await db.taskRun.deleteMany({ where: { taskId } });

		const first = await runs.start({ taskId }, userId);
		const second = await runs.start({ taskId }, userId);

		expect(second.id).toBe(first.id);
		await db.agentTask.deleteMany({ where: { subject: first.id } });
	});
});
