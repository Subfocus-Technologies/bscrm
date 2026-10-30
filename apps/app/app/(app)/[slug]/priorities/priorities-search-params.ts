import { createLoader, parseAsString } from "nuqs/server";
import { SEARCH_PARAM } from "@/lib/search-param-keys";

export const prioritiesParsers = {
	[SEARCH_PARAM.priorities.week]: parseAsString,
	[SEARCH_PARAM.priorities.owner]: parseAsString,
};

export const loadPrioritiesSearchParams = createLoader(prioritiesParsers);
