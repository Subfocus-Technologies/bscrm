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
import { MeetingNotesInbox } from "./meeting-notes-inbox";
import { loadMeetingNotesSearchParams } from "./meeting-notes-search-params";

export const metadata: Metadata = {
	title: "Meeting notes",
};

export default function MeetingNotesPage({
	searchParams,
}: PageProps<"/[slug]/meeting-notes">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Meeting notes</PageShellTitle>
					<PageShellDescription>
						Gemini notes from your Gmail. Only you can see them, and none
						reaches a record until you allow and file it.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Inbox searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Inbox({
	searchParams,
}: Pick<PageProps<"/[slug]/meeting-notes">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		loadMeetingNotesSearchParams(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.meetingNotes.inbox.queryOptions({
			view: values[SEARCH_PARAM.meetingNotes.view],
			page: values[SEARCH_PARAM.list.page],
		}),
	);

	return (
		<HydrateClient>
			<MeetingNotesInbox />
		</HydrateClient>
	);
}
