"use client";

import Launch from "@carbon/icons-react/es/Launch";
import Notebook from "@carbon/icons-react/es/Notebook";
import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { TablePagination } from "@crm/ui/components/table-pagination";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import type { IncomingMeetingNoteView } from "@crm/validation/meeting-notes";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { CompanyPicker } from "@/components/crm/company-picker";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { CollapsibleNotes } from "@/components/crm/timeline/collapsible-notes";
import { MeetingFollowUps } from "@/components/crm/timeline/meeting-follow-ups";
import { LocalDateTime } from "@/components/local-date-time";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { meetingNotesParsers } from "./meeting-notes-search-params";

type Inbox = RouterOutputs["meetingNotes"]["inbox"];
type Note = Inbox["items"][number];

const VIEWS = [
	{ value: "NEW", label: "To file" },
	{ value: "FILED", label: "Filed" },
	{ value: "IGNORED", label: "Ignored" },
] as const satisfies readonly {
	value: IncomingMeetingNoteView;
	label: string;
}[];

const EMPTY = {
	NEW: {
		title: "Nothing to file",
		description:
			"Gemini notes arrive here from everyone's Gmail. Notes from a meeting with someone in the CRM go straight onto their record.",
	},
	FILED: {
		title: "No notes filed yet",
		description: "Filed notes show here with the to-dos the agent suggested.",
	},
	IGNORED: {
		title: "Nothing ignored",
		description: "Notes you ignore stay here, in case you need them later.",
	},
} satisfies Record<
	IncomingMeetingNoteView,
	{ title: string; description: string }
>;

const HELD_AT: Intl.DateTimeFormatOptions = {
	weekday: "short",
	day: "numeric",
	month: "short",
	hour: "numeric",
	minute: "2-digit",
};

function isView(value: string): value is IncomingMeetingNoteView {
	return VIEWS.some((view) => view.value === value);
}

function FileNote({ note }: { note: Note }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [companyId, setCompanyId] = useState("");

	const file = useMutation(
		trpc.meetingNotes.file.mutationOptions({
			onSuccess: async () => {
				await cache.meetingNotes();
				toast.success(
					"Filed. The agent is reading the notes for to-dos and next steps.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const ignore = useMutation(
		trpc.meetingNotes.ignore.mutationOptions({
			onSuccess: () => cache.meetingNotes(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const busy = file.isPending || ignore.isPending;

	return (
		<div className="flex flex-wrap items-center gap-2">
			<CompanyPicker
				value={companyId}
				onValueChange={setCompanyId}
				placeholder="Choose the company"
				disabled={busy}
				className="w-full sm:w-64"
			/>
			<Button
				size="sm"
				disabled={!companyId || busy}
				onClick={() => file.mutate({ id: note.id, companyId })}
			>
				{file.isPending ? <Spinner /> : null}
				File notes
			</Button>
			<Button
				size="sm"
				variant="ghost"
				disabled={busy}
				onClick={() => ignore.mutate({ id: note.id })}
			>
				Ignore
			</Button>
		</div>
	);
}

function RestoreNote({ note }: { note: Note }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const restore = useMutation(
		trpc.meetingNotes.restore.mutationOptions({
			onSuccess: () => cache.meetingNotes(),
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Button
			size="sm"
			variant="outline"
			disabled={restore.isPending}
			onClick={() => restore.mutate({ id: note.id })}
		>
			{restore.isPending ? <Spinner /> : null}
			Put back to file
		</Button>
	);
}

function FiledOn({ note }: { note: Note }) {
	if (!note.record) return <span>Filed</span>;

	return (
		<span className="flex flex-wrap items-center gap-x-1">
			Filed on
			<RecordLink kind={note.record.kind} id={note.record.id}>
				{note.record.name}
			</RecordLink>
			{note.filedBy ? `by ${note.filedBy}` : "automatically"}
		</span>
	);
}

function NoteRow({ note }: { note: Note }) {
	return (
		<li className="flex flex-col gap-3 px-4 py-4 text-sm md:px-5">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="font-medium">{note.title}</span>
					<span className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
						<LocalDateTime date={note.heldAt} options={HELD_AT} />
						<span>From {note.mailbox}'s Gmail</span>
						{note.meeting ? <span>Matched to a calendar meeting</span> : null}
						{note.status === "FILED" ? <FiledOn note={note} /> : null}
					</span>
				</div>
				{note.docUrl ? (
					<Button asChild size="sm" variant="outline">
						<a href={note.docUrl} target="_blank" rel="noreferrer">
							<Icon icon={Launch} data-icon="inline-start" />
							Open in Google Docs
						</a>
					</Button>
				) : null}
			</div>
			<CollapsibleNotes body={note.preview} />
			{note.status === "NEW" ? <FileNote note={note} /> : null}
			{note.status === "IGNORED" ? <RestoreNote note={note} /> : null}
			{note.status === "FILED" && note.activityId ? (
				<div className="text-xs">
					<MeetingFollowUps activityId={note.activityId} />
				</div>
			) : null}
		</li>
	);
}

export function MeetingNotesInbox() {
	const trpc = useTRPC();
	const [params, setParams] = useQueryStates(meetingNotesParsers);
	const view = params[SEARCH_PARAM.meetingNotes.view];
	const page = params[SEARCH_PARAM.list.page];

	const inbox = useQuery({
		...trpc.meetingNotes.inbox.queryOptions({ view, page }),
		placeholderData: (previous) => previous,
	});

	const data = inbox.data;
	const totalPages = data
		? Math.max(1, Math.ceil(data.total / data.pageSize))
		: 1;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4">
			<Tabs
				value={view}
				onValueChange={(next) => {
					if (isView(next)) {
						void setParams({
							[SEARCH_PARAM.meetingNotes.view]: next,
							[SEARCH_PARAM.list.page]: 1,
						});
					}
				}}
			>
				<TabsList>
					{VIEWS.map((option) => (
						<TabsTrigger key={option.value} value={option.value}>
							{option.label}
							{data ? (
								<span className="text-muted-foreground tabular-nums">
									{data.counts[option.value]}
								</span>
							) : null}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{inbox.isPending ? (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			) : inbox.isError ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>The meeting notes did not load</EmptyTitle>
						<EmptyDescription>{inbox.error.message}</EmptyDescription>
					</EmptyHeader>
					<Button variant="outline" onClick={() => void inbox.refetch()}>
						Try again
					</Button>
				</Empty>
			) : inbox.data.items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Icon icon={Notebook} />
						</EmptyMedia>
						<EmptyTitle>{EMPTY[view].title}</EmptyTitle>
						<EmptyDescription>{EMPTY[view].description}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<ul className="flex flex-col divide-y rounded-lg border">
					{inbox.data.items.map((note) => (
						<NoteRow key={note.id} note={note} />
					))}
				</ul>
			)}

			{data && data.total > 0 ? (
				<TablePagination
					page={page}
					totalPages={totalPages}
					pageSize={data.pageSize}
					total={data.total}
					loading={inbox.isFetching}
					onPageChange={(next) =>
						void setParams({ [SEARCH_PARAM.list.page]: next })
					}
				/>
			) : null}
		</div>
	);
}
