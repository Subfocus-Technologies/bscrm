"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardPanel,
	CardPanelEmpty,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import Bot from "@crm/ui/components/icons/bot";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { formatCount } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BusinessSuggestionList } from "@/components/businesses/business-suggestions";
import { useBusinesses } from "@/components/businesses/use-businesses";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { FilingRules } from "./filing-rules";

function unfiledLabel(companies: number, contacts: number): string {
	if (companies + contacts === 0) return "Every record is in a business.";

	return `${formatCount(companies, "company", "companies")} and ${formatCount(contacts, "contact")} are in no business yet.`;
}

function SortUnfiledCard() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const businesses = useBusinesses();
	const unfiled = useQuery(trpc.businesses.unfiled.queryOptions());
	const counts = unfiled.data ?? { companies: 0, contacts: 0 };
	const total = counts.companies + counts.contacts;
	const hasBusinesses = (businesses.data ?? []).length > 0;

	const sort = useMutation(
		trpc.businesses.sortUnfiled.mutationOptions({
			onSuccess: async (result) => {
				await cache.businesses();
				toast.success(
					result.queued === 0
						? "Those records are already queued for sorting."
						: `The agent is sorting ${formatCount(result.queued, "record")}. Clear cases are filed; the rest wait for you below.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sort unfiled records</CardTitle>
				<CardDescription>
					{unfiled.isError
						? "The count did not load."
						: unfiledLabel(counts.companies, counts.contacts)}{" "}
					The agent reads each record's emails and meetings and matches them to
					your playbooks. New records are sorted automatically.
				</CardDescription>
				<CardAction>
					<Button
						onClick={() => sort.mutate()}
						disabled={sort.isPending || total === 0 || !hasBusinesses}
					>
						{sort.isPending ? (
							<Spinner />
						) : (
							<Icon icon={Bot} data-icon="inline-start" />
						)}
						Sort them now
					</Button>
				</CardAction>
			</CardHeader>
			<FilingLimit />
		</Card>
	);
}

function FilingLimit() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const limit = useQuery(trpc.businesses.filingLimit.queryOptions());
	const [draft, setDraft] = useState<string | null>(null);
	const saved = limit.data?.limit ?? 0;
	const value = draft ?? String(saved);
	const parsed = Number(value);
	const valid =
		value.trim() !== "" &&
		Number.isInteger(parsed) &&
		parsed >= 0 &&
		parsed <= (limit.data?.max ?? 0);

	const save = useMutation(
		trpc.businesses.setFilingLimit.mutationOptions({
			onSuccess: async (result) => {
				await cache.businesses({ settle: "record" });
				setDraft(null);
				toast.success(
					result.limit === 0
						? "AI sorting is off. Rules still file records."
						: `AI sorting is limited to ${formatCount(result.limit, "record")} a day.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (limit.isError) {
		return (
			<p className="text-muted-foreground text-xs">
				The daily limit did not load.
			</p>
		);
	}

	return (
		<form
			className="flex flex-wrap items-center gap-2 text-xs"
			onSubmit={(event) => {
				event.preventDefault();
				if (valid) save.mutate({ limit: parsed });
			}}
		>
			<span className="text-muted-foreground">
				AI sorting today: {limit.data?.usedToday ?? 0} of
			</span>
			<Input
				aria-label="AI sorts allowed per day"
				type="number"
				min={0}
				max={limit.data?.max}
				step={1}
				value={value}
				onChange={(event) => setDraft(event.target.value)}
				className="w-24"
			/>
			<span className="text-muted-foreground">
				a day. Set 0 to turn AI sorting off.
			</span>
			{draft !== null && draft !== String(saved) ? (
				<Button size="xs" type="submit" disabled={!valid || save.isPending}>
					{save.isPending ? <Spinner /> : null}
					Save
				</Button>
			) : null}
		</form>
	);
}

function WaitingCard() {
	const trpc = useTRPC();
	const suggestions = useQuery(trpc.businesses.suggestions.queryOptions({}));
	const rows = suggestions.data?.rows ?? [];
	const total = suggestions.data?.total ?? 0;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Waiting for you</CardTitle>
				<CardDescription>
					Suggestions the agent was not sure enough to file by itself.
					{total > rows.length ? ` Showing ${rows.length} of ${total}.` : ""}
				</CardDescription>
			</CardHeader>
			<CardPanel size="content" className="px-4">
				{suggestions.isError ? (
					<CardPanelEmpty>
						The suggestions did not load.{" "}
						<Button variant="link" onClick={() => void suggestions.refetch()}>
							Try again
						</Button>
					</CardPanelEmpty>
				) : rows.length === 0 ? (
					<CardPanelEmpty>
						Nothing waiting. The agent files clear cases by itself.
					</CardPanelEmpty>
				) : (
					<BusinessSuggestionList suggestions={rows} showRecord />
				)}
			</CardPanel>
		</Card>
	);
}

export function FilingSettings() {
	return (
		<>
			<SortUnfiledCard />
			<FilingRules />
			<WaitingCard />
		</>
	);
}
