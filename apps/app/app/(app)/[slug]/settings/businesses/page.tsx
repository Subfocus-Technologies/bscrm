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
import { BusinessSettings } from "./business-settings";
import { FilingSettings } from "./filing-settings";

export const metadata: Metadata = {
	title: "Businesses",
};

export default function BusinessesSettingsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Businesses</PageShellTitle>
					<PageShellDescription>
						The businesses you file companies, contacts and deals into, and the
						agent that sorts new records for you.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Businesses />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Businesses() {
	await requireSession();

	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();
	await Promise.all([
		queryClient.prefetchQuery(trpc.businesses.list.queryOptions()),
		queryClient.prefetchQuery(trpc.businesses.unfiled.queryOptions()),
		queryClient.prefetchQuery(trpc.businesses.suggestions.queryOptions({})),
		queryClient.prefetchQuery(trpc.businesses.listRules.queryOptions()),
		queryClient.prefetchQuery(trpc.businesses.filingLimit.queryOptions()),
	]);

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<BusinessSettings />
				<FilingSettings />
			</div>
		</HydrateClient>
	);
}
