"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { CardTableEmpty } from "@crm/ui/components/card-table";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { TableCell } from "@crm/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	type Business,
	useBusinesses,
} from "@/components/businesses/use-businesses";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const CELL = "px-3 py-2.5 align-middle";

const COLUMNS: SimpleTableColumn[] = [
	{ id: "domain", header: "Domain" },
	{ id: "scope", header: "Scope", width: "w-40" },
	{ id: "business", header: "Business", width: "w-44" },
	{ id: "pageViews", header: "Page views", width: "w-28", align: "right" },
	{ id: "lastSeen", header: "Last seen", width: "w-28", align: "right" },
	{ id: "actions", srLabel: "Actions", width: "w-24" },
];

const SCOPES = {
	SITE_AND_SUBDOMAINS: "Site + subdomains",
	EXACT_HOST: "Exact host",
} as const;

const NO_BUSINESS = "__none__";

export function AllowedDomains() {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const tracking = useQuery(trpc.tracking.settings.queryOptions());
	const businesses = useBusinesses();

	const remove = useMutation(
		trpc.tracking.removeDomain.mutationOptions({
			onSuccess: async () => {
				await cache.tracking();
				toast.success("Domain removed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!tracking.data) return null;

	const { domains, canManage } = tracking.data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Allowed domains</CardTitle>
				<CardDescription>
					The script records page views on these hosts only.
				</CardDescription>

				<CardAction>
					<AddDomain disabled={!canManage} />
				</CardAction>
			</CardHeader>

			{domains.length === 0 ? (
				<CardTableEmpty>
					Add the domain your website runs on to get your tracking script.
				</CardTableEmpty>
			) : (
				<SimpleTable columns={COLUMNS}>
					{domains.map((domain) => (
						<SimpleTableRow key={domain.id}>
							<TableCell className={CELL}>
								<span className="font-mono">{domain.host}</span>
							</TableCell>
							<TableCell className={`${CELL} text-muted-foreground`}>
								{SCOPES[domain.scope]}
							</TableCell>
							<TableCell className={CELL}>
								<DomainBusiness
									domainId={domain.id}
									businessId={domain.businessId}
									businesses={businesses.data ?? []}
									disabled={!canManage}
								/>
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{domain.pageViews.toLocaleString()}
							</TableCell>
							<TableCell className={`${CELL} text-right text-muted-foreground`}>
								{domain.lastSeenAt ? (
									<LocalRelativeTime date={domain.lastSeenAt} />
								) : (
									"—"
								)}
							</TableCell>
							<TableCell className={`${CELL} text-right`}>
								{canManage ? (
									<Button
										variant="ghost"
										size="sm"
										disabled={remove.isPending}
										onClick={() => remove.mutate({ id: domain.id })}
									>
										Remove
									</Button>
								) : null}
							</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
			)}
		</Card>
	);
}

function DomainBusiness({
	domainId,
	businessId,
	businesses,
	disabled,
}: {
	domainId: string;
	businessId: string | null;
	businesses: Business[];
	disabled: boolean;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const assign = useMutation(
		trpc.tracking.setDomainBusiness.mutationOptions({
			onSuccess: async () => {
				await cache.tracking();
				toast.success("Business updated.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<BusinessSelect
			value={businessId}
			businesses={businesses}
			disabled={disabled || assign.isPending}
			label="Business for this domain"
			onChange={(next) => assign.mutate({ id: domainId, businessId: next })}
		/>
	);
}

function BusinessSelect({
	id,
	value,
	businesses,
	disabled,
	label,
	onChange,
}: {
	id?: string;
	value: string | null;
	businesses: Business[];
	disabled: boolean;
	label?: string;
	onChange: (businessId: string | null) => void;
}) {
	return (
		<Select
			value={value ?? NO_BUSINESS}
			disabled={disabled}
			onValueChange={(next) => onChange(next === NO_BUSINESS ? null : next)}
		>
			<SelectTrigger id={id} size="sm" className="w-full" aria-label={label}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NO_BUSINESS}>No business</SelectItem>
				{businesses.map((business) => (
					<SelectItem key={business.id} value={business.id}>
						{business.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function AddDomain({ disabled }: { disabled: boolean }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const businesses = useBusinesses();

	const hostId = useId();
	const scopeId = useId();
	const businessId = useId();

	const [open, setOpen] = useState(false);
	const [host, setHost] = useState("");
	const [scope, setScope] = useState<keyof typeof SCOPES>(
		"SITE_AND_SUBDOMAINS",
	);
	const [business, setBusiness] = useState<string | null>(null);

	const add = useMutation(
		trpc.tracking.addDomain.mutationOptions({
			onSuccess: async () => {
				await cache.tracking();
				setOpen(false);
				setHost("");
				setBusiness(null);
				toast.success("Domain added.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button size="sm" disabled={disabled}>
					<Icon icon={Add} data-icon="inline-start" />
					Add domain
				</Button>
			</PopoverTrigger>

			<PopoverContent align="end" className="w-80">
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						add.mutate({ host: host.trim(), scope, businessId: business });
					}}
				>
					<Field>
						<FieldLabel htmlFor={hostId}>Domain</FieldLabel>
						<Input
							id={hostId}
							value={host}
							onChange={(event) => setHost(event.target.value)}
							placeholder="acme.com"
							autoComplete="off"
							autoCapitalize="off"
							autoCorrect="off"
							spellCheck={false}
						/>
					</Field>

					<Field>
						<FieldLabel htmlFor={scopeId}>Scope</FieldLabel>
						<Select
							value={scope}
							onValueChange={(next) => setScope(next as keyof typeof SCOPES)}
						>
							<SelectTrigger id={scopeId} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Object.entries(SCOPES).map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					<Field>
						<FieldLabel htmlFor={businessId}>Business</FieldLabel>
						<BusinessSelect
							id={businessId}
							value={business}
							businesses={businesses.data ?? []}
							disabled={false}
							onChange={setBusiness}
						/>
					</Field>

					<Button type="submit" disabled={add.isPending || host.trim() === ""}>
						{add.isPending ? <Spinner data-icon="inline-start" /> : null}
						Add domain
					</Button>
				</form>
			</PopoverContent>
		</Popover>
	);
}
