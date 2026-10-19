"use client";

import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import Bot from "@crm/ui/components/icons/bot";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type FollowUps = RouterOutputs["meetingNotes"]["followUps"];
type FollowUp = FollowUps["items"][number];

const READING_POLL_MS = 3_000;

const GROUPS = [
	{ kind: "TODO", label: "To-dos" },
	{ kind: "NEXT_STEP", label: "Next steps" },
] as const;

function useDecide() {
	const trpc = useTRPC();
	const cache = useCrmCache();

	return useMutation(
		trpc.meetingNotes.decide.mutationOptions({
			onSuccess: async (result) => {
				await cache.meetingNotes();
				if (result.status === "ACCEPTED") toast.success("Added as a task.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
}

function FollowUpRow({ item }: { item: FollowUp }) {
	const decide = useDecide();
	const decided = item.status !== "PROPOSED";

	return (
		<li className="flex items-start gap-2.5 py-1.5">
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className={decided ? "text-muted-foreground" : "font-medium"}>
					{item.title}
				</span>
				<span className="flex flex-wrap gap-x-2 text-muted-foreground">
					{item.owner ? <span>{item.owner}</span> : null}
					{item.dueAt ? (
						<span>
							Due <LocalRelativeTime date={item.dueAt} />
						</span>
					) : null}
					<span className="italic">“{item.quote}”</span>
				</span>
			</div>
			{decided ? (
				<span className="shrink-0 text-muted-foreground">
					{item.status === "ACCEPTED" ? "Added as task" : "Dismissed"}
				</span>
			) : (
				<div className="flex shrink-0 items-center gap-1">
					{decide.isPending ? <Spinner /> : null}
					<Button
						size="xs"
						disabled={decide.isPending}
						onClick={() => decide.mutate({ id: item.id, decision: "accept" })}
					>
						Add as task
					</Button>
					<Button
						size="xs"
						variant="ghost"
						disabled={decide.isPending}
						onClick={() => decide.mutate({ id: item.id, decision: "dismiss" })}
					>
						Dismiss
					</Button>
				</div>
			)}
		</li>
	);
}

function ReadAgain({
	activityId,
	label,
}: {
	activityId: string;
	label: string;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const reread = useMutation(
		trpc.meetingNotes.reread.mutationOptions({
			onSuccess: () => cache.meetingNotes(),
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Button
			size="xs"
			variant="outline"
			disabled={reread.isPending}
			onClick={() => reread.mutate({ activityId })}
		>
			{reread.isPending ? <Spinner /> : null}
			{label}
		</Button>
	);
}

function FollowUpStatus({
	activityId,
	followUps,
}: {
	activityId: string;
	followUps: FollowUps;
}) {
	if (followUps.reading === "reading") {
		return (
			<p className="flex items-center gap-2 text-muted-foreground">
				<Spinner /> Reading the notes for to-dos and next steps…
			</p>
		);
	}

	if (followUps.reading === "failed") {
		return (
			<p className="flex flex-wrap items-center gap-2 text-muted-foreground">
				The agent could not read these notes.
				<ReadAgain activityId={activityId} label="Try again" />
			</p>
		);
	}

	return (
		<p className="flex flex-wrap items-center gap-2 text-muted-foreground">
			No to-dos or next steps found in these notes.
			<ReadAgain activityId={activityId} label="Read again" />
		</p>
	);
}

export function MeetingFollowUps({ activityId }: { activityId: string }) {
	const trpc = useTRPC();
	const followUps = useQuery({
		...trpc.meetingNotes.followUps.queryOptions({ activityId }),
		refetchInterval: (query) =>
			query.state.data?.reading === "reading" ? READING_POLL_MS : false,
	});

	if (followUps.isPending) return null;

	if (followUps.isError) {
		return (
			<p className="text-muted-foreground">The suggestions did not load.</p>
		);
	}

	const items = followUps.data.items;

	return (
		<div className="flex flex-col gap-2 rounded-lg border p-3">
			<span className="flex items-center gap-1.5 font-medium">
				<Icon icon={Bot} /> Suggested from these notes
			</span>
			{items.length === 0 || followUps.data.reading === "reading" ? (
				<FollowUpStatus activityId={activityId} followUps={followUps.data} />
			) : null}
			{GROUPS.map((group) => {
				const rows = items.filter((item) => item.kind === group.kind);
				if (rows.length === 0) return null;

				return (
					<div key={group.kind} className="flex flex-col">
						<span className="text-muted-foreground text-xs uppercase tracking-wider">
							{group.label}
						</span>
						<ul className="flex flex-col divide-y">
							{rows.map((item) => (
								<FollowUpRow key={item.id} item={item} />
							))}
						</ul>
					</div>
				);
			})}
		</div>
	);
}
