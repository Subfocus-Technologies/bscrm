"use client";

import Close from "@carbon/icons-react/es/Close";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardPanel,
	CardPanelEmpty,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { BusinessAvatar } from "@/components/businesses/business-avatar";
import {
	type Business,
	useBusinesses,
} from "@/components/businesses/use-businesses";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Rule = RouterOutputs["businesses"]["listRules"][number];
type RuleKind = Rule["kind"];

const KIND_LABEL = {
	EMAIL_DOMAIN: "Email domain",
	MAILBOX: "Mail sent to",
} satisfies Record<RuleKind, string>;

const KIND_PLACEHOLDER = {
	EMAIL_DOMAIN: "knightfrank.com",
	MAILBOX: "info@bricksmart.ai",
} satisfies Record<RuleKind, string>;

function describeRule(rule: Rule): string {
	return rule.kind === "EMAIL_DOMAIN"
		? `Anyone from ${rule.value}`
		: `Anyone who writes to ${rule.value}`;
}

function useRuleMutations() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const onError = (error: { message: string }) => toast.error(error.message);
	const onSuccess = () => cache.businesses({ settle: "record" });

	return {
		add: useMutation(
			trpc.businesses.addRule.mutationOptions({ onSuccess, onError }),
		),
		remove: useMutation(
			trpc.businesses.removeRule.mutationOptions({ onSuccess, onError }),
		),
	};
}

function AddRuleForm({ businesses }: { businesses: Business[] }) {
	const { add } = useRuleMutations();
	const [businessId, setBusinessId] = useState(businesses[0]?.id ?? "");
	const [kind, setKind] = useState<RuleKind>("EMAIL_DOMAIN");
	const [value, setValue] = useState("");
	const chosen = businesses.some((business) => business.id === businessId)
		? businessId
		: (businesses[0]?.id ?? "");

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!chosen || !value.trim()) return;
		add.mutate(
			{ businessId: chosen, kind, value },
			{ onSuccess: () => setValue("") },
		);
	};

	return (
		<form
			onSubmit={submit}
			className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center"
		>
			<Select value={kind} onValueChange={(next) => setKind(next as RuleKind)}>
				<SelectTrigger aria-label="Rule type" className="sm:w-40">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{(Object.keys(KIND_LABEL) as RuleKind[]).map((option) => (
						<SelectItem key={option} value={option}>
							{KIND_LABEL[option]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Input
				aria-label="Domain or address"
				value={value}
				onChange={(event) => setValue(event.target.value)}
				placeholder={KIND_PLACEHOLDER[kind]}
				className="sm:flex-1"
			/>
			<Select value={chosen} onValueChange={setBusinessId}>
				<SelectTrigger aria-label="Business" className="sm:w-44">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{businesses.map((business) => (
						<SelectItem key={business.id} value={business.id}>
							{business.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				type="submit"
				disabled={add.isPending || !value.trim() || !chosen}
			>
				{add.isPending ? <Spinner /> : null}
				Add rule
			</Button>
		</form>
	);
}

function RuleRow({
	rule,
	business,
}: {
	rule: Rule;
	business: Business | undefined;
}) {
	const { remove } = useRuleMutations();

	return (
		<li className="flex items-center gap-2.5 px-4 py-2 text-xs">
			{business ? <BusinessAvatar business={business} /> : null}
			<span className="min-w-0 flex-1 truncate">
				{describeRule(rule)} →{" "}
				<span className="font-medium">{business?.name}</span>
			</span>
			<Button
				variant="ghost"
				size="icon-xs"
				disabled={remove.isPending}
				onClick={() => remove.mutate({ id: rule.id })}
			>
				<Icon icon={Close} />
				<span className="sr-only">Remove rule {rule.value}</span>
			</Button>
		</li>
	);
}

export function FilingRules() {
	const trpc = useTRPC();
	const businesses = useBusinesses();
	const rules = useQuery(trpc.businesses.listRules.queryOptions());
	const rows = businesses.data ?? [];
	const byId = new Map(rows.map((business) => [business.id, business]));
	const list = rules.data ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Filing rules</CardTitle>
				<CardDescription>
					Rules file records instantly and cost nothing. They run before the
					agent, for new records and when you press Sort them now. A rule never
					overrides a removal a person made.
				</CardDescription>
			</CardHeader>
			<CardPanel size="content">
				{rules.isError ? (
					<CardPanelEmpty>
						The rules did not load.{" "}
						<Button variant="link" onClick={() => void rules.refetch()}>
							Try again
						</Button>
					</CardPanelEmpty>
				) : list.length === 0 ? (
					<CardPanelEmpty>No rules yet.</CardPanelEmpty>
				) : (
					<ul className="flex flex-col divide-y">
						{list.map((rule) => (
							<RuleRow
								key={rule.id}
								rule={rule}
								business={byId.get(rule.businessId)}
							/>
						))}
					</ul>
				)}
				{rows.length > 0 ? <AddRuleForm businesses={rows} /> : null}
			</CardPanel>
		</Card>
	);
}
