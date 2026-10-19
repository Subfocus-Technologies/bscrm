"use client";

import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { BusinessAvatar } from "./business-avatar";

export type BusinessSuggestion =
	RouterOutputs["businesses"]["suggestions"]["rows"][number];

function useDecideSuggestion(suggestion: BusinessSuggestion) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	return useMutation(
		trpc.businesses.decideSuggestion.mutationOptions({
			onSuccess: async (result) => {
				await cache.businessRecords(suggestion.record.kind);
				toast.success(
					result.status === "ACCEPTED"
						? `${suggestion.record.name} filed into ${suggestion.business.name}.`
						: "Suggestion dismissed. The agent will not offer it again.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
}

function SuggestionRow({
	suggestion,
	showRecord,
}: {
	suggestion: BusinessSuggestion;
	showRecord: boolean;
}) {
	const openRecord = useOpenRecord();
	const decide = useDecideSuggestion(suggestion);
	const quote = suggestion.evidence[0]?.quote;

	return (
		<li className="flex items-start gap-2.5 py-2">
			<BusinessAvatar business={suggestion.business} />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs">
				<span className="font-medium">
					{showRecord ? (
						<button
							type="button"
							onClick={() =>
								openRecord({
									kind: suggestion.record.kind,
									id: suggestion.record.id,
								})
							}
							className="underline-offset-2 hover:underline"
						>
							{suggestion.record.name}
						</button>
					) : null}
					{showRecord ? " → " : "Suggested: "}
					{suggestion.business.name}
				</span>
				<span className="text-muted-foreground">{suggestion.reason}</span>
				{quote ? (
					<span className="text-muted-foreground italic">“{quote}”</span>
				) : null}
			</div>
			<div className="flex shrink-0 items-center gap-1">
				{decide.isPending ? <Spinner /> : null}
				<Button
					size="xs"
					disabled={decide.isPending}
					onClick={() =>
						decide.mutate({ id: suggestion.id, decision: "accept" })
					}
				>
					File it
				</Button>
				<Button
					size="xs"
					variant="ghost"
					disabled={decide.isPending}
					onClick={() =>
						decide.mutate({ id: suggestion.id, decision: "dismiss" })
					}
				>
					Dismiss
				</Button>
			</div>
		</li>
	);
}

export function BusinessSuggestionList({
	suggestions,
	showRecord,
}: {
	suggestions: BusinessSuggestion[];
	showRecord: boolean;
}) {
	return (
		<ul className="flex flex-col divide-y">
			{suggestions.map((suggestion) => (
				<SuggestionRow
					key={suggestion.id}
					suggestion={suggestion}
					showRecord={showRecord}
				/>
			))}
		</ul>
	);
}
