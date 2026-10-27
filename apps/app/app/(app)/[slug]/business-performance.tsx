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
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { TableCell } from "@crm/ui/components/table";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { formatCount, formatMoneyCompact } from "@crm/ui/lib/format";
import { REPORT_PERIODS, type ReportPeriod } from "@crm/validation/dashboard";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryState } from "nuqs";
import type { ReactNode } from "react";
import {
	AllBusinessesAvatar,
	BusinessAvatar,
} from "@/components/businesses/business-avatar";
import { useBusinessFocus } from "@/lib/business-focus";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { overviewParsers } from "./overview-search-params";

type Performance = RouterOutputs["dashboard"]["businessPerformance"];

type Figures = NonNullable<Performance["total"]>;

const CELL = "px-3 py-2.5 align-middle";

const COLUMNS: SimpleTableColumn[] = [
	{ id: "business", header: "Business" },
	{ id: "visitors", header: "Visitors", width: "w-24", align: "right" },
	{
		id: "views",
		header: "Page views",
		width: "w-28",
		align: "right",
		className: "hidden sm:table-cell",
	},
	{ id: "sold", header: "Sold", width: "w-20", align: "right" },
	{
		id: "value",
		header: "Value",
		width: "w-24",
		align: "right",
		className: "hidden sm:table-cell",
	},
];

const PERIOD_LABELS = {
	"7d": "7 days",
	"30d": "30 days",
	"90d": "90 days",
} satisfies Record<ReportPeriod, string>;

const count = (value: number) => value.toLocaleString("en-GB");

function isPeriod(value: string): value is ReportPeriod {
	return (REPORT_PERIODS as readonly string[]).includes(value);
}

export function BusinessPerformance() {
	const trpc = useTRPC();
	const business = useBusinessFocus();
	const [period, setPeriod] = useQueryState(
		SEARCH_PARAM.overview.period,
		overviewParsers[SEARCH_PARAM.overview.period],
	);

	const performance = useQuery({
		...trpc.dashboard.businessPerformance.queryOptions({ period, business }),
		placeholderData: (previous) => previous,
	});

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Website traffic and sales</CardTitle>
				<CardDescription>
					Visitors to each business's websites and the subscriptions it sold,
					across the whole team
				</CardDescription>
				<CardAction>
					<ToggleGroup
						type="single"
						variant="outline"
						size="sm"
						spacing={0}
						value={period}
						onValueChange={(next) => {
							if (isPeriod(next)) void setPeriod(next);
						}}
						aria-label="Period to show"
					>
						{REPORT_PERIODS.map((value) => (
							<ToggleGroupItem key={value} value={value}>
								{PERIOD_LABELS[value]}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</CardAction>
			</CardHeader>
			<CardPanel size="content">
				{performance.isPending ? (
					<CardPanelEmpty>
						<Spinner />
					</CardPanelEmpty>
				) : performance.isError ? (
					<CardPanelEmpty>
						{performance.error.data?.code === "FORBIDDEN" ? (
							"You do not have access to these figures."
						) : (
							<>
								The figures did not load.{" "}
								<Button
									variant="link"
									onClick={() => void performance.refetch()}
								>
									Try again
								</Button>
							</>
						)}
					</CardPanelEmpty>
				) : (
					<PerformanceTable performance={performance.data} />
				)}
			</CardPanel>
			{performance.data ? <Footnotes performance={performance.data} /> : null}
		</Card>
	);
}

function PerformanceTable({ performance }: { performance: Performance }) {
	const workspaceUrl = useWorkspaceUrl();
	const money = (cents: number) =>
		formatMoneyCompact(cents, performance.reportingCurrency);

	if (performance.rows.length === 0) {
		return (
			<CardPanelEmpty>
				<span>
					There are no businesses yet.{" "}
					<Link
						href={workspaceUrl("/settings/businesses")}
						className="underline hover:no-underline"
					>
						Add one
					</Link>{" "}
					to see its traffic and sales.
				</span>
			</CardPanelEmpty>
		);
	}

	return (
		<SimpleTable variant="panel" surface="page" columns={COLUMNS}>
			{performance.rows.map((row) => (
				<FiguresRow
					key={row.businessId ?? "none"}
					figures={row}
					money={money}
					muted={row.businessId === null}
					label={
						row.name === null ? (
							"No business"
						) : (
							<>
								<BusinessAvatar
									business={{ name: row.name, tone: row.tone ?? 0 }}
								/>
								<span className="truncate">{row.name}</span>
							</>
						)
					}
				/>
			))}
			{performance.total ? (
				<FiguresRow
					figures={performance.total}
					money={money}
					strong
					label={
						<>
							<AllBusinessesAvatar />
							<span className="truncate">All businesses</span>
						</>
					}
				/>
			) : null}
		</SimpleTable>
	);
}

function FiguresRow({
	figures,
	label,
	money,
	muted = false,
	strong = false,
}: {
	figures: Figures;
	label: ReactNode;
	money: (cents: number) => string;
	muted?: boolean;
	strong?: boolean;
}) {
	const tone = muted ? "text-muted-foreground" : "";
	const weight = strong ? "font-medium" : "";

	return (
		<SimpleTableRow className={`${tone} ${weight}`}>
			<TableCell className={CELL}>
				<span className="flex min-w-0 items-center gap-2">{label}</span>
			</TableCell>
			<TableCell className={`${CELL} text-right tabular-nums`}>
				{count(figures.visitors)}
			</TableCell>
			<TableCell
				className={`${CELL} hidden text-right tabular-nums sm:table-cell`}
			>
				{count(figures.views)}
			</TableCell>
			<TableCell className={`${CELL} text-right tabular-nums`}>
				{count(figures.sold)}
			</TableCell>
			<TableCell
				className={`${CELL} hidden text-right tabular-nums sm:table-cell`}
			>
				{money(figures.valueCents)}
			</TableCell>
		</SimpleTableRow>
	);
}

function Footnotes({ performance }: { performance: Performance }) {
	const workspaceUrl = useWorkspaceUrl();
	const { websites } = performance;
	const tracking = (
		<Link
			href={workspaceUrl("/settings/tracking")}
			className="underline hover:no-underline"
		>
			Tracking settings
		</Link>
	);

	return (
		<div className="flex flex-col gap-1 text-muted-foreground text-xs">
			{websites.total === 0 ? (
				<p>
					Website traffic is not set up yet. Add your websites in {tracking}.
				</p>
			) : websites.unlinked > 0 ? (
				<p>
					{formatCount(websites.unlinked, "website")}{" "}
					{websites.unlinked === 1 ? "is" : "are"} not linked to a business, so
					{websites.unlinked === 1 ? " its" : " their"} visitors count under No
					business. Link {websites.unlinked === 1 ? "it" : "them"} in {tracking}
					.
				</p>
			) : null}
			<p>
				Sold counts deals marked closed won in the period. Value is in{" "}
				{performance.reportingCurrency}.
			</p>
		</div>
	);
}
