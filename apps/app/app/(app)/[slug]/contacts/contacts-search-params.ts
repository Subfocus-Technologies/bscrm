import { createListSearchParams } from "@/components/data-table/list-search-params";

export const contactsSearchParams = createListSearchParams({
	defaultSort: "createdAt",
	defaultDir: "desc",
	facetIds: [
		"owner",
		"businesses",
		"company",
		"title",
		"seniority",
		"persona",
		"activity",
	] as const,
});
