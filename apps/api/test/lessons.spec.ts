import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { LessonsService } from "../src/todos/lessons.service";

const suffix = process.env.TEST_RUN_ID ?? "lessons-api-spec";
const userId = `lessons-api-${suffix}`;
const otherId = `lessons-api-other-${suffix}`;

const lessons = new LessonsService(db);

async function clean() {
	await db.agentLesson.deleteMany({
		where: { createdById: { in: [userId, otherId] } },
	});
}

beforeEach(async () => {
	await clean();
	for (const id of [userId, otherId]) {
		await db.user.upsert({
			where: { id },
			create: { id, name: `Rep ${id}`, email: `${id}@example.test` },
			update: {},
		});
	}
});

afterAll(async () => {
	await clean();
	await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
});

describe("lessons", () => {
	it("records who taught it and keeps a personal lesson private", async () => {
		await lessons.add({ text: "My style", scope: "PERSONAL" }, userId);
		await lessons.add({ text: "Our fact", scope: "TEAM" }, userId);

		const mine = await lessons.list({ page: 1 }, userId);
		const theirs = await lessons.list({ page: 1 }, otherId);

		expect(mine.total).toBe(2);
		expect(mine.items[0]?.author).toBe(`Rep ${userId}`);
		expect(theirs.items.map((item) => item.text)).toEqual(["Our fact"]);
	});

	it("lets a person remove a team lesson and records who did", async () => {
		const { id } = await lessons.add({ text: "Old", scope: "TEAM" }, userId);

		await lessons.remove(id, otherId);

		const row = await db.agentLesson.findUniqueOrThrow({
			where: { id },
			select: { retiredById: true },
		});
		expect(row.retiredById).toBe(otherId);
		expect((await lessons.list({ page: 1 }, userId)).total).toBe(0);
	});

	it("does not let a colleague remove a personal lesson", async () => {
		const { id } = await lessons.add(
			{ text: "Mine", scope: "PERSONAL" },
			userId,
		);

		await expect(lessons.remove(id, otherId)).rejects.toThrow("No lesson");
	});
});
