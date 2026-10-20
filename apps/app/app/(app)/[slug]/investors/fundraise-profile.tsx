"use client";

import Add from "@carbon/icons-react/es/Add";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardPanel,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { Switch } from "@crm/ui/components/switch";
import { Textarea } from "@crm/ui/components/textarea";
import {
	CRITERION_KINDS,
	type CriterionKind,
	INVESTORS,
	type ProfileCriterion,
} from "@crm/validation/investors";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Fundraise = NonNullable<RouterOutputs["investors"]["fundraise"]>;

const KIND_LABEL = {
	MUST: "Must have",
	NICE: "Nice to have",
	RULE_OUT: "Rules them out",
} satisfies Record<CriterionKind, string>;

type Draft = {
	name: string;
	company: string;
	website: string;
	founderLinkedIn: string;
	roundPounds: string;
	summary: string;
	whyNow: string;
	traction: string;
	weeklyMeetingTarget: string;
	researchDailyLimit: string;
	autoDiscover: boolean;
	criteria: (ProfileCriterion & { valuesText: string })[];
};

function draftOf(fundraise: Fundraise | null): Draft {
	return {
		name: fundraise?.name ?? "",
		company: fundraise?.company ?? "",
		website: fundraise?.website ?? "",
		founderLinkedIn: fundraise?.founderLinkedIn ?? "",
		roundPounds:
			fundraise?.roundSizeCents != null
				? String(fundraise.roundSizeCents / 100)
				: "",
		summary: fundraise?.summary ?? "",
		whyNow: fundraise?.whyNow ?? "",
		traction: fundraise?.traction ?? "",
		weeklyMeetingTarget: String(
			fundraise?.weeklyMeetingTarget ?? INVESTORS.meetingTarget.default,
		),
		researchDailyLimit: String(
			fundraise?.researchDailyLimit ?? INVESTORS.research.dailyLimitDefault,
		),
		autoDiscover: fundraise?.autoDiscover ?? true,
		criteria: (fundraise?.profile.criteria ?? []).map((criterion) => ({
			...criterion,
			valuesText: criterion.values.join(", "),
		})),
	};
}

function blank(value: string): string | null {
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function wholeNumber(value: string, fallback: number): number {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function newCriterion(): Draft["criteria"][number] {
	return {
		id: `c${Date.now().toString(36)}`,
		kind: "NICE",
		label: "",
		values: [],
		valuesText: "",
		weight: 10,
	};
}

function Field({
	label,
	children,
	hint,
}: {
	label: string;
	children: (id: string) => ReactNode;
	hint?: string;
}) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			{children(id)}
			{hint ? (
				<span className="text-muted-foreground text-xs">{hint}</span>
			) : null}
		</div>
	);
}

function CriteriaEditor({
	criteria,
	onChange,
}: {
	criteria: Draft["criteria"];
	onChange: (next: Draft["criteria"]) => void;
}) {
	const update = (index: number, patch: Partial<Draft["criteria"][number]>) =>
		onChange(
			criteria.map((criterion, position) =>
				position === index ? { ...criterion, ...patch } : criterion,
			),
		);
	const total = criteria
		.filter((criterion) => criterion.kind !== "RULE_OUT")
		.reduce((sum, criterion) => sum + criterion.weight, 0);

	return (
		<div className="flex flex-col gap-3">
			{criteria.map((criterion, index) => (
				<div
					key={criterion.id}
					className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[10rem_1fr_6rem_auto]"
				>
					<Select
						value={criterion.kind}
						onValueChange={(next) => {
							const kind = CRITERION_KINDS.find((option) => option === next);
							if (kind)
								update(index, {
									kind,
									weight: kind === "RULE_OUT" ? 0 : criterion.weight,
								});
						}}
					>
						<SelectTrigger aria-label="Kind of criterion">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CRITERION_KINDS.map((kind) => (
								<SelectItem key={kind} value={kind}>
									{KIND_LABEL[kind]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<div className="flex flex-col gap-2">
						<Input
							value={criterion.label}
							onChange={(event) => update(index, { label: event.target.value })}
							placeholder="What it means, e.g. Invests in our sector"
							aria-label="Criterion"
						/>
						<Input
							value={criterion.valuesText}
							onChange={(event) =>
								update(index, { valuesText: event.target.value })
							}
							placeholder="Details, separated by commas, e.g. PropTech, AI"
							aria-label="Details"
						/>
					</div>
					<Input
						type="number"
						min={0}
						max={100}
						value={
							criterion.kind === "RULE_OUT" ? "" : String(criterion.weight)
						}
						disabled={criterion.kind === "RULE_OUT"}
						onChange={(event) =>
							update(index, { weight: wholeNumber(event.target.value, 0) })
						}
						placeholder="—"
						aria-label="Weight"
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Remove criterion"
						onClick={() =>
							onChange(criteria.filter((_, position) => position !== index))
						}
					>
						<Icon icon={TrashCan} />
					</Button>
				</div>
			))}
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={criteria.length >= INVESTORS.profile.maxCriteria}
					onClick={() => onChange([...criteria, newCriterion()])}
				>
					<Icon icon={Add} data-icon="inline-start" />
					Add a criterion
				</Button>
				<span className="text-muted-foreground text-xs">
					Weights add up to {total}. A score is the share of weight an investor
					meets; anything in "Rules them out" makes it 0.
				</span>
			</div>
		</div>
	);
}

function ProfileForm({ fundraise }: { fundraise: Fundraise | null }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [draft, setDraft] = useState<Draft>(() => draftOf(fundraise));
	const discoverId = useId();
	const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) =>
		setDraft((current) => ({ ...current, [key]: value }));

	const save = useMutation(
		trpc.investors.saveFundraise.mutationOptions({
			onSuccess: async () => {
				await cache.investors();
				toast.success("Fundraise profile saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const pounds = Number.parseFloat(draft.roundPounds.replace(/[£,\s]/g, ""));
		save.mutate({
			id: fundraise?.id,
			name: draft.name,
			company: draft.company,
			website: blank(draft.website),
			founderLinkedIn: blank(draft.founderLinkedIn),
			roundSizeCents: Number.isFinite(pounds) ? Math.round(pounds * 100) : null,
			summary: blank(draft.summary),
			whyNow: blank(draft.whyNow),
			traction: blank(draft.traction),
			weeklyMeetingTarget: wholeNumber(
				draft.weeklyMeetingTarget,
				INVESTORS.meetingTarget.default,
			),
			researchDailyLimit: wholeNumber(
				draft.researchDailyLimit,
				INVESTORS.research.dailyLimitDefault,
			),
			autoDiscover: draft.autoDiscover,
			profile: {
				criteria: draft.criteria
					.filter((criterion) => criterion.label.trim())
					.map(({ valuesText, ...criterion }) => ({
						...criterion,
						label: criterion.label.trim(),
						values: valuesText
							.split(",")
							.map((value) => value.trim())
							.filter(Boolean)
							.slice(0, INVESTORS.profile.maxValues),
					})),
			},
		});
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-4 pb-8">
			<Card>
				<CardHeader>
					<CardTitle>The raise</CardTitle>
					<CardDescription>
						What the agent tells itself before it looks for or scores anyone.
					</CardDescription>
				</CardHeader>
				<CardPanel size="content">
					<div className="grid gap-4 p-5 sm:grid-cols-2 md:p-6">
						<Field label="Name of the raise">
							{(id) => (
								<Input
									id={id}
									value={draft.name}
									onChange={(event) => set("name", event.target.value)}
									placeholder="Pre-seed 2026"
								/>
							)}
						</Field>
						<Field label="Company">
							{(id) => (
								<Input
									id={id}
									value={draft.company}
									onChange={(event) => set("company", event.target.value)}
								/>
							)}
						</Field>
						<Field label="Website">
							{(id) => (
								<Input
									id={id}
									value={draft.website}
									onChange={(event) => set("website", event.target.value)}
								/>
							)}
						</Field>
						<Field label="LinkedIn of the person leading the raise">
							{(id) => (
								<Input
									id={id}
									value={draft.founderLinkedIn}
									onChange={(event) =>
										set("founderLinkedIn", event.target.value)
									}
								/>
							)}
						</Field>
						<Field label="Round size (£)">
							{(id) => (
								<Input
									id={id}
									inputMode="decimal"
									value={draft.roundPounds}
									onChange={(event) => set("roundPounds", event.target.value)}
									placeholder="500000"
								/>
							)}
						</Field>
						<div className="grid grid-cols-2 gap-4">
							<Field label="Meetings a week">
								{(id) => (
									<Input
										id={id}
										type="number"
										min={0}
										max={INVESTORS.meetingTarget.max}
										value={draft.weeklyMeetingTarget}
										onChange={(event) =>
											set("weeklyMeetingTarget", event.target.value)
										}
									/>
								)}
							</Field>
							<Field label="Research a day">
								{(id) => (
									<Input
										id={id}
										type="number"
										min={0}
										max={INVESTORS.research.dailyLimitMax}
										value={draft.researchDailyLimit}
										onChange={(event) =>
											set("researchDailyLimit", event.target.value)
										}
									/>
								)}
							</Field>
						</div>
						<div className="sm:col-span-2">
							<Field label="What the company does">
								{(id) => (
									<Textarea
										id={id}
										value={draft.summary}
										onChange={(event) => set("summary", event.target.value)}
									/>
								)}
							</Field>
						</div>
						<div className="sm:col-span-2">
							<Field label="Why us, why now">
								{(id) => (
									<Textarea
										id={id}
										value={draft.whyNow}
										onChange={(event) => set("whyNow", event.target.value)}
									/>
								)}
							</Field>
						</div>
						<div className="sm:col-span-2">
							<Field label="Traction">
								{(id) => (
									<Textarea
										id={id}
										value={draft.traction}
										onChange={(event) => set("traction", event.target.value)}
									/>
								)}
							</Field>
						</div>
						<div className="flex items-center gap-2 sm:col-span-2">
							<Switch
								id={discoverId}
								checked={draft.autoDiscover}
								onCheckedChange={(checked) => set("autoDiscover", checked)}
							/>
							<Label htmlFor={discoverId}>
								Let the agent look for new investors every day
							</Label>
						</div>
					</div>
				</CardPanel>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Ideal investor profile</CardTitle>
					<CardDescription>
						Each line is something the agent checks. Heavier lines move the fit
						score more.
					</CardDescription>
				</CardHeader>
				<CardPanel size="content">
					<div className="p-5 md:p-6">
						<CriteriaEditor
							criteria={draft.criteria}
							onChange={(criteria) => set("criteria", criteria)}
						/>
					</div>
				</CardPanel>
			</Card>

			<div className="flex justify-end">
				<Button
					type="submit"
					disabled={
						!draft.name.trim() || !draft.company.trim() || save.isPending
					}
				>
					{save.isPending ? <Spinner /> : null}
					Save profile
				</Button>
			</div>
		</form>
	);
}

export function FundraiseProfile() {
	const trpc = useTRPC();
	const fundraise = useQuery(trpc.investors.fundraise.queryOptions());

	if (fundraise.isPending) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	if (fundraise.isError) {
		return (
			<p className="text-muted-foreground text-sm">
				The profile did not load. {fundraise.error.message}
			</p>
		);
	}

	return (
		<ProfileForm
			key={fundraise.data?.updatedAt ?? "new"}
			fundraise={fundraise.data}
		/>
	);
}
