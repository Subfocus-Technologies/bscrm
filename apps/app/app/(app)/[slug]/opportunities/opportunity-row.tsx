"use client";

import Launch from "@carbon/icons-react/es/Launch";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import type {
	OpportunityKind,
	OpportunityView,
} from "@crm/validation/opportunities";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { OwnerSelect } from "@/components/crm/owner-select";
import { LocalDay } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Opportunity = RouterOutputs["opportunities"]["list"]["items"][number];

const COPY = {
	EVENT: { plan: "We'll attend", date: "Takes place", deadline: "Book by" },
	AWARD: { plan: "We'll apply", date: "Ceremony", deadline: "Entries close" },
	SPEAKING: {
		plan: "We'll apply to speak",
		date: "Takes place",
		deadline: "Apply by",
	},
} satisfies Record<
	OpportunityKind,
	{ plan: string; date: string; deadline: string }
>;

function nextSteps(
	kind: OpportunityKind,
	status: OpportunityView,
): { status: OpportunityView; label: string; primary?: boolean }[] {
	if (status === "SUGGESTED") {
		return [
			{ status: "PLANNED", label: COPY[kind].plan, primary: true },
			{ status: "DISMISSED", label: "Not for us" },
		];
	}
	if (status === "PLANNED") {
		return [
			{ status: "DONE", label: "Mark done", primary: true },
			{ status: "DISMISSED", label: "Not for us" },
		];
	}
	return [{ status: "SUGGESTED", label: "Put back" }];
}

export function OpportunityRow({ opportunity }: { opportunity: Opportunity }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const copy = COPY[opportunity.kind];

	const update = useMutation(
		trpc.opportunities.update.mutationOptions({
			onSuccess: () => cache.opportunities(),
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<li className="flex flex-col gap-3 px-4 py-4 text-sm md:px-5">
			<div className="flex min-w-0 flex-col gap-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium">{opportunity.title}</span>
					{opportunity.business ? (
						<Badge variant="outline">{opportunity.business.name}</Badge>
					) : null}
				</div>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
					{opportunity.organiser ? <span>{opportunity.organiser}</span> : null}
					{opportunity.location ? <span>{opportunity.location}</span> : null}
					{opportunity.startsAt ? (
						<span>
							{copy.date} <LocalDay date={opportunity.startsAt} />
						</span>
					) : null}
					{opportunity.deadlineAt ? (
						<span>
							{copy.deadline} <LocalDay date={opportunity.deadlineAt} />
						</span>
					) : null}
				</div>
			</div>

			<p className="text-pretty text-muted-foreground text-xs/5">
				{opportunity.summary}
			</p>
			<blockquote className="border-l-2 pl-3 text-muted-foreground text-xs/5 italic">
				“{opportunity.quote}”
			</blockquote>

			<div className="flex flex-wrap items-center gap-2">
				<Button asChild size="sm" variant="outline">
					<a href={opportunity.url} target="_blank" rel="noreferrer">
						<Icon icon={Launch} data-icon="inline-start" />
						Open link
					</a>
				</Button>
				{nextSteps(opportunity.kind, opportunity.status).map((step) => (
					<Button
						key={step.status}
						size="sm"
						variant={step.primary ? "default" : "ghost"}
						disabled={update.isPending}
						onClick={() =>
							update.mutate({ id: opportunity.id, status: step.status })
						}
					>
						{step.label}
					</Button>
				))}
				<div className="w-full sm:ml-auto sm:w-52">
					<OwnerSelect
						value={opportunity.owner?.id ?? null}
						disabled={update.isPending}
						onValueChange={(ownerId) =>
							update.mutate({ id: opportunity.id, ownerId })
						}
					/>
				</div>
			</div>
		</li>
	);
}
