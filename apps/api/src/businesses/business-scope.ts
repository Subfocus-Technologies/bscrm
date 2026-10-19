import type { Db, Prisma } from "@crm/db";
import {
	type FacetCount,
	type ListedBusiness,
	NO_BUSINESS,
	splitSentinel,
} from "../trpc/list-input";

export const LISTED_BUSINESS_SELECT = {
	id: true,
	name: true,
	tone: true,
} as const;

export const LISTED_MEMBERSHIPS = {
	select: { business: { select: LISTED_BUSINESS_SELECT } },
	orderBy: { business: { name: "asc" } },
} as const;

export function listedBusinesses(
	memberships: { business: ListedBusiness }[],
): ListedBusiness[] {
	return memberships.map((membership) => membership.business);
}

export function companyBusinessScope(
	businessId: string | null,
): Prisma.CompanyWhereInput {
	return businessId ? { businesses: { some: { businessId } } } : {};
}

export function contactBusinessScope(
	businessId: string | null,
): Prisma.ContactWhereInput {
	return businessId ? { businesses: { some: { businessId } } } : {};
}

export function dealBusinessScope(
	businessId: string | null,
): Prisma.DealWhereInput {
	return businessId ? { businessId } : {};
}

type MembershipWhere = {
	businesses: { some: { businessId: { in: string[] } } } | { none: object };
};

function membershipFilter(
	values: string[],
): MembershipWhere | { OR: MembershipWhere[] } | undefined {
	if (values.length === 0) return undefined;

	const { ids, includesSentinel } = splitSentinel(values, NO_BUSINESS);
	const held: MembershipWhere = {
		businesses: { some: { businessId: { in: ids } } },
	};
	const none: MembershipWhere = { businesses: { none: {} } };

	if (includesSentinel && ids.length === 0) return none;
	if (!includesSentinel) return held;
	return { OR: [held, none] };
}

export function companyBusinessFilter(
	values: string[],
): Prisma.CompanyWhereInput | undefined {
	return membershipFilter(values);
}

export function contactBusinessFilter(
	values: string[],
): Prisma.ContactWhereInput | undefined {
	return membershipFilter(values);
}

export function dealBusinessFilter(
	values: string[],
): Prisma.DealWhereInput | undefined {
	if (values.length === 0) return undefined;

	const { ids, includesSentinel } = splitSentinel(values, NO_BUSINESS);
	if (includesSentinel && ids.length === 0) return { businessId: null };
	if (!includesSentinel) return { businessId: { in: ids } };
	return { OR: [{ businessId: { in: ids } }, { businessId: null }] };
}

function membershipCounts(
	groups: { businessId: string; _count: { _all: number } }[],
	unfiled: number,
): FacetCount {
	const counts: FacetCount = Object.fromEntries(
		groups.map((group) => [group.businessId, group._count._all]),
	);
	return unfiled > 0 ? { ...counts, [NO_BUSINESS]: unfiled } : counts;
}

export async function companyBusinessCounts(
	db: Db,
	where: Prisma.CompanyWhereInput,
): Promise<FacetCount> {
	const [groups, unfiled] = await Promise.all([
		db.companyBusiness.groupBy({
			by: ["businessId"],
			where: { company: where },
			_count: { _all: true },
		}),
		db.company.count({ where: { AND: [where, { businesses: { none: {} } }] } }),
	]);
	return membershipCounts(groups, unfiled);
}

export async function contactBusinessCounts(
	db: Db,
	where: Prisma.ContactWhereInput,
): Promise<FacetCount> {
	const [groups, unfiled] = await Promise.all([
		db.contactBusiness.groupBy({
			by: ["businessId"],
			where: { contact: where },
			_count: { _all: true },
		}),
		db.contact.count({ where: { AND: [where, { businesses: { none: {} } }] } }),
	]);
	return membershipCounts(groups, unfiled);
}

export function activityBusinessScope(
	businessId: string | null,
): Prisma.ActivityWhereInput {
	if (!businessId) return {};

	return {
		OR: [
			{ deal: { businessId } },
			{ company: { businesses: { some: { businessId } } } },
			{ contact: { businesses: { some: { businessId } } } },
		],
	};
}
