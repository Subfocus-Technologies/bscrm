"use client";

import Add from "@carbon/icons-react/es/Add";
import OverflowMenuVertical from "@carbon/icons-react/es/OverflowMenuVertical";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { SortableItem, SortableList } from "@crm/ui/components/sortable-list";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BusinessAvatar } from "@/components/businesses/business-avatar";
import {
	AddBusinessDialog,
	EditBusinessDialog,
} from "@/components/businesses/business-dialogs";
import {
	type Business,
	useBusinesses,
	useReorderBusinesses,
} from "@/components/businesses/use-businesses";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

function RemoveBusinessDialog({
	business,
	open,
	onOpenChange,
}: {
	business: Business;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const remove = useMutation(
		trpc.businesses.delete.mutationOptions({
			onSuccess: async () => {
				await cache.businesses();
				toast.success(`${business.name} removed.`);
				onOpenChange(false);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remove {business.name}?</AlertDialogTitle>
					<AlertDialogDescription>
						Its companies, contacts and deals stay in the CRM. They are no
						longer filed under {business.name}. This applies to the whole team.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={remove.isPending}
						onClick={(event) => {
							event.preventDefault();
							remove.mutate({ id: business.id });
						}}
					>
						Remove
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function BusinessRow({ business }: { business: Business }) {
	const [editing, setEditing] = useState(false);
	const [removing, setRemoving] = useState(false);

	return (
		<SortableItem id={business.id} label={business.name} className="px-4 py-2">
			<BusinessAvatar business={business} />
			<button
				type="button"
				onClick={() => setEditing(true)}
				className="flex min-w-0 flex-1 flex-col gap-px text-left"
			>
				<span className="w-full truncate font-medium text-xs">
					{business.name}
				</span>
				<span className="w-full truncate text-muted-foreground text-xs">
					{business.playbook ??
						"No playbook yet. The filing agent goes by the name alone."}
				</span>
			</button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon-xs">
						<Icon icon={OverflowMenuVertical} />
						<span className="sr-only">More for {business.name}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={() => setEditing(true)}>
						Edit name, playbook and target
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => setRemoving(true)}
					>
						Remove
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<EditBusinessDialog
				business={business}
				open={editing}
				onOpenChange={setEditing}
			/>
			<RemoveBusinessDialog
				business={business}
				open={removing}
				onOpenChange={setRemoving}
			/>
		</SortableItem>
	);
}

function BusinessRows() {
	const businesses = useBusinesses();
	const reorder = useReorderBusinesses();
	const rows = businesses.data ?? [];

	if (businesses.isError) {
		return (
			<CardPanelEmpty>
				The businesses did not load.{" "}
				<Button variant="link" onClick={() => void businesses.refetch()}>
					Try again
				</Button>
			</CardPanelEmpty>
		);
	}

	if (rows.length === 0) {
		return (
			<CardPanelEmpty>
				No businesses yet. Add one to start filing records into it.
			</CardPanelEmpty>
		);
	}

	return (
		<SortableList
			ids={rows.map((row) => row.id)}
			onReorder={(ids) => reorder.mutate({ ids })}
		>
			<div className="flex flex-col divide-y">
				{rows.map((business) => (
					<BusinessRow key={business.id} business={business} />
				))}
			</div>
		</SortableList>
	);
}

export function BusinessSettings() {
	const [adding, setAdding] = useState(false);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Businesses</CardTitle>
				<CardDescription>
					Everyone shares the same businesses. The order is yours alone: drag to
					change it here or in the left bar.
				</CardDescription>
				<CardAction>
					<Button onClick={() => setAdding(true)}>
						<Icon icon={Add} data-icon="inline-start" />
						Add business
					</Button>
				</CardAction>
			</CardHeader>
			<CardPanel size="content">
				<BusinessRows />
			</CardPanel>
			<AddBusinessDialog open={adding} onOpenChange={setAdding} />
		</Card>
	);
}
