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
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import {
	listInputOf,
	loadInvestorsSearchParams,
} from "./investors-search-params";
import { InvestorsView } from "./investors-view";

export const metadata: Metadata = {
	title: "Investors",
};

export default function InvestorsPage({
	searchParams,
}: PageProps<"/[slug]/investors">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Investors</PageShellTitle>
					<PageShellDescription>
						Angels, angel groups and pre-seed funds for the raise. The agent
						finds and scores new ones every day; you approve who to approach.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Investors searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Investors({
	searchParams,
}: Pick<PageProps<"/[slug]/investors">, "searchParams">) {
	const [, params] = await Promise.all([
		requireSession(),
		loadInvestorsSearchParams(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(trpc.investors.fundraise.queryOptions()),
		queryClient.prefetchQuery(
			trpc.investors.list.queryOptions(listInputOf(params)),
		),
	]);

	return (
		<HydrateClient>
			<InvestorsView />
		</HydrateClient>
	);
}
