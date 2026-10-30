"use client";

import TaskApproved from "@carbon/icons-react/es/TaskApproved";
import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { useState } from "react";
import { LocalRelativeTime } from "@/components/local-date-time";
import type { RouterOutputs } from "@/lib/trpc/types";
import { TaskRunSheet } from "./task-run-sheet";

type Approvals = RouterOutputs["taskRuns"]["list"];
type Approval = Approvals["items"][number];

function ApprovalRow({ approval }: { approval: Approval }) {
	const [open, setOpen] = useState(false);

	return (
		<li className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 text-sm md:px-5">
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="font-medium">{approval.taskTitle}</span>
				{approval.summary ? (
					<p className="line-clamp-2 text-pretty text-muted-foreground text-xs/5">
						{approval.summary}
					</p>
				) : null}
				<span className="text-muted-foreground text-xs">
					Finished <LocalRelativeTime date={approval.createdAt} />
				</span>
			</div>
			<Button size="sm" onClick={() => setOpen(true)}>
				{approval.waiting === 1
					? "Review 1 step"
					: `Review ${approval.waiting} steps`}
			</Button>
			{open ? (
				<TaskRunSheet
					taskId={approval.taskId}
					title={approval.taskTitle}
					runId={approval.id}
					open={open}
					onOpenChange={setOpen}
				/>
			) : null}
		</li>
	);
}

export function ApprovalsList({
	query,
}: {
	query: {
		data: Approvals | undefined;
		isPending: boolean;
		isError: boolean;
		error: { message: string } | null;
		refetch: () => unknown;
	};
}) {
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
					<EmptyTitle>The approvals did not load</EmptyTitle>
					<EmptyDescription>{query.error?.message}</EmptyDescription>
				</EmptyHeader>
				<Button variant="outline" onClick={() => void query.refetch()}>
					Try again
				</Button>
			</Empty>
		);
	}

	if (query.data.items.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Icon icon={TaskApproved} />
					</EmptyMedia>
					<EmptyTitle>Nothing waiting for you</EmptyTitle>
					<EmptyDescription>
						Press Do it for me on a to-do. When the agent finishes, its work and
						next steps wait here for your approval.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<ul className="flex flex-col divide-y rounded-lg border">
			{query.data.items.map((approval) => (
				<ApprovalRow key={approval.id} approval={approval} />
			))}
		</ul>
	);
}
