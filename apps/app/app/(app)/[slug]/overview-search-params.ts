import {
	DEFAULT_REPORT_PERIOD,
	REPORT_PERIODS,
} from "@crm/validation/dashboard";
import { createLoader, parseAsStringLiteral } from "nuqs/server";
import { SEARCH_PARAM } from "@/lib/search-param-keys";

export const OVERVIEW_SCOPES = ["me", "everyone"] as const;

export type OverviewScope = (typeof OVERVIEW_SCOPES)[number];

export const overviewParsers = {
	[SEARCH_PARAM.overview.scope]:
		parseAsStringLiteral(OVERVIEW_SCOPES).withDefault("me"),
	[SEARCH_PARAM.overview.period]: parseAsStringLiteral(
		REPORT_PERIODS,
	).withDefault(DEFAULT_REPORT_PERIOD),
};

export const loadOverviewSearchParams = createLoader(overviewParsers);
