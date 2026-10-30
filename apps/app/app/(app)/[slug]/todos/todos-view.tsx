"use client";

import { TablePagination } from "@crm/ui/components/table-pagination";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import { ApprovalsList } from "./approvals-list";
import { LessonsList } from "./lessons-list";
import { SuggestionList } from "./suggestion-list";
import { TaskList } from "./task-list";
import { TODO_VIEWS, type TodoView, todosParsers } from "./todos-search-params";

const LABELS = {
	suggested: "Suggested",
	approvals: "Approvals",
	mine: "My to-dos",
	done: "Done",
	ignored: "Ignored",
	lessons: "What the agent learned",
} satisfies Record<TodoView, string>;

const SUGGESTIONS_POLL_MS = 60_000;

function isView(value: string): value is TodoView {
	return (TODO_VIEWS as readonly string[]).includes(value);
}

export function TodosView() {
	const trpc = useTRPC();
	const [params, setParams] = useQueryStates(todosParsers);
	const view = params[SEARCH_PARAM.todos.view];
	const page = params[SEARCH_PARAM.list.page];
	const showsSuggestions = view === "suggested" || view === "ignored";
	const showsApprovals = view === "approvals";
	const showsLessons = view === "lessons";

	const suggestions = useQuery({
		...trpc.todos.suggestions.queryOptions({
			view: view === "ignored" ? "IGNORED" : "PROPOSED",
			page: showsSuggestions ? page : 1,
		}),
		placeholderData: (previous) => previous,
		refetchInterval: SUGGESTIONS_POLL_MS,
	});
	const approvals = useQuery({
		...trpc.taskRuns.list.queryOptions({ page: showsApprovals ? page : 1 }),
		placeholderData: (previous) => previous,
		refetchInterval: SUGGESTIONS_POLL_MS,
	});
	const lessons = useQuery({
		...trpc.lessons.list.queryOptions({ page: showsLessons ? page : 1 }),
		placeholderData: (previous) => previous,
	});
	const tasks = useQuery({
		...trpc.activities.myTaskPage.queryOptions({
			view: view === "done" ? "done" : "open",
			page: showsSuggestions || showsApprovals || showsLessons ? 1 : page,
		}),
		placeholderData: (previous) => previous,
	});

	const counts = {
		suggested: suggestions.data?.counts.PROPOSED,
		approvals: approvals.data?.total,
		mine: tasks.data?.counts.open,
		done: tasks.data?.counts.done,
		ignored: suggestions.data?.counts.IGNORED,
		lessons: lessons.data?.total,
	} satisfies Record<TodoView, number | undefined>;

	const shown = showsLessons
		? lessons
		: showsApprovals
			? approvals
			: showsSuggestions
				? suggestions
				: tasks;
	const paging = shown.data && {
		total: shown.data.total,
		pageSize: shown.data.pageSize,
		loading: shown.isFetching,
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4">
			<Tabs
				value={view}
				onValueChange={(next) => {
					if (isView(next)) {
						void setParams({
							[SEARCH_PARAM.todos.view]: next,
							[SEARCH_PARAM.list.page]: 1,
						});
					}
				}}
			>
				<TabsList>
					{TODO_VIEWS.map((option) => (
						<TabsTrigger key={option} value={option}>
							{LABELS[option]}
							{counts[option] !== undefined ? (
								<span className="text-muted-foreground tabular-nums">
									{counts[option]}
								</span>
							) : null}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{showsLessons ? (
				<LessonsList query={lessons} />
			) : showsApprovals ? (
				<ApprovalsList query={approvals} />
			) : showsSuggestions ? (
				<SuggestionList
					view={view === "ignored" ? "IGNORED" : "PROPOSED"}
					query={suggestions}
				/>
			) : (
				<TaskList view={view === "done" ? "done" : "open"} query={tasks} />
			)}

			{paging && paging.total > 0 ? (
				<TablePagination
					page={page}
					totalPages={Math.max(1, Math.ceil(paging.total / paging.pageSize))}
					pageSize={paging.pageSize}
					total={paging.total}
					loading={paging.loading}
					onPageChange={(next) =>
						void setParams({ [SEARCH_PARAM.list.page]: next })
					}
				/>
			) : null}
		</div>
	);
}
