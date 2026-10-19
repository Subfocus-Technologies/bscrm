import type { Prisma } from "@crm/db";

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
