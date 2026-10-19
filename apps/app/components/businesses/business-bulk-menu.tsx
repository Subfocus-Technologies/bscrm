"use client";

import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@crm/ui/components/dropdown-menu";
import { formatCount } from "@crm/ui/lib/format";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { reportBulk } from "@/components/crm/bulk-actions";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { type Business, useBusinesses } from "./use-businesses";

type Kind = "company" | "contact" | "deal";

const ENTITY = {
	company: "COMPANY",
	contact: "CONTACT",
	deal: "DEAL",
} as const satisfies Record<Kind, string>;

function BusinessChoices({
	title,
	businesses,
	onSelect,
}: {
	title: string;
	businesses: Business[];
	onSelect: (businessId: string) => void;
}) {
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>{title}</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="max-h-72 overflow-y-auto">
				<DropdownMenuGroup>
					{businesses.length === 0 ? (
						<DropdownMenuLabel>No businesses yet.</DropdownMenuLabel>
					) : (
						businesses.map((business) => (
							<DropdownMenuItem
								key={business.id}
								onSelect={() => onSelect(business.id)}
							>
								{business.name}
							</DropdownMenuItem>
						))
					)}
				</DropdownMenuGroup>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

export function BulkBusinessMenu({
	kind,
	ids,
	onDone,
}: {
	kind: Kind;
	ids: string[];
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const businesses = useBusinesses();
	const rows = businesses.data ?? [];
	const entity = ENTITY[kind];
	const label = (count: number) => formatCount(count, kind);
	const onError = (error: { message: string }) => toast.error(error.message);

	const add = useMutation(
		trpc.businesses.addRecords.mutationOptions({
			onSuccess: async (result) => {
				await cache.businessRecords(kind);
				reportBulk(result, (count) => `${label(count)} added.`);
				onDone();
			},
			onError,
		}),
	);

	const remove = useMutation(
		trpc.businesses.removeRecords.mutationOptions({
			onSuccess: async (result) => {
				await cache.businessRecords(kind);
				reportBulk(result, (count) => `${label(count)} removed.`);
				onDone();
			},
			onError,
		}),
	);

	return (
		<>
			<BusinessChoices
				title={kind === "deal" ? "Move to business" : "Add to business"}
				businesses={rows}
				onSelect={(businessId) => add.mutate({ entity, ids, businessId })}
			/>
			<BusinessChoices
				title="Remove from business"
				businesses={rows}
				onSelect={(businessId) => remove.mutate({ entity, ids, businessId })}
			/>
		</>
	);
}
