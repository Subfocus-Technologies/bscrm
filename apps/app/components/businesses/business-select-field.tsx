"use client";

import { Field, FieldLabel } from "@crm/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useBusinessFocus } from "@/lib/business-focus";
import { useTRPC } from "@/lib/trpc/client";
import { type Business, useBusinesses } from "./use-businesses";

const NONE = "__none__";

export type BusinessChoice = {
	picked: string | null;
	setPicked: (value: string) => void;
	businessId: () => string | null;
	reset: () => void;
};

function resolveChoice(
	picked: string | null,
	focus: string | null,
	businesses: Business[],
): string {
	const known = new Set(businesses.map((business) => business.id));
	if (picked === NONE) return NONE;
	if (picked && known.has(picked)) return picked;
	return focus && known.has(focus) ? focus : NONE;
}

export function useBusinessChoice(): BusinessChoice {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [picked, setPicked] = useState<string | null>(null);

	return {
		picked,
		setPicked,
		businessId: () => {
			const focus = queryClient.getQueryData(trpc.businesses.focus.queryKey());
			const businesses =
				queryClient.getQueryData(trpc.businesses.list.queryKey()) ?? [];
			const value = resolveChoice(
				picked,
				focus?.businessId ?? null,
				businesses,
			);
			return value === NONE ? null : value;
		},
		reset: () => setPicked(null),
	};
}

export function BusinessSelectField({
	id,
	choice,
}: {
	id: string;
	choice: BusinessChoice;
}) {
	const focus = useBusinessFocus();
	const businesses = useBusinesses();
	const rows = businesses.data ?? [];
	const value = resolveChoice(choice.picked, focus, rows);

	return (
		<Field>
			<FieldLabel htmlFor={id}>Business</FieldLabel>
			<Select value={value} onValueChange={choice.setPicked}>
				<SelectTrigger id={id}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NONE}>No business</SelectItem>
					{rows.map((business) => (
						<SelectItem key={business.id} value={business.id}>
							{business.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</Field>
	);
}
