"use client";

import type { DataTableFacet } from "@crm/ui/components/data-table";
import { NO_BUSINESS } from "@/lib/business-list-input";
import { useBusinesses } from "./use-businesses";

export function useBusinessFacet(
	counts: Record<string, number> | undefined,
): DataTableFacet {
	const businesses = useBusinesses();

	return {
		id: "businesses",
		label: "Business",
		options: [
			{ value: NO_BUSINESS, label: "No business" },
			...(businesses.data ?? []).map((business) => ({
				value: business.id,
				label: business.name,
			})),
		].filter((option) => (counts?.[option.value] ?? 0) > 0),
	};
}
