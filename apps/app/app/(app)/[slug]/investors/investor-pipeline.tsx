"use client";

import Launch from "@carbon/icons-react/es/Launch";
import LogoLinkedin from "@carbon/icons-react/es/LogoLinkedin";
import Money from "@carbon/icons-react/es/Money";
import Search from "@carbon/icons-react/es/Search";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { Markdown } from "@crm/ui/components/markdown";
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
import { Spinner } from "@crm/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { TablePagination } from "@crm/ui/components/table-pagination";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { useSearchInput } from "@crm/ui/hooks/use-search-input";
import { formatMoneyCompact } from "@crm/ui/lib/format";
import {
	INVESTOR_SORTS,
	INVESTOR_STAGES,
	type InvestorKind,
	type InvestorStage,
} from "@crm/validation/investors";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import {
	type InvestorSection,
	investorsParsers,
	listInputOf,
} from "./investors-search-params";

type Investor = RouterOutputs["investors"]["list"]["items"][number];

const RESEARCH_POLL_MS = 15_000;

const STAGE_LABEL = {
	TO_APPROVE: "To approve",
	APPROVED: "Approved",
	CONTACTED: "Contacted",
	REPLIED: "Replied",
	MEETING: "Meeting",
	COMMITTED: "Committed",
	PASSED: "Passed",
	REJECTED: "Not a fit",
} satisfies Record<InvestorStage, string>;

const KIND_LABEL = {
	ANGEL: "Angel",
	ANGEL_GROUP: "Angel group",
	VC: "VC",
	FAMILY_OFFICE: "Family office",
	CORPORATE_VC: "Corporate VC",
	ACCELERATOR: "Accelerator",
	OTHER: "Other",
} satisfies Record<InvestorKind, string>;

const SORT_LABEL = {
	fit: "Best fit first",
	name: "Name",
	newest: "Newest first",
} satisfies Record<(typeof INVESTOR_SORTS)[number], string>;

function isStage(value: string): value is InvestorStage {
	return (INVESTOR_STAGES as readonly string[]).includes(value);
}

function isSort(value: string): value is (typeof INVESTOR_SORTS)[number] {
	return (INVESTOR_SORTS as readonly string[]).includes(value);
}

function useStageMove() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	return useMutation(
		trpc.investors.setStage.mutationOptions({
			onSuccess: async (result, input) => {
				await cache.investors();
				toast.success(
					`${result.updated} moved to ${STAGE_LABEL[input.stage].toLowerCase()}.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
}

function useResearch() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	return useMutation(
		trpc.investors.research.mutationOptions({
			onSuccess: async (result) => {
				await cache.investors();
				toast.success(
					result.queued > 0
						? `The agent will research ${result.queued} investor${result.queued === 1 ? "" : "s"}.`
						: "The agent is already researching these.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
}

function FitCell({ investor }: { investor: Investor }) {
	if (investor.fitScore === null) {
		return (
			<span className="flex items-center gap-1.5 text-muted-foreground">
				{investor.researching ? (
					<>
						<Spinner /> Researching
					</>
				) : (
					"Not scored"
				)}
			</span>
		);
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button size="xs" variant="outline" className="tabular-nums">
					{investor.fitScore}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-96 text-xs">
				<div className="flex flex-col gap-2">
					<span className="font-medium">Fit {investor.fitScore} of 100</span>
					{investor.fit?.summary ? (
						<p className="text-muted-foreground">{investor.fit.summary}</p>
					) : null}
					<ul className="flex flex-col gap-1.5">
						{investor.fit?.reasons.map((reason) => (
							<li key={reason.criterionId} className="flex gap-2">
								<span
									className={
										reason.met ? "text-primary" : "text-muted-foreground"
									}
								>
									{reason.met ? "✓" : "✗"}
								</span>
								<span className="flex-1">
									{reason.note}
									{reason.quote ? (
										<span className="text-muted-foreground italic">
											{" "}
											“{reason.quote}”
										</span>
									) : null}
									{reason.sourceUrl ? (
										<>
											{" "}
											<a
												href={reason.sourceUrl}
												target="_blank"
												rel="noreferrer"
												className="text-muted-foreground underline"
											>
												source
											</a>
										</>
									) : null}
								</span>
							</li>
						))}
					</ul>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function NameCell({ investor }: { investor: Investor }) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<span className="flex items-center gap-1.5">
				<span className="truncate font-medium">{investor.name}</span>
				{investor.website ? (
					<a
						href={
							investor.website.startsWith("http")
								? investor.website
								: `https://${investor.website}`
						}
						target="_blank"
						rel="noreferrer"
						aria-label={`${investor.name} website`}
						className="text-muted-foreground"
					>
						<Icon icon={Launch} />
					</a>
				) : null}
				{investor.linkedinUrl ? (
					<a
						href={investor.linkedinUrl}
						target="_blank"
						rel="noreferrer"
						aria-label={`${investor.name} on LinkedIn`}
						className="text-muted-foreground"
					>
						<Icon icon={LogoLinkedin} />
					</a>
				) : null}
			</span>
			<span className="truncate text-muted-foreground">
				{[investor.firm, investor.email].filter(Boolean).join(" · ")}
			</span>
		</div>
	);
}

function cheque(investor: Investor): string | null {
	const { chequeMinCents: min, chequeMaxCents: max } = investor;
	const money = (cents: number) =>
		formatMoneyCompact(cents, investor.chequeCurrency);
	if (min !== null && max !== null) return `${money(min)}–${money(max)}`;
	if (max !== null) return `up to ${money(max)}`;
	if (min !== null) return `from ${money(min)}`;
	return null;
}

function AddEmail({ investor }: { investor: Investor }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [open, setOpen] = useState(false);
	const [address, setAddress] = useState("");
	const save = useMutation(
		trpc.investors.setAddress.mutationOptions({
			onSuccess: async (result) => {
				await cache.investors();
				setOpen(false);
				toast.success(
					result.queued > 0
						? "Saved. The agent is drafting the first email."
						: "Email address saved.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button size="xs" variant="outline">
					Add email
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72">
				<form
					className="flex flex-col gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (address.trim()) {
							save.mutate({ investorId: investor.id, email: address.trim() });
						}
					}}
				>
					<Input
						type="email"
						autoFocus
						value={address}
						onChange={(event) => setAddress(event.target.value)}
						placeholder="name@fund.com"
						aria-label={`${investor.name}'s email address`}
					/>
					<Button
						type="submit"
						size="sm"
						disabled={!address.trim() || save.isPending}
					>
						{save.isPending ? <Spinner /> : null}
						Save
					</Button>
				</form>
			</PopoverContent>
		</Popover>
	);
}

function RowActions({ investor }: { investor: Investor }) {
	const move = useStageMove();

	if (investor.stage === "TO_APPROVE") {
		return (
			<div className="flex justify-end gap-1">
				<Button
					size="xs"
					disabled={move.isPending}
					onClick={() => move.mutate({ ids: [investor.id], stage: "APPROVED" })}
				>
					Approve
				</Button>
				<Button
					size="xs"
					variant="ghost"
					disabled={move.isPending}
					onClick={() => move.mutate({ ids: [investor.id], stage: "REJECTED" })}
				>
					Not a fit
				</Button>
			</div>
		);
	}

	return (
		<div className="flex items-center justify-end gap-1.5">
			{investor.email ? null : <AddEmail investor={investor} />}
			<Select
				value={investor.stage}
				onValueChange={(next) => {
					if (isStage(next)) move.mutate({ ids: [investor.id], stage: next });
				}}
			>
				<SelectTrigger size="sm" aria-label="Move to stage">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{INVESTOR_STAGES.map((stage) => (
						<SelectItem key={stage} value={stage}>
							{STAGE_LABEL[stage]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function SearchSummary({ outcome }: { outcome: string }) {
	const [open, setOpen] = useState(false);

	return (
		<div className="flex flex-col items-start gap-1">
			{open ? (
				<Markdown className="text-muted-foreground">{outcome}</Markdown>
			) : (
				<span className="line-clamp-1 text-muted-foreground">
					{outcome.replace(/[#*|`_-]+/g, " ").replace(/\s+/g, " ")}
				</span>
			)}
			<Button variant="link" size="xs" onClick={() => setOpen(!open)}>
				{open ? "Hide the agent's summary" : "Read the agent's summary"}
			</Button>
		</div>
	);
}

type AgentSearch = NonNullable<RouterOutputs["investors"]["list"]["search"]>;

function SearchStatus({
	search,
	waiting,
}: {
	search: AgentSearch | null;
	waiting: number;
}) {
	const research =
		waiting > 0
			? ` ${waiting} investor${waiting === 1 ? "" : "s"} waiting to be researched.`
			: "";

	if (!search) {
		return (
			<p className="text-muted-foreground text-xs">
				The agent has not searched for investors yet.{research}
			</p>
		);
	}

	const when =
		search.state === "finished" || search.state === "failed"
			? search.finishedAt
			: search.state === "running"
				? search.startedAt
				: search.queuedAt;
	const label = {
		waiting: "Agent search waiting to start",
		running: "Agent search running, started",
		finished: "Last agent search finished",
		failed: "Last agent search failed",
	}[search.state];

	return (
		<div className="flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-xs">
			<span className="flex flex-wrap items-center gap-1.5">
				{search.state === "running" || search.state === "waiting" ? (
					<Spinner />
				) : null}
				<span className="font-medium">{label}</span>
				{when ? (
					<span className="text-muted-foreground">
						<LocalRelativeTime date={when} />
					</span>
				) : null}
				{search.attempts > 1 ? (
					<span className="text-muted-foreground">
						after {search.attempts} tries
					</span>
				) : null}
			</span>
			{search.outcome ? <SearchSummary outcome={search.outcome} /> : null}
			{research ? (
				<span className="text-muted-foreground">{research.trim()}</span>
			) : null}
		</div>
	);
}

function FindMore() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const find = useMutation(
		trpc.investors.findMore.mutationOptions({
			onSuccess: async (result) => {
				await cache.investors();
				toast.success(
					result.queued > 0
						? "The agent is looking for new investors. They land in To approve."
						: "The agent is already looking for new investors.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Button disabled={find.isPending} onClick={() => find.mutate()}>
			{find.isPending ? (
				<Spinner />
			) : (
				<Icon icon={Search} data-icon="inline-start" />
			)}
			Find more investors
		</Button>
	);
}

export function InvestorPipeline({
	onNavigate,
}: {
	onNavigate: (section: InvestorSection) => void;
}) {
	const trpc = useTRPC();
	const [params, setParams] = useQueryStates(investorsParsers);
	const stage = params[SEARCH_PARAM.investors.stage];
	const page = params[SEARCH_PARAM.list.page];
	const [text, setText] = useSearchInput(
		params[SEARCH_PARAM.list.q],
		(q) =>
			void setParams({ [SEARCH_PARAM.list.q]: q, [SEARCH_PARAM.list.page]: 1 }),
	);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const fundraise = useQuery(trpc.investors.fundraise.queryOptions());
	const list = useQuery({
		...trpc.investors.list.queryOptions(listInputOf(params)),
		placeholderData: (previous) => previous,
		refetchInterval: (query) =>
			query.state.data?.items.some((item) => item.researching) ||
			query.state.data?.search?.state === "running" ||
			query.state.data?.search?.state === "waiting"
				? RESEARCH_POLL_MS
				: false,
	});
	const move = useStageMove();
	const research = useResearch();

	if (fundraise.data === null) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Icon icon={Money} />
					</EmptyMedia>
					<EmptyTitle>Set up the raise first</EmptyTitle>
					<EmptyDescription>
						Tell the agent what you are raising and who you want to meet. It
						uses that to find and score investors.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button onClick={() => onNavigate("profile")}>
						Fill in the fundraise profile
					</Button>
				</EmptyContent>
			</Empty>
		);
	}

	const data = list.data;
	const items = data?.items ?? [];
	const ids = [...selected].filter((id) =>
		items.some((item) => item.id === id),
	);
	const allSelected = items.length > 0 && ids.length === items.length;
	const clear = () => setSelected(new Set());

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Tabs
					value={stage}
					onValueChange={(next) => {
						if (!isStage(next)) return;
						clear();
						void setParams({
							[SEARCH_PARAM.investors.stage]: next,
							[SEARCH_PARAM.list.page]: 1,
						});
					}}
				>
					<TabsList variant="line" className="flex-wrap">
						{INVESTOR_STAGES.map((option) => (
							<TabsTrigger key={option} value={option}>
								{STAGE_LABEL[option]}
								<span className="text-muted-foreground tabular-nums">
									{data?.counts[option] ?? 0}
								</span>
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<FindMore />
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<InputGroup className="w-full sm:w-72">
					<InputGroupAddon>
						<Icon icon={Search} />
					</InputGroupAddon>
					<InputGroupInput
						value={text}
						onChange={(event) => setText(event.target.value)}
						placeholder="Search by name, firm or place…"
					/>
				</InputGroup>
				<Select
					value={params[SEARCH_PARAM.list.sort]}
					onValueChange={(next) => {
						if (isSort(next))
							void setParams({ [SEARCH_PARAM.list.sort]: next });
					}}
				>
					<SelectTrigger size="sm" aria-label="Sort">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{INVESTOR_SORTS.map((sort) => (
							<SelectItem key={sort} value={sort}>
								{SORT_LABEL[sort]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{data ? (
					<span className="text-muted-foreground text-xs">
						Research today: {data.research.usedToday} of{" "}
						{data.research.dailyLimit}
					</span>
				) : null}
				{ids.length > 0 ? (
					<div className="ml-auto flex flex-wrap items-center gap-1.5">
						<span className="text-muted-foreground text-xs">
							{ids.length} selected
						</span>
						<Button
							size="sm"
							disabled={move.isPending}
							onClick={() =>
								move.mutate({ ids, stage: "APPROVED" }, { onSuccess: clear })
							}
						>
							Approve
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={move.isPending}
							onClick={() =>
								move.mutate({ ids, stage: "REJECTED" }, { onSuccess: clear })
							}
						>
							Not a fit
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={research.isPending}
							onClick={() => research.mutate({ ids }, { onSuccess: clear })}
						>
							Research again
						</Button>
					</div>
				) : null}
			</div>

			{data ? (
				<SearchStatus search={data.search} waiting={data.research.waiting} />
			) : null}

			{list.isPending ? (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			) : list.isError ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>The investors did not load</EmptyTitle>
						<EmptyDescription>{list.error.message}</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button variant="outline" onClick={() => void list.refetch()}>
							Try again
						</Button>
					</EmptyContent>
				</Empty>
			) : items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Icon icon={Money} />
						</EmptyMedia>
						<EmptyTitle>
							No investors {STAGE_LABEL[stage].toLowerCase()}
						</EmptyTitle>
						<EmptyDescription>
							Upload a spreadsheet of investors, or ask the agent to find more.
							New ones wait in To approve.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button variant="outline" onClick={() => onNavigate("import")}>
							Upload a spreadsheet
						</Button>
					</EmptyContent>
				</Empty>
			) : (
				<div className="min-h-0 overflow-auto rounded-lg border">
					<Table className="text-xs">
						<TableHeader>
							<TableRow>
								<TableHead className="w-8">
									<Checkbox
										checked={allSelected}
										aria-label="Select all on this page"
										onCheckedChange={(checked) =>
											setSelected(
												checked === true
													? new Set(items.map((item) => item.id))
													: new Set(),
											)
										}
									/>
								</TableHead>
								<TableHead>Investor</TableHead>
								<TableHead>Type</TableHead>
								<TableHead className="hidden md:table-cell">Location</TableHead>
								<TableHead className="hidden lg:table-cell">Cheque</TableHead>
								<TableHead>Fit</TableHead>
								<TableHead className="hidden lg:table-cell">Source</TableHead>
								<TableHead className="text-right">Stage</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((investor) => (
								<TableRow key={investor.id}>
									<TableCell>
										<Checkbox
											checked={selected.has(investor.id)}
											aria-label={`Select ${investor.name}`}
											onCheckedChange={(checked) => {
												const next = new Set(selected);
												if (checked === true) next.add(investor.id);
												else next.delete(investor.id);
												setSelected(next);
											}}
										/>
									</TableCell>
									<TableCell className="max-w-72">
										<NameCell investor={investor} />
									</TableCell>
									<TableCell>
										<Badge variant="outline">{KIND_LABEL[investor.kind]}</Badge>
									</TableCell>
									<TableCell className="hidden text-muted-foreground md:table-cell">
										{investor.location ?? "—"}
									</TableCell>
									<TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
										{cheque(investor) ?? "—"}
									</TableCell>
									<TableCell>
										<FitCell investor={investor} />
									</TableCell>
									<TableCell className="hidden max-w-48 truncate text-muted-foreground lg:table-cell">
										{investor.source === "AGENT"
											? "Found by the agent"
											: (investor.sourceDetail ?? "Added by hand")}
									</TableCell>
									<TableCell className="text-right">
										<RowActions investor={investor} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{data && data.total > 0 ? (
				<TablePagination
					page={page}
					totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))}
					pageSize={data.pageSize}
					total={data.total}
					loading={list.isFetching}
					onPageChange={(next) => {
						clear();
						void setParams({ [SEARCH_PARAM.list.page]: next });
					}}
				/>
			) : null}
		</div>
	);
}
