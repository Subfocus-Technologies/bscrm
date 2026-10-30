import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { loadOpportunitiesSearchParams } from "./opportunities-search-params";
import { OpportunitiesView } from "./opportunities-view";

export const metadata: Metadata = {
	title: "Events, awards and speaking",
};

export default function OpportunitiesPage({
	searchParams,
}: PageProps<"/[slug]/opportunities">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Events, awards and speaking</PageShellTitle>
					<PageShellDescription>
						Press a review button and the agent searches the web for what fits
						our businesses. Every result links to the organiser's own page.
						Nothing is booked or entered for you.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Opportunities searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Opportunities({
	searchParams,
}: Pick<PageProps<"/[slug]/opportunities">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		loadOpportunitiesSearchParams(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(trpc.users.list.queryOptions()),
		queryClient.prefetchQuery(
			trpc.opportunities.list.queryOptions({
				kind: values[SEARCH_PARAM.opportunities.kind],
				view: values[SEARCH_PARAM.opportunities.view],
				page: values[SEARCH_PARAM.list.page],
			}),
		),
	]);

	return (
		<HydrateClient>
			<OpportunitiesView />
		</HydrateClient>
	);
}
