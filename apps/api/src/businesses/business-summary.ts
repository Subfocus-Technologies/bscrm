import type { Prisma } from "@crm/db";
import { toCents } from "../crm/values";
import type { BusinessSummary } from "./businesses.contracts";

export const BUSINESS_SUMMARY_SELECT = {
	id: true,
	name: true,
	tone: true,
	playbook: true,
	monthlyTarget: true,
	monthlyTargetCurrency: true,
} as const;

type BusinessSummaryRow = Prisma.BusinessGetPayload<{
	select: typeof BUSINESS_SUMMARY_SELECT;
}>;

export function toBusinessSummary(row: BusinessSummaryRow): BusinessSummary {
	const cents = toCents(row.monthlyTarget);

	return {
		id: row.id,
		name: row.name,
		tone: row.tone,
		playbook: row.playbook,
		target:
			cents !== null && row.monthlyTargetCurrency
				? { cents, currency: row.monthlyTargetCurrency }
				: null,
	};
}
