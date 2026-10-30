"use client";

import { Button } from "@crm/ui/components/button";
import { Markdown } from "@crm/ui/components/markdown";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AllowGoogleAccess } from "@/components/allow-google-access";
import {
	DetailSheet,
	DetailSheetBody,
	DetailSheetHeader,
	DetailSheetSection,
} from "@/components/detail-sheet";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { TaskRunActionCard } from "./task-run-action";

type Run = RouterOutputs["taskRuns"]["get"];

const WORK_POLL_MS = 5_000;

function isWorking(run: Run | undefined): boolean {
	return (
		run?.status === "QUEUED" ||
		run?.status === "WORKING" ||
		Boolean(run?.actions.some((action) => action.status === "RUNNING"))
	);
}

function StartForm({
	taskId,
	label,
	onStarted,
}: {
	taskId: string;
	label: string;
	onStarted: (runId: string) => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [instructions, setInstructions] = useState("");

	const start = useMutation(
		trpc.taskRuns.start.mutationOptions({
			onSuccess: async (run) => {
				await cache.taskRuns();
				onStarted(run.id);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<div className="flex flex-col gap-2">
			<Textarea
				value={instructions}
				rows={3}
				aria-label="Instructions"
				placeholder="Optional: anything the agent should know, for example the price to use or who to copy"
				onChange={(event) => setInstructions(event.target.value)}
			/>
			<p className="text-muted-foreground text-xs">
				The agent reads the client's history and our playbooks, does the work,
				and stops for your approval. It sends nothing by itself.
			</p>
			<Button
				size="sm"
				className="w-fit"
				disabled={start.isPending}
				onClick={() =>
					start.mutate({
						taskId,
						instructions: instructions.trim() || undefined,
					})
				}
			>
				{start.isPending ? <Spinner /> : null}
				{label}
			</Button>
		</div>
	);
}

function RunView({ run }: { run: Run }) {
	const needsGoogle = run.actions.some(
		(action) =>
			(action.status === "PROPOSED" || action.status === "FAILED") &&
			((action.payload.kind === "EMAIL" && !run.canSendEmail) ||
				(action.payload.kind === "EVENT" && !run.canAddToCalendar)),
	);
	const copy = async () => {
		await navigator.clipboard.writeText(run.deliverable ?? "");
		toast.success("Copied.");
	};

	return (
		<>
			{run.summary ? (
				<DetailSheetSection title="What the agent did">
					<Markdown>{run.summary}</Markdown>
				</DetailSheetSection>
			) : null}
			{run.deliverable ? (
				<DetailSheetSection
					title="The work"
					action={
						<Button size="xs" variant="ghost" onClick={() => void copy()}>
							Copy
						</Button>
					}
				>
					<Markdown>{run.deliverable}</Markdown>
				</DetailSheetSection>
			) : null}
			{run.actions.length > 0 ? (
				<DetailSheetSection title="Next steps for your approval">
					<div className="flex flex-col gap-3">
						{needsGoogle ? (
							<AllowGoogleAccess
								title="Allow sending and calendar"
								description="Approved steps go out from your own Gmail and calendar. Google asks you once to allow sending email and adding events to your calendar. Nothing goes out until you approve it."
							/>
						) : null}
						<ul className="flex flex-col gap-3">
							{run.actions.map((action) => (
								<TaskRunActionCard key={action.id} action={action} run={run} />
							))}
						</ul>
					</div>
				</DetailSheetSection>
			) : null}
		</>
	);
}

export function TaskRunSheet({
	taskId,
	title,
	runId,
	open,
	onOpenChange,
}: {
	taskId: string;
	title: string;
	runId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const trpc = useTRPC();
	const [started, setStarted] = useState<string | null>(null);
	const [redoing, setRedoing] = useState(false);
	const activeId = started ?? runId;

	const run = useQuery({
		...trpc.taskRuns.get.queryOptions({ id: activeId ?? "" }),
		enabled: activeId !== null,
		refetchInterval: (query) =>
			isWorking(query.state.data) ? WORK_POLL_MS : false,
	});
	const data = run.data;
	const starting = activeId === null || redoing;

	return (
		<DetailSheet open={open} onOpenChange={onOpenChange} size="xl">
			<DetailSheetHeader
				title={title}
				description="Done by the agent, waiting for your approval."
				onClose={() => onOpenChange(false)}
			/>
			<DetailSheetBody>
				{starting ? (
					<DetailSheetSection title="Do it for me">
						<StartForm
							taskId={taskId}
							label={redoing ? "Do it again" : "Start"}
							onStarted={(id) => {
								setStarted(id);
								setRedoing(false);
							}}
						/>
					</DetailSheetSection>
				) : null}

				{!starting && run.isPending ? (
					<DetailSheetSection>
						<div className="flex justify-center py-6">
							<Spinner />
						</div>
					</DetailSheetSection>
				) : null}

				{!starting && run.isError ? (
					<DetailSheetSection>
						<p className="text-muted-foreground text-xs">
							This work did not load. {run.error.message}
						</p>
					</DetailSheetSection>
				) : null}

				{!starting && data?.status === "FAILED" ? (
					<DetailSheetSection>
						<p className="text-muted-foreground text-xs">{data.failure}</p>
					</DetailSheetSection>
				) : null}

				{!starting &&
				(data?.status === "QUEUED" || data?.status === "WORKING") ? (
					<DetailSheetSection>
						<p className="flex items-center gap-2 text-muted-foreground text-xs">
							<Spinner />
							The agent is working on this. You can close this panel. It shows
							in Approvals when it is ready.
						</p>
					</DetailSheetSection>
				) : null}

				{!starting && data ? <RunView run={data} /> : null}

				{!starting && data && !isWorking(data) ? (
					<DetailSheetSection>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setRedoing(true)}
						>
							Do it again with new instructions
						</Button>
					</DetailSheetSection>
				) : null}
			</DetailSheetBody>
		</DetailSheet>
	);
}
