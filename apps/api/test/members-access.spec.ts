import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { MembersAccessService } from "../src/workspace/members-access.service";

const suffix = process.env.TEST_RUN_ID ?? "members-spec";
const domain = `members-${suffix}.test`;
const owner = `owner-${suffix}`;
const admin = `admin-${suffix}`;
const member = `member-${suffix}`;

const access = new MembersAccessService(db);

async function clean() {
	await db.workspaceAccess.deleteMany({
		where: { email: { endsWith: `@${domain}` } },
	});
	await db.workspaceRemoval.deleteMany({
		where: { email: { endsWith: `@${domain}` } },
	});
	await db.member.deleteMany({
		where: { userId: { in: [owner, admin, member] } },
	});
	await db.user.deleteMany({ where: { id: { in: [owner, admin, member] } } });
}

async function enrol(id: string, role: string) {
	await db.user.create({ data: { id, name: id, email: `${id}@${domain}` } });
	const row = await db.member.create({
		data: {
			id: `m-${id}`,
			organizationId: WORKSPACE_ID,
			userId: id,
			role,
			createdAt: new Date(),
		},
		select: { id: true },
	});
	return row.id;
}

beforeEach(async () => {
	await clean();
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "CRM",
			slug: "crm",
			createdAt: new Date(),
		},
		update: {},
	});
	await enrol(owner, "owner");
	await enrol(admin, "admin");
	await enrol(member, "member");
});

afterAll(clean);

describe("adding members", () => {
	it("lets an admin invite an address, and lists it until they join", async () => {
		const guest = `guest@${domain}`;

		await access.addMember(admin, {
			email: guest.toUpperCase(),
			role: "admin",
		});

		const invites = (await access.invites()).filter((invite) =>
			invite.email.endsWith(`@${domain}`),
		);
		expect(invites.map((invite) => [invite.email, invite.role])).toEqual([
			[guest, "admin"],
		]);
	});

	it("refuses a plain member", async () => {
		await expect(
			access.addMember(member, { email: `guest@${domain}`, role: "member" }),
		).rejects.toThrow("Only an owner or an admin");
	});

	it("refuses someone who is already a member", async () => {
		await expect(
			access.addMember(owner, { email: `${member}@${domain}`, role: "member" }),
		).rejects.toThrow("already a member");
	});
});

describe("removing members", () => {
	it("removes the membership, signs them out and blocks a return", async () => {
		await db.session.create({
			data: {
				id: `s-${member}`,
				token: `t-${member}`,
				userId: member,
				expiresAt: new Date(Date.now() + 60_000),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		await access.removeMember(admin, `m-${member}`);

		expect(await db.member.count({ where: { userId: member } })).toBe(0);
		expect(await db.session.count({ where: { userId: member } })).toBe(0);
		expect(
			await db.workspaceRemoval.count({
				where: { email: `${member}@${domain}` },
			}),
		).toBe(1);
	});

	it("clears the block when they are added again", async () => {
		await access.removeMember(admin, `m-${member}`);

		await access.addMember(admin, {
			email: `${member}@${domain}`,
			role: "member",
		});

		expect(
			await db.workspaceRemoval.count({
				where: { email: `${member}@${domain}` },
			}),
		).toBe(0);
	});

	it("does not let you remove yourself", async () => {
		await expect(access.removeMember(admin, `m-${admin}`)).rejects.toThrow(
			"cannot remove yourself",
		);
	});
});
