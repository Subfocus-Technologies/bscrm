import { type Db, DealStage, type Prisma } from "@crm/db";
import { toCents } from "../crm/values";

type TargetProgress = { targetCents: number; wonCents: number };

export type BusinessTargets = {
	overall: TargetProgress | null;
	byBusiness: Map<string, { wonCents: number; targetCents: number | null }>;
};

export async function businessTargets(
	db: Db,
	input: {
		business: string | null;
		base: string;
		counted: Prisma.DealWhereInput;
		month: { start: Date; end: Date };
	},
): Promise<BusinessTargets> {
	const [businesses, won] = await Promise.all([
		db.business.findMany({
			select: { id: true, monthlyTarget: true, monthlyTargetCurrency: true },
		}),
		db.deal.groupBy({
			by: ["businessId"],
			where: {
				AND: [
					input.counted,
					{
						stage: DealStage.CLOSED_WON,
						closedAt: { gte: input.month.start, lt: input.month.end },
					},
				],
			},
			_sum: { baseAmount: true },
		}),
	]);

	const wonOf = (businessId: string | null) =>
		toCents(
			won.find((group) => group.businessId === businessId)?._sum.baseAmount ??
				null,
		) ?? 0;

	const byBusiness = new Map(
		businesses.map((business) => [
			business.id,
			{
				wonCents: wonOf(business.id),
				targetCents:
					business.monthlyTargetCurrency === input.base
						? toCents(business.monthlyTarget)
						: null,
			},
		]),
	);

	if (input.business) {
		const entry = byBusiness.get(input.business);
		return {
			byBusiness,
			overall:
				entry && entry.targetCents !== null
					? { targetCents: entry.targetCents, wonCents: entry.wonCents }
					: null,
		};
	}

	const targets = [...byBusiness.values()].flatMap((entry) =>
		entry.targetCents === null ? [] : [entry.targetCents],
	);
	const totalWon = won.reduce(
		(total, group) => total + (toCents(group._sum.baseAmount ?? null) ?? 0),
		0,
	);

	return {
		byBusiness,
		overall:
			targets.length === 0
				? null
				: {
						targetCents: targets.reduce((total, cents) => total + cents, 0),
						wonCents: totalWon,
					},
	};
}
