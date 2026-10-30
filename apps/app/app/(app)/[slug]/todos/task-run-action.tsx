"use client";

import Launch from "@carbon/icons-react/es/Launch";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Run = RouterOutputs["taskRuns"]["get"];
type Action = Run["actions"][number];
type Payload = Action["payload"];

const COPY = {
	EMAIL: { label: "Email", approve: "Approve and send" },
	EVENT: { label: "Calendar", approve: "Approve and add" },
	TODO: { label: "Follow-up", approve: "Approve and add" },
	PULL_REQUEST: { label: "Code change", approve: "Approve and open draft" },
} satisfies Record<Payload["kind"], { label: string; approve: string }>;

const STATUS = {
	RUNNING: "Working",
	DONE: "Done",
	SKIPPED: "Skipped",
	FAILED: "Failed",
} as const;

function TextField({
	label,
	value,
	onChange,
	rows,
	placeholder,
}: {
	label: string;
	value: string;
	onChange: (next: string) => void;
	rows?: number;
	placeholder?: string;
}) {
	const id = useId();

	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			{rows ? (
				<Textarea
					id={id}
					value={value}
					rows={rows}
					onChange={(event) => onChange(event.target.value)}
				/>
			) : (
				<Input
					id={id}
					value={value}
					placeholder={placeholder}
					onChange={(event) => onChange(event.target.value)}
				/>
			)}
		</Field>
	);
}

function splitList(value: string): string[] {
	return value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

function Editor({
	payload,
	sendingFrom,
	onChange,
}: {
	payload: Payload;
	sendingFrom: string;
	onChange: (next: Payload) => void;
}) {
	if (payload.kind === "EMAIL") {
		return (
			<FieldGroup>
				<p className="text-muted-foreground text-xs">From {sendingFrom}</p>
				<TextField
					label="To"
					value={payload.to}
					placeholder="Who this email goes to"
					onChange={(to) => onChange({ ...payload, to })}
				/>
				<TextField
					label="Copy"
					value={payload.cc.join(", ")}
					onChange={(cc) => onChange({ ...payload, cc: splitList(cc) })}
				/>
				<TextField
					label="Subject"
					value={payload.subject}
					onChange={(subject) => onChange({ ...payload, subject })}
				/>
				<TextField
					label="Email"
					rows={10}
					value={payload.body}
					onChange={(body) => onChange({ ...payload, body })}
				/>
			</FieldGroup>
		);
	}

	if (payload.kind === "EVENT") {
		return (
			<FieldGroup>
				<TextField
					label="Title"
					value={payload.title}
					onChange={(title) => onChange({ ...payload, title })}
				/>
				<TextField
					label="Guests"
					value={payload.attendees.join(", ")}
					onChange={(attendees) =>
						onChange({ ...payload, attendees: splitList(attendees) })
					}
				/>
				<p className="text-muted-foreground text-xs">
					{payload.startsAt
						? `Starts ${new Date(payload.startsAt).toLocaleString()}, ${payload.minutes} minutes.`
						: `${payload.minutes} minutes in your first free slot.`}{" "}
					Guests get an invitation when you approve.
				</p>
				<TextField
					label="Description"
					rows={4}
					value={payload.description}
					onChange={(description) => onChange({ ...payload, description })}
				/>
			</FieldGroup>
		);
	}

	if (payload.kind === "TODO") {
		return (
			<TextField
				label="Follow-up"
				value={payload.title}
				onChange={(title) => onChange({ ...payload, title })}
			/>
		);
	}

	return (
		<FieldGroup>
			<TextField
				label="Title"
				value={payload.title}
				onChange={(title) => onChange({ ...payload, title })}
			/>
			<TextField
				label="What it changes"
				rows={4}
				value={payload.body}
				onChange={(body) => onChange({ ...payload, body })}
			/>
			<p className="text-muted-foreground text-xs">
				{payload.repo}: {payload.files.map((file) => file.path).join(", ")}.
				This opens a draft for an engineer to review. Nothing is merged.
			</p>
		</FieldGroup>
	);
}

export function TaskRunActionCard({
	action,
	run,
}: {
	action: Action;
	run: Run;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [payload, setPayload] = useState<Payload>(action.payload);
	const copy = COPY[action.payload.kind];
	const open = action.status === "PROPOSED" || action.status === "FAILED";
	const missingRecipient = payload.kind === "EMAIL" && !payload.to.trim();
	const blocked =
		missingRecipient ||
		(payload.kind === "EMAIL" && !run.canSendEmail) ||
		(payload.kind === "EVENT" && !run.canAddToCalendar);
	const edited = JSON.stringify(payload) !== JSON.stringify(action.payload);

	const approve = useMutation(
		trpc.taskRuns.approve.mutationOptions({
			onSuccess: async (decision) => {
				await cache.taskRuns();
				if (decision.status === "FAILED") {
					toast.error(decision.result ?? "That step failed.");
				} else {
					toast.success(decision.result ?? "Working on it.");
				}
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const skip = useMutation(
		trpc.taskRuns.skip.mutationOptions({
			onSuccess: () => cache.taskRuns(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const save = useMutation(
		trpc.taskRuns.saveStep.mutationOptions({
			onSuccess: async () => {
				await cache.taskRuns();
				toast.success("Saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const busy = approve.isPending || skip.isPending || save.isPending;
	const link = action.result?.startsWith("http") ? action.result : null;

	return (
		<li className="flex flex-col gap-3 rounded-lg border p-3 text-sm">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="outline">{copy.label}</Badge>
				{action.status === "PROPOSED" ? null : (
					<Badge variant="outline">{STATUS[action.status]}</Badge>
				)}
				{action.why ? (
					<span className="text-muted-foreground text-xs">{action.why}</span>
				) : null}
			</div>

			{open ? (
				<Editor
					payload={payload}
					sendingFrom={run.sendingFrom}
					onChange={setPayload}
				/>
			) : null}

			{action.result && !link ? (
				<p className="text-muted-foreground text-xs">{action.result}</p>
			) : null}
			{link ? (
				<Button asChild size="sm" variant="outline" className="w-fit">
					<a href={link} target="_blank" rel="noreferrer">
						<Icon icon={Launch} data-icon="inline-start" />
						Open
					</a>
				</Button>
			) : null}

			{open ? (
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						disabled={busy || blocked}
						onClick={() => approve.mutate({ actionId: action.id, payload })}
					>
						{approve.isPending ? <Spinner /> : null}
						{copy.approve}
					</Button>
					{edited ? (
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() => save.mutate({ actionId: action.id, payload })}
						>
							{save.isPending ? <Spinner /> : null}
							Save changes
						</Button>
					) : null}
					<Button
						size="sm"
						variant="ghost"
						disabled={busy}
						onClick={() => skip.mutate({ actionId: action.id })}
					>
						Skip
					</Button>
				</div>
			) : null}
			{open && missingRecipient ? (
				<p className="text-muted-foreground text-xs">
					Add who it goes to, then you can send it.
				</p>
			) : null}
		</li>
	);
}
