"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

const NOBODY = "__nobody__";

export function OwnerSelect({
	id,
	value,
	onValueChange,
	disabled,
	emptyLabel = "No owner yet",
}: {
	id?: string;
	value: string | null;
	onValueChange: (ownerId: string | null) => void;
	disabled?: boolean;
	emptyLabel?: string;
}) {
	const trpc = useTRPC();
	const users = useQuery(trpc.users.list.queryOptions());

	return (
		<Select
			value={value ?? NOBODY}
			onValueChange={(next) => onValueChange(next === NOBODY ? null : next)}
			disabled={disabled}
		>
			<SelectTrigger id={id} className="w-full" aria-label="Owner">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NOBODY}>{emptyLabel}</SelectItem>
				{(users.data ?? []).map((user) => (
					<SelectItem key={user.id} value={user.id}>
						{user.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
