import {
	OPPORTUNITY_KINDS,
	OPPORTUNITY_VIEWS,
} from "@crm/validation/opportunities";
import {
	createLoader,
	parseAsInteger,
	parseAsStringLiteral,
} from "nuqs/server";
import { SEARCH_PARAM } from "@/lib/search-param-keys";

export const opportunitiesParsers = {
	[SEARCH_PARAM.opportunities.kind]:
		parseAsStringLiteral(OPPORTUNITY_KINDS).withDefault("EVENT"),
	[SEARCH_PARAM.opportunities.view]:
		parseAsStringLiteral(OPPORTUNITY_VIEWS).withDefault("SUGGESTED"),
	[SEARCH_PARAM.list.page]: parseAsInteger.withDefault(1),
};

export const loadOpportunitiesSearchParams = createLoader(opportunitiesParsers);
