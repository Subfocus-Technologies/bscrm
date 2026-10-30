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
import { PrioritiesBoard } from "./priorities-board";
import { loadPrioritiesSearchParams } from "./priorities-search-params";

export const metadata: Metadata = {
	title: "Priorities",
};

export default function PrioritiesPage({
	searchParams,
}: PageProps<"/[slug]/priorities">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Priorities</PageShellTitle>
					<PageShellDescription>
						The team's week: what matters, what is under way and what got done,
						each with a deliverable and a named owner.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Board searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Board({
	searchParams,
}: Pick<PageProps<"/[slug]/priorities">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		loadPrioritiesSearchParams(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(trpc.users.list.queryOptions()),
		queryClient.prefetchQuery(
			trpc.priorities.week.queryOptions({
				week: values[SEARCH_PARAM.priorities.week] ?? undefined,
				ownerId: values[SEARCH_PARAM.priorities.owner] ?? undefined,
			}),
		),
	]);

	return (
		<HydrateClient>
			<PrioritiesBoard />
		</HydrateClient>
	);
}
