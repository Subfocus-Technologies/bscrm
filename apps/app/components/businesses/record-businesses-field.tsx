"use client";

import Filter from "@carbon/icons-react/es/Filter";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import Bot from "@crm/ui/components/icons/bot";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { toast } from "sonner";
import { InlineSelectField } from "@/components/crm/inline-field";
import { PROPERTY_LABEL, PROPERTY_ROW } from "@/components/detail-sheet";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { BusinessSuggestionList } from "./business-suggestions";
import { useBusinesses } from "./use-businesses";

type Kind = "company" | "contact" | "deal";

const ENTITY = {
	company: "COMPANY",
	contact: "CONTACT",
	deal: "DEAL",
} as const satisfies Record<Kind, string>;

const NONE = "__none__";

function useMembership(kind: Kind, recordId: string) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const entity = ENTITY[kind];
	const held = useQuery(
		trpc.businesses.forRecord.queryOptions({ entity, id: recordId }),
	);
	const onSuccess = () => cache.businessRecords(kind, { settle: "record" });
	const onError = (error: { message: string }) => toast.error(error.message);
	const add = useMutation(
		trpc.businesses.addRecords.mutationOptions({ onSuccess, onError }),
	);
	const remove = useMutation(
		trpc.businesses.removeRecords.mutationOptions({ onSuccess, onError }),
	);

	return {
		held: held.data ?? [],
		loading: held.isPending,
		failed: held.isError,
		saving: add.isPending || remove.isPending,
		add: (businessId: string) =>
			add.mutate({ entity, ids: [recordId], businessId }),
		remove: (businessId: string) =>
			remove.mutate({ entity, ids: [recordId], businessId }),
	};
}

function DealBusinessField({ dealId }: { dealId: string }) {
	const businesses = useBusinesses();
	const membership = useMembership("deal", dealId);
	const current = membership.held[0]?.id ?? NONE;

	return (
		<InlineSelectField
			label="Business"
			value={current}
			saving={membership.saving || membership.loading}
			options={[
				{ value: NONE, label: "No business" },
				...(businesses.data ?? []).map((business) => ({
					value: business.id,
					label: business.name,
				})),
			]}
			onSave={(next) => {
				if (next === current) return;
				if (next === NONE) membership.remove(current);
				else membership.add(next);
			}}
		/>
	);
}

type HeldBusiness = RouterOutputs["businesses"]["forRecord"][number];

function HeldBusinesses({ held }: { held: HeldBusiness[] }) {
	if (held.length === 0) return <EmptyCellValue />;

	return (
		<span className="flex min-w-0 flex-wrap gap-1">
			{held.map((business) => (
				<Badge
					key={business.id}
					variant="token"
					title={business.reason ?? undefined}
				>
					{business.source === "AGENT" ? <Icon icon={Bot} /> : null}
					{business.source === "RULE" ? <Icon icon={Filter} /> : null}
					{business.name}
				</Badge>
			))}
		</span>
	);
}

function RecordSuggestions({
	kind,
	recordId,
}: {
	kind: Exclude<Kind, "deal">;
	recordId: string;
}) {
	const trpc = useTRPC();
	const suggestions = useQuery(
		trpc.businesses.suggestions.queryOptions({
			entity: ENTITY[kind],
			recordId,
		}),
	);
	const rows = suggestions.data?.rows ?? [];

	if (rows.length === 0) return null;

	return (
		<div className={cn(PROPERTY_ROW, "items-start")}>
			<span className={PROPERTY_LABEL}>Agent suggests</span>
			<BusinessSuggestionList suggestions={rows} showRecord={false} />
		</div>
	);
}

function ManyBusinessesField({
	kind,
	recordId,
}: {
	kind: Exclude<Kind, "deal">;
	recordId: string;
}) {
	const id = useId();
	const businesses = useBusinesses();
	const membership = useMembership(kind, recordId);
	const heldIds = new Set(membership.held.map((business) => business.id));

	const rows = businesses.data ?? [];

	return (
		<div className={cn(PROPERTY_ROW, "items-center")}>
			<span id={id} className={PROPERTY_LABEL}>
				Businesses
			</span>
			<div className="flex min-w-0 items-center gap-1.5">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							aria-labelledby={id}
							disabled={membership.loading || membership.failed}
							className="h-auto min-h-8 w-full justify-start px-2 py-1 font-normal"
						>
							{membership.failed ? (
								<span className="text-muted-foreground">
									Businesses did not load.
								</span>
							) : (
								<HeldBusinesses held={membership.held} />
							)}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{rows.length === 0 ? (
							<DropdownMenuLabel>
								No businesses yet. Add one with + in the left bar.
							</DropdownMenuLabel>
						) : (
							rows.map((business) => (
								<DropdownMenuCheckboxItem
									key={business.id}
									checked={heldIds.has(business.id)}
									onSelect={(event) => event.preventDefault()}
									onCheckedChange={(checked) =>
										checked
											? membership.add(business.id)
											: membership.remove(business.id)
									}
								>
									{business.name}
								</DropdownMenuCheckboxItem>
							))
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				{membership.saving ? <Spinner /> : null}
			</div>
		</div>
	);
}

export function RecordBusinessesField({
	kind,
	recordId,
}: {
	kind: Kind;
	recordId: string;
}) {
	if (kind === "deal") return <DealBusinessField dealId={recordId} />;

	return (
		<>
			<ManyBusinessesField kind={kind} recordId={recordId} />
			<RecordSuggestions kind={kind} recordId={recordId} />
		</>
	);
}
