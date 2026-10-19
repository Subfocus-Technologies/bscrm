import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { isRemovedUser, signInAccess } from "../src/access";

const suffix = process.env.TEST_RUN_ID ?? "access-spec";
const outsider = `guest.${suffix}@outside.test`;
const userId = `access-user-${suffix}`;

async function clean() {
	await db.workspaceAccess.deleteMany({ where: { email: outsider } });
	await db.workspaceRemoval.deleteMany({ where: { email: outsider } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeEach(clean);
afterAll(clean);

describe("signInAccess", () => {
	it("knows an invited address and its role, whatever the case", async () => {
		await db.workspaceAccess.create({
			data: { email: outsider, role: "admin" },
		});

		expect(await signInAccess(outsider.toUpperCase())).toEqual({
			invited: true,
			removed: false,
			role: "admin",
		});
	});

	it("treats anyone else as a plain member who was never invited", async () => {
		expect(await signInAccess(outsider)).toEqual({
			invited: false,
			removed: false,
			role: "member",
		});
	});
});

describe("isRemovedUser", () => {
	it("is true only for a person whose access was removed", async () => {
		await db.user.create({
			data: { id: userId, name: "Guest", email: outsider },
		});
		expect(await isRemovedUser(userId)).toBe(false);

		await db.workspaceRemoval.create({ data: { email: outsider } });

		expect(await isRemovedUser(userId)).toBe(true);
	});
});
