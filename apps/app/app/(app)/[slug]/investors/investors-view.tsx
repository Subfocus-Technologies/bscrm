"use client";

import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { useQueryStates } from "nuqs";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { FundraiseProfile } from "./fundraise-profile";
import { InvestorImport } from "./investor-import";
import { InvestorPipeline } from "./investor-pipeline";
import {
	INVESTOR_SECTIONS,
	type InvestorSection,
	investorsParsers,
} from "./investors-search-params";

const SECTION_LABEL = {
	pipeline: "Pipeline",
	profile: "Fundraise profile",
	import: "Upload a spreadsheet",
} satisfies Record<InvestorSection, string>;

function isSection(value: string): value is InvestorSection {
	return (INVESTOR_SECTIONS as readonly string[]).includes(value);
}

export function InvestorsView() {
	const [params, setParams] = useQueryStates(investorsParsers);
	const section = params[SEARCH_PARAM.investors.section];
	const go = (next: InvestorSection) =>
		void setParams({ [SEARCH_PARAM.investors.section]: next });

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4">
			<Tabs
				value={section}
				onValueChange={(next) => {
					if (isSection(next)) go(next);
				}}
			>
				<TabsList>
					{INVESTOR_SECTIONS.map((option) => (
						<TabsTrigger key={option} value={option}>
							{SECTION_LABEL[option]}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{section === "pipeline" ? <InvestorPipeline onNavigate={go} /> : null}
			{section === "profile" ? <FundraiseProfile /> : null}
			{section === "import" ? <InvestorImport onNavigate={go} /> : null}
		</div>
	);
}
