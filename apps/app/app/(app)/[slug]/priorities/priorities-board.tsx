"use client";

import Add from "@carbon/icons-react/es/Add";
import ChevronLeft from "@carbon/icons-react/es/ChevronLeft";
import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import type { PriorityStatus } from "@crm/validation/priorities";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { OwnerSelect } from "@/components/crm/owner-select";
import { LocalDay } from "@/components/local-date-time";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { prioritiesParsers } from "./priorities-search-params";
import { PriorityDialog } from "./priority-dialog";

type Week = RouterOutputs["priorities"]["week"];
type Priority = Week["columns"]["PRIORITY"]["items"][number];

const COLUMNS = [
	{ status: "PRIORITY", title: "Priorities", empty: "Nothing planned yet." },
	{ status: "ONGOING", title: "Ongoing", empty: "Nothing under way." },
	{ status: "DONE", title: "Done", empty: "Nothing finished this week." },
] as const satisfies readonly {
	status: PriorityStatus;
	title: string;
	empty: string;
}[];

const NEXT_STEPS = {
	PRIORITY: [{ status: "ONGOING", label: "Start" }],
	ONGOING: [
		{ status: "DONE", label: "Mark done" },
		{ status: "PRIORITY", label: "Back to priorities" },
	],
	DONE: [{ status: "ONGOING", label: "Reopen" }],
} as const satisfies Record<
	PriorityStatus,
	readonly { status: PriorityStatus; label: string }[]
>;

function PriorityCard({
	priority,
	week,
}: {
	priority: Priority;
	week: string;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [editing, setEditing] = useState(false);

	const update = useMutation(
		trpc.priorities.update.mutationOptions({
			onSuccess: () => cache.priorities(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const remove = useMutation(
		trpc.priorities.remove.mutationOptions({
			onSuccess: async () => {
				await cache.priorities();
				toast.success("Priority removed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const busy = update.isPending || remove.isPending;

	return (
		<li className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium">{priority.title}</span>
				{priority.carriedOver ? (
					<Badge variant="outline">From an earlier week</Badge>
				) : null}
			</div>
			{priority.deliverable ? (
				<p className="whitespace-pre-wrap text-pretty text-muted-foreground text-xs/5">
					{priority.deliverable}
				</p>
			) : null}
			{priority.dueAt ? (
				<span className="text-muted-foreground text-xs">
					Due <LocalDay date={priority.dueAt} />
				</span>
			) : null}
			<OwnerSelect
				value={priority.owner?.id ?? null}
				disabled={busy}
				onValueChange={(ownerId) => update.mutate({ id: priority.id, ownerId })}
			/>
			<div className="flex flex-wrap gap-1">
				{NEXT_STEPS[priority.status].map((step) => (
					<Button
						key={step.status}
						size="xs"
						variant="outline"
						disabled={busy}
						onClick={() =>
							update.mutate({ id: priority.id, status: step.status })
						}
					>
						{step.label}
					</Button>
				))}
				<Button
					size="xs"
					variant="ghost"
					disabled={busy}
					onClick={() => setEditing(true)}
				>
					Edit
				</Button>
				<Button
					size="xs"
					variant="ghost"
					disabled={busy}
					onClick={() => remove.mutate({ id: priority.id })}
				>
					Remove
				</Button>
			</div>
			<span className="text-muted-foreground text-xs">
				Last changed by {priority.updatedBy}
			</span>
			{editing ? (
				<PriorityDialog
					open={editing}
					onOpenChange={setEditing}
					week={week}
					priority={priority}
				/>
			) : null}
		</li>
	);
}

function WeekColumn({
	title,
	empty,
	column,
	week,
}: {
	title: string;
	empty: string;
	column: Week["columns"]["PRIORITY"];
	week: string;
}) {
	return (
		<section className="flex min-w-0 flex-col gap-2">
			<h2 className="flex items-center gap-2 font-medium text-sm">
				{title}
				<span className="text-muted-foreground tabular-nums">
					{column.total}
				</span>
			</h2>
			{column.items.length === 0 ? (
				<p className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
					{empty}
				</p>
			) : (
				<ul className="flex flex-col gap-2">
					{column.items.map((priority) => (
						<PriorityCard key={priority.id} priority={priority} week={week} />
					))}
				</ul>
			)}
			{column.total > column.items.length ? (
				<p className="text-muted-foreground text-xs">
					Showing the first {column.items.length} of {column.total}.
				</p>
			) : null}
		</section>
	);
}

export function PrioritiesBoard() {
	const trpc = useTRPC();
	const [params, setParams] = useQueryStates(prioritiesParsers);
	const [adding, setAdding] = useState(false);
	const weekParam = params[SEARCH_PARAM.priorities.week];
	const owner = params[SEARCH_PARAM.priorities.owner];

	const board = useQuery({
		...trpc.priorities.week.queryOptions({
			week: weekParam ?? undefined,
			ownerId: owner ?? undefined,
		}),
		placeholderData: (previous) => previous,
	});

	if (board.isPending) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	if (board.isError) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>The priorities did not load</EmptyTitle>
					<EmptyDescription>{board.error.message}</EmptyDescription>
				</EmptyHeader>
				<Button variant="outline" onClick={() => void board.refetch()}>
					Try again
				</Button>
			</Empty>
		);
	}

	const data = board.data;
	const goTo = (week: string | null) =>
		void setParams({ [SEARCH_PARAM.priorities.week]: week });

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-8">
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="icon-sm"
					variant="outline"
					aria-label="Previous week"
					onClick={() => goTo(data.previousWeek)}
				>
					<Icon icon={ChevronLeft} />
				</Button>
				<span className="text-sm">
					Week of <LocalDay date={data.week} />
				</span>
				<Button
					size="icon-sm"
					variant="outline"
					aria-label="Next week"
					onClick={() => goTo(data.nextWeek)}
				>
					<Icon icon={ChevronRight} />
				</Button>
				{data.week === data.thisWeek ? null : (
					<Button size="sm" variant="ghost" onClick={() => goTo(null)}>
						This week
					</Button>
				)}
				<div className="w-full sm:w-52">
					<OwnerSelect
						value={owner}
						emptyLabel="Everyone"
						onValueChange={(next) =>
							void setParams({ [SEARCH_PARAM.priorities.owner]: next })
						}
					/>
				</div>
				<Button
					size="sm"
					className="sm:ml-auto"
					onClick={() => setAdding(true)}
				>
					<Icon icon={Add} data-icon="inline-start" />
					Add a priority
				</Button>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				{COLUMNS.map((column) => (
					<WeekColumn
						key={column.status}
						title={column.title}
						empty={column.empty}
						column={data.columns[column.status]}
						week={data.week}
					/>
				))}
			</div>

			<PriorityDialog open={adding} onOpenChange={setAdding} week={data.week} />
		</div>
	);
}
