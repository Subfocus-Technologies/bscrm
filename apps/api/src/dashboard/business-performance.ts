import { type Db, DealStage, Prisma } from "@crm/db";
import { dealBusinessScope } from "../businesses/business-scope";
import { toCents } from "../crm/values";

export type ReportWindow = { start: Date; end: Date };

type Traffic = { visitors: number; views: number };

type Sales = { sold: number; valueCents: number };

export type BusinessTraffic = {
	byBusiness: Map<string | null, Traffic>;
	total: Traffic;
};

export type BusinessSales = {
	byBusiness: Map<string | null, Sales>;
	total: Sales;
};

type TrafficRow = {
	businessId: string | null;
	total: number;
	views: number;
	visitors: number;
};

export async function trafficByBusiness(
	db: Db,
	input: { window: ReportWindow; business: string | null },
): Promise<BusinessTraffic> {
	const focus = input.business
		? Prisma.sql`WHERE hosts."businessId" = ${input.business}`
		: Prisma.empty;

	const rows = await db.$queryRaw<TrafficRow[]>`
		WITH per_host AS (
			SELECT host, "visitorId", count(*) AS views
			FROM "trackedEvent"
			WHERE type = 'page_view'
				AND "occurredAt" >= ${input.window.start}
				AND "occurredAt" < ${input.window.end}
			GROUP BY host, "visitorId"
		),
		hosts AS (
			SELECT seen.host, (
				SELECT domain."businessId"
				FROM "trackedDomain" domain
				WHERE domain.host = seen.host
					OR (
						domain.scope = 'SITE_AND_SUBDOMAINS'
						AND right(seen.host, length(domain.host) + 1) = '.' || domain.host
					)
				ORDER BY domain.host = seen.host DESC, length(domain.host) DESC
				LIMIT 1
			) AS "businessId"
			FROM (SELECT DISTINCT host FROM per_host) seen
		)
		SELECT
			hosts."businessId",
			GROUPING(hosts."businessId")::int AS total,
			coalesce(sum(per_host.views), 0)::int AS views,
			count(DISTINCT per_host."visitorId")::int AS visitors
		FROM per_host
		JOIN hosts ON hosts.host = per_host.host
		${focus}
		GROUP BY GROUPING SETS ((hosts."businessId"), ());
	`;

	const figures = (row: TrafficRow): Traffic => ({
		visitors: row.visitors,
		views: row.views,
	});
	const totalRow = rows.find((row) => row.total === 1);

	return {
		byBusiness: new Map(
			rows
				.filter((row) => row.total === 0)
				.map((row): [string | null, Traffic] => [row.businessId, figures(row)]),
		),
		total: totalRow ? figures(totalRow) : { visitors: 0, views: 0 },
	};
}

export async function salesByBusiness(
	db: Db,
	input: {
		window: ReportWindow;
		business: string | null;
		counted: Prisma.DealWhereInput;
	},
): Promise<BusinessSales> {
	const won: Prisma.DealWhereInput = {
		AND: [
			dealBusinessScope(input.business),
			{
				stage: DealStage.CLOSED_WON,
				closedAt: { gte: input.window.start, lt: input.window.end },
				archivedAt: null,
			},
		],
	};
	const valued: Prisma.DealWhereInput = { AND: [won, input.counted] };

	const [counts, values, totalCount, totalValue] = await Promise.all([
		db.deal.groupBy({
			by: ["businessId"],
			where: won,
			_count: { _all: true },
		}),
		db.deal.groupBy({
			by: ["businessId"],
			where: valued,
			_sum: { baseAmount: true },
		}),
		db.deal.count({ where: won }),
		db.deal.aggregate({ where: valued, _sum: { baseAmount: true } }),
	]);

	const valueCentsOf = new Map(
		values.map((group) => [
			group.businessId,
			toCents(group._sum.baseAmount) ?? 0,
		]),
	);

	return {
		byBusiness: new Map(
			counts.map((group): [string | null, Sales] => [
				group.businessId,
				{
					sold: group._count._all,
					valueCents: valueCentsOf.get(group.businessId) ?? 0,
				},
			]),
		),
		total: {
			sold: totalCount,
			valueCents: toCents(totalValue._sum.baseAmount) ?? 0,
		},
	};
}
