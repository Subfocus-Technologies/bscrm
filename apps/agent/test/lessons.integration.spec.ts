import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	lessonReviewMarkdown,
	lessonsMarkdown,
	preflightLessonReview,
	saveLessons,
} from "../agent/lib/lessons";

const suffix = process.env.TEST_RUN_ID ?? "lessons-spec";
const userId = `lessons-${suffix}`;
const otherId = `lessons-other-${suffix}`;

let runId = "";

const proposed = {
	kind: "EMAIL",
	to: "dan@example.test",
	cc: [],
	subject: "VAT",
	body: "A long and formal email",
	emailThreadId: null,
};

async function clean() {
	await db.agentLesson.deleteMany({
		where: { createdById: { in: [userId, otherId] } },
	});
	await db.activity.deleteMany({ where: { createdById: userId } });
}

async function addStep(status: "DONE" | "SKIPPED", body: string) {
	await db.taskRunAction.create({
		data: {
			runId,
			position: 0,
			kind: "EMAIL",
			why: "Next step",
			status,
			payload: { ...proposed, body },
			proposedPayload: proposed,
		},
	});
}

beforeEach(async () => {
	await clean();
	for (const id of [userId, otherId]) {
		await db.user.upsert({
			where: { id },
			create: { id, name: "Sayu Test", email: `${id}@example.test` },
			update: {},
		});
	}
	const task = await db.activity.create({
		data: { type: "TASK", subject: "Check VAT", createdById: userId },
		select: { id: true },
	});
	const run = await db.taskRun.create({
		data: { taskId: task.id, userId, status: "FINISHED" },
		select: { id: true },
	});
	runId = run.id;
});

afterAll(async () => {
	await clean();
	await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
});

describe("a lesson review", () => {
	it("spends nothing when a person changed nothing", async () => {
		await addStep("DONE", proposed.body);

		const preflight = await preflightLessonReview({
			kind: "task-run",
			id: runId,
		});

		expect(preflight.kind).toBe("done");
	});

	it("shows the model what the person changed", async () => {
		await addStep("DONE", "Short and plain");

		const preflight = await preflightLessonReview({
			kind: "task-run",
			id: runId,
		});
		const brief = await lessonReviewMarkdown(`task-run:${runId}`);

		expect(preflight.kind).toBe("research");
		expect(brief).toContain("A long and formal email");
		expect(brief).toContain("Short and plain");
	});

	it("saves a lesson once and retires only what it learned", async () => {
		await addStep("DONE", "Short and plain");
		const taught = await db.agentLesson.create({
			data: {
				scope: "PERSONAL",
				origin: "TAUGHT",
				text: "Taught by hand",
				createdById: userId,
			},
			select: { id: true },
		});
		const lesson = { scope: "PERSONAL" as const, text: "Keep emails short." };

		const first = await saveLessons(`task-run:${runId}`, {
			add: [lesson],
			retire: [taught.id],
		});
		const second = await saveLessons(`task-run:${runId}`, {
			add: [lesson],
			retire: [],
		});

		expect(first).toEqual({ ok: true, added: 1, retired: 0 });
		expect(second).toEqual({ ok: true, added: 0, retired: 0 });
	});
});

describe("using lessons", () => {
	it("gives a person their own lessons and the team's, not a colleague's", async () => {
		await db.agentLesson.createMany({
			data: [
				{
					scope: "PERSONAL",
					origin: "TAUGHT",
					text: "Mine",
					createdById: userId,
				},
				{ scope: "TEAM", origin: "TAUGHT", text: "Ours", createdById: otherId },
				{
					scope: "PERSONAL",
					origin: "TAUGHT",
					text: "Theirs",
					createdById: otherId,
				},
				{
					scope: "TEAM",
					origin: "TAUGHT",
					text: "Removed",
					createdById: otherId,
					retiredAt: new Date(),
				},
			],
		});

		const markdown = await lessonsMarkdown(userId);

		expect(markdown).toContain("Mine");
		expect(markdown).toContain("Ours");
		expect(markdown).not.toContain("Theirs");
		expect(markdown).not.toContain("Removed");
	});
});
