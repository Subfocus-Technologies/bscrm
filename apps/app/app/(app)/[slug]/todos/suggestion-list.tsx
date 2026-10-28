"use client";

import Email from "@carbon/icons-react/es/Email";
import ListChecked from "@carbon/icons-react/es/ListChecked";
import { Badge } from "@crm/ui/components/badge";
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
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmailReplySheet } from "@/components/crm/email-reply-sheet";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { LocalDay, LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Suggestions = RouterOutputs["todos"]["suggestions"];
type Suggestion = Suggestions["items"][number];

function SourceLine({ suggestion }: { suggestion: Suggestion }) {
	const source = suggestion.source;
	if (!source) return null;

	if (source.kind === "email") {
		return (
			<span className="flex min-w-0 flex-wrap items-center gap-x-1">
				Email{source.from ? ` from ${source.from}` : ""}:
				<span className="truncate">{source.subject ?? "(no subject)"}</span>
				<span>
					· <LocalRelativeTime date={source.lastMessageAt} />
				</span>
			</span>
		);
	}

	if (source.kind === "note") {
		return (
			<span className="flex min-w-0 flex-wrap items-center gap-x-1">
				Meeting notes:
				<span className="truncate">{source.title}</span>
				<span>
					· <LocalDay date={source.heldAt} />
				</span>
			</span>
		);
	}

	return (
		<span className="flex min-w-0 flex-wrap items-center gap-x-1">
			Meeting:
			<span className="truncate">{source.title ?? "(no title)"}</span>
			<span>
				· <LocalDay date={source.startsAt} />
			</span>
		</span>
	);
}

function Decide({
	suggestion,
	onReview,
}: {
	suggestion: Suggestion;
	onReview: (() => void) | null;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const accept = useMutation(
		trpc.todos.accept.mutationOptions({
			onSuccess: async () => {
				await cache.todos();
				toast.success("Added to your to-dos.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const ignore = useMutation(
		trpc.todos.ignore.mutationOptions({
			onSuccess: () => cache.todos(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const restore = useMutation(
		trpc.todos.restore.mutationOptions({
			onSuccess: () => cache.todos(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const busy = accept.isPending || ignore.isPending || restore.isPending;
	const reply = suggestion.kind === "REPLY";

	if (suggestion.status === "IGNORED") {
		return (
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					variant="outline"
					disabled={busy}
					onClick={() => restore.mutate({ id: suggestion.id })}
				>
					{restore.isPending ? <Spinner /> : null}
					Put back
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-wrap gap-2">
			{onReview ? (
				<Button
					size="sm"
					variant={reply ? "default" : "outline"}
					disabled={busy}
					onClick={onReview}
				>
					<Icon icon={Email} data-icon="inline-start" />
					{reply ? "Review and reply" : "Open email"}
				</Button>
			) : null}
			<Button
				size="sm"
				variant={reply && onReview ? "outline" : "default"}
				disabled={busy}
				onClick={() => accept.mutate({ id: suggestion.id })}
			>
				{accept.isPending ? <Spinner /> : null}
				Add to my to-dos
			</Button>
			<Button
				size="sm"
				variant="ghost"
				disabled={busy}
				onClick={() => ignore.mutate({ id: suggestion.id })}
			>
				Ignore
			</Button>
		</div>
	);
}

function SuggestionRow({ suggestion }: { suggestion: Suggestion }) {
	const [reviewing, setReviewing] = useState(false);
	const source = suggestion.source;
	const thread = source?.kind === "email" ? source : null;

	return (
		<li className="flex flex-col gap-3 px-4 py-4 text-sm md:px-5">
			<div className="flex min-w-0 flex-col gap-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium">{suggestion.title}</span>
					<Badge variant="outline">
						{suggestion.kind === "REPLY" ? "Reply" : "To-do"}
					</Badge>
					{suggestion.kind === "REPLY" && thread?.hasDraft ? (
						<Badge variant="outline">Draft ready</Badge>
					) : null}
					{suggestion.dueAt ? (
						<span className="text-muted-foreground text-xs">
							Due <LocalDay date={suggestion.dueAt} />
						</span>
					) : null}
				</div>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
					{suggestion.record ? (
						<RecordLink kind={suggestion.record.kind} id={suggestion.record.id}>
							{suggestion.record.name}
						</RecordLink>
					) : null}
					<SourceLine suggestion={suggestion} />
				</div>
			</div>

			{suggestion.detail ? (
				<p className="text-pretty text-muted-foreground text-xs/5">
					{suggestion.detail}
				</p>
			) : null}
			<blockquote className="border-l-2 pl-3 text-muted-foreground text-xs/5 italic">
				“{suggestion.quote}”
			</blockquote>

			<Decide
				suggestion={suggestion}
				onReview={thread ? () => setReviewing(true) : null}
			/>

			{thread ? (
				<EmailReplySheet
					emailThreadId={thread.emailThreadId}
					title={thread.subject ?? suggestion.title}
					open={reviewing}
					onOpenChange={setReviewing}
				/>
			) : null}
		</li>
	);
}

const EMPTY = {
	PROPOSED: {
		title: "Nothing to decide",
		description:
			"The agent reads your client emails, your meetings and your Gemini meeting notes, and suggests what to do here.",
	},
	IGNORED: {
		title: "Nothing ignored",
		description: "Suggestions you ignore stay here, in case you need them.",
	},
} as const;

export function SuggestionList({
	view,
	query,
}: {
	view: "PROPOSED" | "IGNORED";
	query: {
		data: Suggestions | undefined;
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
					<EmptyTitle>The suggestions did not load</EmptyTitle>
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
			{query.data.items.map((suggestion) => (
				<SuggestionRow key={suggestion.id} suggestion={suggestion} />
			))}
		</ul>
	);
}
