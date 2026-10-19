"use client";

import { DEFAULT_REPORTING_CURRENCY } from "@crm/db/currency";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { useSetBusinessFocus } from "@/lib/business-focus";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { Business } from "./use-businesses";

type NameDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const PLAYBOOK_HINT =
	"Who buys from this business, what you sell them, and what a good lead looks like. The filing agent reads this to decide where new contacts and companies belong.";

const PLAYBOOK_PLACEHOLDER = [
	"Who buys: UK property investors building a portfolio.",
	"What we sell: sourced deals and data on buy-to-let opportunities.",
	"Good lead: asks about yields, areas or upcoming deals.",
].join("\n");

type BusinessFormValues = { name: string; playbook: string; target: string };

const TARGET_HINT =
	"What this business should win each month. The overview compares it with closed-won deals. Leave it empty for no target.";

function targetCents(value: string): number | null {
	const amount = Number(value.trim());
	return value.trim() && Number.isFinite(amount) && amount >= 0
		? Math.round(amount * 100)
		: null;
}

function targetText(business: Business): string {
	return business.target ? String(business.target.cents / 100) : "";
}

function BusinessForm({
	title,
	description,
	action,
	initial,
	details,
	pending,
	onSubmit,
	onCancel,
}: {
	title: string;
	description: string;
	action: string;
	initial: BusinessFormValues;
	details: { currency: string } | null;
	pending: boolean;
	onSubmit: (values: BusinessFormValues) => void;
	onCancel: () => void;
}) {
	const nameId = useId();
	const playbookId = useId();
	const targetId = useId();
	const [name, setName] = useState(initial.name);
	const [playbook, setPlaybook] = useState(initial.playbook);
	const [target, setTarget] = useState(initial.target);
	const ready = name.trim().length > 0 && !pending;

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (ready) onSubmit({ name, playbook, target });
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-4">
			<DialogHeader>
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>{description}</DialogDescription>
			</DialogHeader>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor={nameId}>Name</Label>
				<Input
					id={nameId}
					autoFocus
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="BS Investor"
				/>
			</div>

			{details ? (
				<>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={playbookId}>Playbook</Label>
						<Textarea
							id={playbookId}
							rows={6}
							value={playbook}
							onChange={(event) => setPlaybook(event.target.value)}
							placeholder={PLAYBOOK_PLACEHOLDER}
						/>
						<p className="text-muted-foreground text-xs">{PLAYBOOK_HINT}</p>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={targetId}>
							Monthly revenue target ({details.currency})
						</Label>
						<Input
							id={targetId}
							type="number"
							inputMode="decimal"
							min={0}
							step={1}
							value={target}
							onChange={(event) => setTarget(event.target.value)}
							placeholder="25000"
						/>
						<p className="text-muted-foreground text-xs">{TARGET_HINT}</p>
					</div>
				</>
			) : null}

			<DialogFooter>
				<Button type="button" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" disabled={!ready}>
					{pending ? <Spinner /> : null}
					{action}
				</Button>
			</DialogFooter>
		</form>
	);
}

export function AddBusinessDialog({ open, onOpenChange }: NameDialogProps) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const setFocus = useSetBusinessFocus();

	const create = useMutation(
		trpc.businesses.create.mutationOptions({
			onSuccess: async (business) => {
				await cache.businesses();
				setFocus.mutate({ businessId: business.id });
				toast.success(`${business.name} added.`);
				onOpenChange(false);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				{open ? (
					<BusinessForm
						title="Add a business"
						description="Everyone on the team sees it. You can file companies, contacts and deals into it, and add a playbook later."
						action="Add business"
						initial={{ name: "", playbook: "", target: "" }}
						details={null}
						pending={create.isPending}
						onSubmit={({ name }) => create.mutate({ name })}
						onCancel={() => onOpenChange(false)}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

export function EditBusinessDialog({
	business,
	open,
	onOpenChange,
}: NameDialogProps & { business: Business }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const currencies = useQuery(trpc.currency.settings.queryOptions());
	const update = useMutation(
		trpc.businesses.update.mutationOptions({
			onSuccess: async (saved) => {
				await cache.businesses();
				toast.success(`${saved.name} saved.`);
				onOpenChange(false);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				{open ? (
					<BusinessForm
						title={`Edit ${business.name}`}
						description="The name, playbook and target apply to the whole team."
						action="Save"
						initial={{
							name: business.name,
							playbook: business.playbook ?? "",
							target: targetText(business),
						}}
						details={{
							currency:
								currencies.data?.reportingCurrency ??
								DEFAULT_REPORTING_CURRENCY,
						}}
						pending={update.isPending}
						onSubmit={({ name, playbook, target }) =>
							update.mutate({
								id: business.id,
								name,
								playbook,
								monthlyTargetCents: targetCents(target),
							})
						}
						onCancel={() => onOpenChange(false)}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
