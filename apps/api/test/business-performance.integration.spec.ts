import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, type Prisma } from "@crm/db";
import {
	salesByBusiness,
	trafficByBusiness,
} from "../src/dashboard/business-performance";

const suffix = process.env.TEST_RUN_ID ?? "performance-spec";
const site = `site-${suffix}.test`;
const blog = `blog.${site}`;
const docs = `docs.${site}`;
const shop = `shop-${suffix}.test`;
const stray = `stray-${suffix}.test`;
const hosts = [site, blog, docs, shop, stray];
const owner = `owner-${suffix}`;
const namePrefix = `Performance ${suffix}`;

const window = {
	start: new Date("2001-03-01T00:00:00Z"),
	end: new Date("2001-04-01T00:00:00Z"),
};
const inside = new Date("2001-03-15T12:00:00Z");
const outside = new Date("2001-04-02T12:00:00Z");

let alpha = "";
let beta = "";
let gamma = "";
let companyId = "";

async function clean() {
	await db.trackedEvent.deleteMany({ where: { host: { in: hosts } } });
	await db.trackedDomain.deleteMany({ where: { host: { in: hosts } } });
	await db.deal.deleteMany({ where: { ownerId: owner } });
	await db.company.deleteMany({ where: { domain: site } });
	await db.business.deleteMany({ where: { name: { startsWith: namePrefix } } });
	await db.user.deleteMany({ where: { id: owner } });
}

function view(host: string, visitorId: string, occurredAt = inside) {
	return { type: "page_view", host, path: "/", visitorId, occurredAt };
}

beforeAll(async () => {
	await clean();

	const [a, b, c] = await Promise.all(
		["Alpha", "Beta", "Gamma"].map((name) =>
			db.business.create({
				data: { name: `${namePrefix} ${name}` },
				select: { id: true },
			}),
		),
	);
	alpha = a?.id ?? "";
	beta = b?.id ?? "";
	gamma = c?.id ?? "";

	await db.trackedDomain.createMany({
		data: [
			{ host: site, scope: "SITE_AND_SUBDOMAINS", businessId: alpha },
			{ host: docs, scope: "EXACT_HOST", businessId: gamma },
			{ host: shop, scope: "EXACT_HOST", businessId: beta },
		],
	});

	await db.trackedEvent.createMany({
		data: [
			view(site, "visitor-one"),
			view(blog, "visitor-one"),
			view(blog, "visitor-two"),
			view(docs, "visitor-one"),
			view(shop, "visitor-three"),
			view(shop, "visitor-three"),
			view(stray, "visitor-four"),
			view(site, "visitor-five", outside),
			{ ...view(site, "visitor-six"), type: "click" },
		],
	});

	await db.user.create({
		data: { id: owner, name: "Owner", email: `owner@${site}` },
	});
	const company = await db.company.create({
		data: { name: `${namePrefix} Co`, domain: site },
		select: { id: true },
	});
	companyId = company.id;

	const deal = (
		name: string,
		businessId: string | null,
		extra: Partial<Prisma.DealCreateManyInput>,
	) => ({
		name,
		companyId,
		ownerId: owner,
		businessId,
		stage: "CLOSED_WON" as const,
		closedAt: inside,
		currency: "GBP",
		...extra,
	});

	await db.deal.createMany({
		data: [
			deal("Alpha one", alpha, { baseAmount: 100, baseCurrency: "GBP" }),
			deal("Alpha two", alpha, { baseAmount: 50, baseCurrency: "GBP" }),
			deal("Alpha unrated", alpha, {}),
			deal("Beta one", beta, { baseAmount: 20, baseCurrency: "GBP" }),
			deal("Unfiled", null, { baseAmount: 5, baseCurrency: "GBP" }),
			deal("Beta lost", beta, {
				stage: "CLOSED_LOST",
				baseAmount: 999,
				baseCurrency: "GBP",
			}),
			deal("Beta late", beta, {
				closedAt: outside,
				baseAmount: 999,
				baseCurrency: "GBP",
			}),
			deal("Beta archived", beta, {
				archivedAt: inside,
				baseAmount: 999,
				baseCurrency: "GBP",
			}),
		],
	});
});

afterAll(clean);

describe("website traffic by business", () => {
	it("credits each host to the business of the domain that covers it", async () => {
		const traffic = await trafficByBusiness(db, { window, business: null });

		expect(traffic.byBusiness.get(alpha)).toEqual({ visitors: 2, views: 3 });
		expect(traffic.byBusiness.get(gamma)).toEqual({ visitors: 1, views: 1 });
		expect(traffic.byBusiness.get(beta)).toEqual({ visitors: 1, views: 2 });
		expect(traffic.byBusiness.get(null)).toEqual({ visitors: 1, views: 1 });
	});

	it("counts a visitor once in the total across businesses", async () => {
		const traffic = await trafficByBusiness(db, { window, business: null });

		expect(traffic.total).toEqual({ visitors: 4, views: 7 });
	});

	it("limits the figures to the focused business", async () => {
		const traffic = await trafficByBusiness(db, { window, business: beta });

		expect([...traffic.byBusiness.keys()]).toEqual([beta]);
		expect(traffic.total).toEqual({ visitors: 1, views: 2 });
	});

	it("returns zeros for a period with no traffic", async () => {
		const traffic = await trafficByBusiness(db, {
			window: {
				start: new Date("2000-01-01T00:00:00Z"),
				end: new Date("2000-02-01T00:00:00Z"),
			},
			business: null,
		});

		expect(traffic.byBusiness.size).toBe(0);
		expect(traffic.total).toEqual({ visitors: 0, views: 0 });
	});
});

describe("subscriptions sold by business", () => {
	const counted = { baseCurrency: "GBP", baseAmount: { not: null } };

	it("counts live won deals in the period and sums only converted values", async () => {
		const sales = await salesByBusiness(db, {
			window,
			business: null,
			counted,
		});

		expect(sales.byBusiness.get(alpha)).toEqual({
			sold: 3,
			valueCents: 15_000,
		});
		expect(sales.byBusiness.get(beta)).toEqual({ sold: 1, valueCents: 2_000 });
		expect(sales.byBusiness.get(null)).toEqual({ sold: 1, valueCents: 500 });
	});

	it("totals every business across the board", async () => {
		const sales = await salesByBusiness(db, {
			window,
			business: null,
			counted,
		});

		expect(sales.total).toEqual({ sold: 5, valueCents: 17_500 });
	});

	it("limits the total to the focused business", async () => {
		const sales = await salesByBusiness(db, {
			window,
			business: alpha,
			counted,
		});

		expect(sales.total).toEqual({ sold: 3, valueCents: 15_000 });
	});
});
