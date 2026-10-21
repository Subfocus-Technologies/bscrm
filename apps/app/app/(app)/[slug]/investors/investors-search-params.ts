import { INVESTOR_SORTS, INVESTOR_STAGES } from "@crm/validation/investors";
import {
	createLoader,
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
} from "nuqs/server";
import { SEARCH_PARAM } from "@/lib/search-param-keys";

export const INVESTOR_SECTIONS = [
	"pipeline",
	"outreach",
	"profile",
	"import",
] as const;

export type InvestorSection = (typeof INVESTOR_SECTIONS)[number];

export const investorsParsers = {
	[SEARCH_PARAM.investors.section]:
		parseAsStringLiteral(INVESTOR_SECTIONS).withDefault("pipeline"),
	[SEARCH_PARAM.investors.stage]:
		parseAsStringLiteral(INVESTOR_STAGES).withDefault("TO_APPROVE"),
	[SEARCH_PARAM.list.sort]:
		parseAsStringLiteral(INVESTOR_SORTS).withDefault("fit"),
	[SEARCH_PARAM.list.q]: parseAsString.withDefault(""),
	[SEARCH_PARAM.list.page]: parseAsInteger.withDefault(1),
};

export const loadInvestorsSearchParams = createLoader(investorsParsers);

export type InvestorsParams = Awaited<
	ReturnType<typeof loadInvestorsSearchParams>
>;

export function listInputOf(params: InvestorsParams) {
	return {
		stage: params[SEARCH_PARAM.investors.stage],
		kinds: [],
		q: params[SEARCH_PARAM.list.q],
		sort: params[SEARCH_PARAM.list.sort],
		page: params[SEARCH_PARAM.list.page],
	};
}
