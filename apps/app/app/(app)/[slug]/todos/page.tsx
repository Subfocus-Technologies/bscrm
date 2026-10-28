import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellActions,
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
import { AddTodoDialog } from "./add-todo-dialog";
import { loadTodosSearchParams } from "./todos-search-params";
import { TodosView } from "./todos-view";

export const metadata: Metadata = {
	title: "To-do",
};

export default function TodosPage({
	searchParams,
}: PageProps<"/[slug]/todos">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>To-do</PageShellTitle>
					<PageShellDescription>
						The agent reads your client emails and meetings and suggests what to
						do next. Only you see suggestions from your mailbox. Nothing becomes
						a task, and no email is sent, until you say so.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<AddTodoDialog />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Todos searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Todos({
	searchParams,
}: Pick<PageProps<"/[slug]/todos">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		loadTodosSearchParams(searchParams),
	]);

	const view = values[SEARCH_PARAM.todos.view];
	const page = values[SEARCH_PARAM.list.page];
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await Promise.all([
		queryClient.prefetchQuery(
			trpc.todos.suggestions.queryOptions({
				view: view === "ignored" ? "IGNORED" : "PROPOSED",
				page: view === "suggested" || view === "ignored" ? page : 1,
			}),
		),
		queryClient.prefetchQuery(
			trpc.activities.myTaskPage.queryOptions({
				view: view === "done" ? "done" : "open",
				page: view === "mine" || view === "done" ? page : 1,
			}),
		),
	]);

	return (
		<HydrateClient>
			<TodosView />
		</HydrateClient>
	);
}
