import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { TrackingService } from "../src/tracking/tracking.service";
import type { TrackingConfigService } from "../src/tracking/tracking-config.service";

const suffix = process.env.TEST_RUN_ID ?? "domain-business-spec";
const host = `domain-business-${suffix}.test`;
const admin = `admin-${suffix}`;
const member = `member-${suffix}`;
const businessName = `Domain business ${suffix}`;

const config = {
	invalidate: async () => undefined,
} as unknown as TrackingConfigService;
const tracking = new TrackingService(db, config);

let businessId = "";
let domainId = "";

async function clean() {
	await db.trackedDomain.deleteMany({ where: { host } });
	await db.business.deleteMany({ where: { name: businessName } });
	await db.member.deleteMany({ where: { userId: { in: [admin, member] } } });
	await db.user.deleteMany({ where: { id: { in: [admin, member] } } });
}

beforeAll(async () => {
	await clean();
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		update: {},
		create: {
			id: WORKSPACE_ID,
			name: DEFAULT_WORKSPACE_NAME,
			slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
			createdAt: new Date(),
		},
	});
	await db.user.createMany({
		data: [admin, member].map((id) => ({
			id,
			name: id,
			email: `${id}@example.test`,
		})),
	});
	await db.member.createMany({
		data: [
			{ userId: admin, role: "admin" },
			{ userId: member, role: "member" },
		].map((row) => ({
			id: `m-${row.userId}`,
			organizationId: WORKSPACE_ID,
			createdAt: new Date(),
			...row,
		})),
	});

	const business = await db.business.create({
		data: { name: businessName },
		select: { id: true },
	});
	businessId = business.id;
});

afterAll(clean);

describe("linking a website domain to a business", () => {
	it("stores the business chosen when the domain is added", async () => {
		const added = await tracking.addDomain(admin, {
			host,
			scope: "SITE_AND_SUBDOMAINS",
			businessId,
		});
		domainId = added.id;

		expect(added.businessId).toBe(businessId);
	});

	it("lets an owner or admin change it later", async () => {
		await tracking.setDomainBusiness(admin, { id: domainId, businessId: null });

		const row = await db.trackedDomain.findUnique({ where: { id: domainId } });
		expect(row?.businessId).toBeNull();
	});

	it("refuses a member", async () => {
		await expect(
			tracking.setDomainBusiness(member, { id: domainId, businessId }),
		).rejects.toThrow("Only an owner or an admin can change tracking.");
	});

	it("says so when the business no longer exists", async () => {
		await expect(
			tracking.setDomainBusiness(admin, {
				id: domainId,
				businessId: "missing-business",
			}),
		).rejects.toThrow("That business no longer exists.");
	});
});
