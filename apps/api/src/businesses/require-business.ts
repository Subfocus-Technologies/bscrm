import type { Db } from "@crm/db";
import { NotFoundException } from "@nestjs/common";

export async function requireBusiness(
	db: Db,
	businessId: string | null | undefined,
): Promise<void> {
	if (!businessId) return;

	const business = await db.business.findUnique({
		where: { id: businessId },
		select: { id: true },
	});

	if (!business) {
		throw new NotFoundException(`No business with id ${businessId}.`);
	}
}

export function businessMembershipCreate(
	businessId: string | null | undefined,
	addedById: string | null,
): { create: { businessId: string; addedById: string | null } } | undefined {
	return businessId ? { create: { businessId, addedById } } : undefined;
}
