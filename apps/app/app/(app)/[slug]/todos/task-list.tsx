"use client";

import ListChecked from "@carbon/icons-react/es/ListChecked";
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { LocalDay, LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { TaskRunSheet } from "./task-run-sheet";

type TaskPage = RouterOutputs["activities"]["myTaskPage"];
type Task = TaskPage["rows"][number];
type RunState = RouterOutputs["taskRuns"]["statuses"][number];

function contactName(contact: NonNullable<Task["contact"]>): string {
	return [contact.firstName, contact.lastName].filter(Boolean).join(" ");
}

function TaskRecord({ task }: { task: Task }) {
	if (task.contact) {
		return (
			<RecordLink kind="contact" id={task.contact.id}>
				{contactName(task.contact)}
			</RecordLink>
		);
	}
	if (task.deal) {
		return (
			<RecordLink kind="deal" id={task.deal.id}>
				{task.deal.name}
			</RecordLink>
		);
	}
	if (task.company) {
		return (
			<RecordLink kind="company" id={task.company.id}>
				{task.company.name}
			</RecordLink>
		);
	}
	return null;
}

function TaskDue({ task }: { task: Task }) {
	if (task.completedAt) {
		return (
			<span>
				Done <LocalRelativeTime date={task.completedAt} />
			</span>
		);
	}
	if (!task.dueAt) return <span>No due date</span>;

	const overdue = new Date(task.dueAt).getTime() < Date.now();
	return (
		<StatusIndicator
			tone={overdue ? "error" : "info"}
			label={
				<>
					{overdue ? "Overdue" : "Due"} <LocalDay date={task.dueAt} />
				</>
			}
		/>
	);
}

const RUNS_POLL_MS = 15_000;

function runLabel(run: RunState | undefined): string {
	if (!run) return "Do it for me";
	if (run.status === "QUEUED" || run.status === "WORKING") return "Working";
	if (run.status === "AWAITING_APPROVAL") {
		return run.waiting === 1 ? "Review 1 step" : `Review ${run.waiting} steps`;
	}
	if (run.status === "FAILED") return "Try again";
	return "View the work";
}

function TaskRow({ task, run }: { task: Task; run: RunState | undefined }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const complete = useMutation(
		trpc.activities.complete.mutationOptions({
			onSuccess: () => cache.activity(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const done = task.completedAt !== null;
	const [working, setWorking] = useState(false);
	const busy = run?.status === "QUEUED" || run?.status === "WORKING";

	return (
		<li className="flex items-start gap-3 px-4 py-3 text-sm md:px-5">
			<Checkbox
				className="mt-0.5"
				checked={done}
				disabled={complete.isPending}
				aria-label={done ? "Mark as not done" : "Mark as done"}
				onCheckedChange={() =>
					complete.mutate({ id: task.id, completed: !done })
				}
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className={done ? "text-muted-foreground line-through" : ""}>
					{task.subject ?? "Untitled task"}
				</span>
				<span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
					<TaskRecord task={task} />
					<TaskDue task={task} />
				</span>
			</div>
			{done && !run ? null : (
				<Button
					size="sm"
					variant={run ? "outline" : "default"}
					onClick={() => setWorking(true)}
				>
					{busy ? <Spinner /> : null}
					{runLabel(run)}
				</Button>
			)}
			{working ? (
				<TaskRunSheet
					taskId={task.id}
					title={task.subject ?? "Untitled task"}
					runId={run?.status === "FAILED" ? null : (run?.runId ?? null)}
					open={working}
					onOpenChange={setWorking}
				/>
			) : null}
		</li>
	);
}

const EMPTY = {
	open: {
		title: "Nothing to do",
		description:
			"Add suggestions to your to-dos, or add a task on any contact, company or deal.",
	},
	done: {
		title: "Nothing done yet",
		description: "Tasks you tick off show here.",
	},
} as const;

export function TaskList({
	view,
	query,
}: {
	view: "open" | "done";
	query: {
		data: TaskPage | undefined;
		isPending: boolean;
		isError: boolean;
		error: { message: string } | null;
		refetch: () => unknown;
	};
}) {
	const trpc = useTRPC();
	const taskIds = query.data?.rows.map((task) => task.id) ?? [];
	const runs = useQuery({
		...trpc.taskRuns.statuses.queryOptions({ taskIds }),
		enabled: taskIds.length > 0,
		refetchInterval: RUNS_POLL_MS,
	});
	const runOf = new Map(runs.data?.map((run) => [run.taskId, run]));

	if (query.isPending) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	if (query.isError || !query.data) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Your to-dos did not load</EmptyTitle>
					<EmptyDescription>{query.error?.message}</EmptyDescription>
				</EmptyHeader>
				<Button variant="outline" onClick={() => void query.refetch()}>
					Try again
				</Button>
			</Empty>
		);
	}

	if (query.data.rows.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Icon icon={ListChecked} />
					</EmptyMedia>
					<EmptyTitle>{EMPTY[view].title}</EmptyTitle>
					<EmptyDescription>{EMPTY[view].description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<ul className="flex flex-col divide-y rounded-lg border">
			{query.data.rows.map((task) => (
				<TaskRow key={task.id} task={task} run={runOf.get(task.id)} />
			))}
		</ul>
	);
}
