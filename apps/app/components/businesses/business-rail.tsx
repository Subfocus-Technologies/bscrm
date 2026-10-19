"use client";

import Add from "@carbon/icons-react/es/Add";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { SortableItem, SortableList } from "@crm/ui/components/sortable-list";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { cn } from "@crm/ui/lib/utils";
import { type ReactNode, useState } from "react";
import { useBusinessFocus, useSetBusinessFocus } from "@/lib/business-focus";
import { AllBusinessesAvatar, BusinessAvatar } from "./business-avatar";
import { AddBusinessDialog } from "./business-dialogs";
import { useBusinesses, useReorderBusinesses } from "./use-businesses";

const ACTIVE = "bg-muted text-foreground hover:bg-muted hover:text-foreground";

function useBusinessSwitcher() {
	const businesses = useBusinesses();
	const focus = useBusinessFocus();
	const setFocus = useSetBusinessFocus();
	const rows = businesses.data ?? [];
	const activeId = rows.some((row) => row.id === focus) ? focus : null;

	return {
		businesses,
		rows,
		activeId,
		select: (businessId: string | null) => {
			if (businessId === activeId) return;
			setFocus.mutate({ businessId });
		},
	};
}

function RailButton({
	label,
	variant = "ghost",
	pressed,
	onSelect,
	children,
}: {
	label: string;
	variant?: "ghost" | "avatar";
	pressed?: boolean;
	onSelect: () => void;
	children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant={variant}
					size="icon"
					aria-pressed={pressed}
					onClick={onSelect}
					className={cn(variant === "ghost" && "text-muted-foreground")}
				>
					{children}
					<span className="sr-only">{label}</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="right">{label}</TooltipContent>
		</Tooltip>
	);
}

export function BusinessRail() {
	const { businesses, rows, activeId, select } = useBusinessSwitcher();
	const reorder = useReorderBusinesses();
	const [adding, setAdding] = useState(false);

	return (
		<fieldset className="flex flex-col items-center gap-1">
			<legend className="sr-only">Businesses</legend>
			<RailButton
				label="All businesses"
				variant="avatar"
				pressed={activeId === null}
				onSelect={() => select(null)}
			>
				<AllBusinessesAvatar selected={activeId === null} />
			</RailButton>

			{businesses.isError ? (
				<RailButton
					label="Businesses did not load. Select to try again."
					onSelect={() => void businesses.refetch()}
				>
					<Icon icon={WarningAlt} />
				</RailButton>
			) : null}

			<SortableList
				ids={rows.map((row) => row.id)}
				onReorder={(ids) => reorder.mutate({ ids })}
			>
				<div className="flex flex-col items-center gap-1">
					{rows.map((business) => (
						<SortableItem
							key={business.id}
							id={business.id}
							label={business.name}
							grip="item"
						>
							<RailButton
								label={business.name}
								variant="avatar"
								pressed={activeId === business.id}
								onSelect={() => select(business.id)}
							>
								<BusinessAvatar
									business={business}
									selected={activeId === business.id}
								/>
							</RailButton>
						</SortableItem>
					))}
				</div>
			</SortableList>

			<RailButton label="Add a business" onSelect={() => setAdding(true)}>
				<Icon icon={Add} />
			</RailButton>

			<div className="my-1 h-px w-5 bg-border" />

			<AddBusinessDialog open={adding} onOpenChange={setAdding} />
		</fieldset>
	);
}

function MobileButton({
	active = false,
	onSelect,
	children,
}: {
	active?: boolean;
	onSelect: () => void;
	children: ReactNode;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			aria-pressed={active}
			onClick={onSelect}
			className={cn(
				"justify-start gap-3 text-muted-foreground",
				active && ACTIVE,
			)}
		>
			{children}
		</Button>
	);
}

export function BusinessMobileList({ onNavigate }: { onNavigate: () => void }) {
	const { businesses, rows, activeId, select } = useBusinessSwitcher();
	const [adding, setAdding] = useState(false);

	const choose = (businessId: string | null) => {
		select(businessId);
		onNavigate();
	};

	return (
		<fieldset className="flex flex-col gap-1">
			<legend className="sr-only">Businesses</legend>
			<MobileButton active={activeId === null} onSelect={() => choose(null)}>
				<AllBusinessesAvatar selected={activeId === null} />
				<span>All businesses</span>
			</MobileButton>

			{businesses.isError ? (
				<MobileButton onSelect={() => void businesses.refetch()}>
					<Icon icon={WarningAlt} />
					<span>Businesses did not load. Try again.</span>
				</MobileButton>
			) : null}

			{rows.map((business) => (
				<MobileButton
					key={business.id}
					active={activeId === business.id}
					onSelect={() => choose(business.id)}
				>
					<BusinessAvatar
						business={business}
						selected={activeId === business.id}
					/>
					<span className="truncate">{business.name}</span>
				</MobileButton>
			))}

			<MobileButton onSelect={() => setAdding(true)}>
				<Icon icon={Add} />
				<span>Add a business</span>
			</MobileButton>

			<AddBusinessDialog open={adding} onOpenChange={setAdding} />
		</fieldset>
	);
}
