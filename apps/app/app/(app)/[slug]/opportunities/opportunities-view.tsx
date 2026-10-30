"use client";

import Events from "@carbon/icons-react/es/Events";
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
import { TablePagination } from "@crm/ui/components/table-pagination";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import {
	OPPORTUNITY_KINDS,
	OPPORTUNITY_VIEWS,
	type OpportunityKind,
	type OpportunityView,
} from "@crm/validation/opportunities";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { opportunitiesParsers } from "./opportunities-search-params";
import { OpportunityRow } from "./opportunity-row";

type List = RouterOutputs["opportunities"]["list"];
type Review = List["review"];

const REVIEW_POLL_MS = 10_000;

const KINDS = {
	EVENT: { label: "Events", button: "Review property events" },
	AWARD: { label: "Awards", button: "Review awards" },
	SPEAKING: { label: "Speaking", button: "Review speaking slots" },
} satisfies Record<OpportunityKind, { label: string; button: string }>;

const VIEWS = {
	SUGGESTED: "To review",
	PLANNED: "Planned",
	DONE: "Done",
	DISMISSED: "Not for us",
} satisfies Record<OpportunityView, string>;

const EMPTY = {
	SUGGESTED: "Nothing to review yet. Press the review button to search.",
	PLANNED: "Nothing planned yet.",
	DONE: "Nothing done yet.",
	DISMISSED: "Nothing turned down yet.",
} satisfies Record<OpportunityView, string>;

function isReviewing(review: Review): boolean {
	return review?.state === "waiting" || review?.state === "running";
}

function isKind(value: string): value is OpportunityKind {
	return (OPPORTUNITY_KINDS as readonly string[]).includes(value);
}

function isView(value: string): value is OpportunityView {
	return (OPPORTUNITY_VIEWS as readonly string[]).includes(value);
}

function ReviewStatus({ review }: { review: Review }) {
	if (!review) return null;

	if (isReviewing(review)) {
		return (
			<p className="flex items-center gap-2 text-muted-foreground text-xs">
				<Spinner />
				The agent is searching. This usually takes a few minutes, and new
				results appear here.
			</p>
		);
	}

	if (review.state === "failed") {
		return (
			<p className="text-muted-foreground text-xs">
				The last review did not finish. Press the button to try again.
			</p>
		);
	}

	return (
		<p className="text-muted-foreground text-xs">
			Last reviewed{" "}
			<LocalRelativeTime date={review.finishedAt ?? review.requestedAt} />
			{review.outcome ? `. ${review.outcome}` : "."}
		</p>
	);
}

export function OpportunitiesView() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [params, setParams] = useQueryStates(opportunitiesParsers);
	const kind = params[SEARCH_PARAM.opportunities.kind];
	const view = params[SEARCH_PARAM.opportunities.view];
	const page = params[SEARCH_PARAM.list.page];

	const list = useQuery({
		...trpc.opportunities.list.queryOptions({ kind, view, page }),
		placeholderData: (previous) => previous,
		refetchInterval: (query) =>
			isReviewing(query.state.data?.review ?? null) ? REVIEW_POLL_MS : false,
	});

	const review = useMutation(
		trpc.opportunities.review.mutationOptions({
			onSuccess: async ({ queued }) => {
				await cache.opportunities();
				toast.success(
					queued
						? "The agent is searching. New results appear here."
						: "A review is already running.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const data = list.data;
	const reviewing = isReviewing(data?.review ?? null);
	const totalPages = data
		? Math.max(1, Math.ceil(data.total / data.pageSize))
		: 1;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-8">
			<div className="flex flex-wrap items-center gap-3">
				<Tabs
					value={kind}
					onValueChange={(next) => {
						if (isKind(next)) {
							void setParams({
								[SEARCH_PARAM.opportunities.kind]: next,
								[SEARCH_PARAM.opportunities.view]: "SUGGESTED",
								[SEARCH_PARAM.list.page]: 1,
							});
						}
					}}
				>
					<TabsList>
						{OPPORTUNITY_KINDS.map((option) => (
							<TabsTrigger key={option} value={option}>
								{KINDS[option].label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<Button
					size="sm"
					className="sm:ml-auto"
					disabled={reviewing || review.isPending}
					onClick={() => review.mutate({ kind })}
				>
					{reviewing || review.isPending ? <Spinner /> : null}
					{KINDS[kind].button}
				</Button>
			</div>

			<ReviewStatus review={data?.review ?? null} />

			<Tabs
				value={view}
				onValueChange={(next) => {
					if (isView(next)) {
						void setParams({
							[SEARCH_PARAM.opportunities.view]: next,
							[SEARCH_PARAM.list.page]: 1,
						});
					}
				}}
			>
				<TabsList>
					{OPPORTUNITY_VIEWS.map((option) => (
						<TabsTrigger key={option} value={option}>
							{VIEWS[option]}
							{data ? (
								<span className="text-muted-foreground tabular-nums">
									{data.counts[option]}
								</span>
							) : null}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{list.isPending ? (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			) : list.isError ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>This list did not load</EmptyTitle>
						<EmptyDescription>{list.error.message}</EmptyDescription>
					</EmptyHeader>
					<Button variant="outline" onClick={() => void list.refetch()}>
						Try again
					</Button>
				</Empty>
			) : list.data.items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Icon icon={Events} />
						</EmptyMedia>
						<EmptyTitle>{KINDS[kind].label}</EmptyTitle>
						<EmptyDescription>{EMPTY[view]}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<ul className="flex flex-col divide-y rounded-lg border">
					{list.data.items.map((opportunity) => (
						<OpportunityRow key={opportunity.id} opportunity={opportunity} />
					))}
				</ul>
			)}

			{data && data.total > 0 ? (
				<TablePagination
					page={page}
					totalPages={totalPages}
					pageSize={data.pageSize}
					total={data.total}
					loading={list.isFetching}
					onPageChange={(next) =>
						void setParams({ [SEARCH_PARAM.list.page]: next })
					}
				/>
			) : null}
		</div>
	);
}
