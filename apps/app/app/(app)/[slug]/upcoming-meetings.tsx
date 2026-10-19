"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardPanel,
	CardPanelEmpty,
	CardTitle,
} from "@crm/ui/components/card";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { MeetingNotesDialog } from "@/components/crm/timeline/meeting-notes-dialog";
import { LocalDateTime } from "@/components/local-date-time";
import { useBusinessFocus } from "@/lib/business-focus";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Meeting = RouterOutputs["meetings"]["upcoming"][number];

const WHEN: Intl.DateTimeFormatOptions = {
	weekday: "short",
	day: "numeric",
	month: "short",
	hour: "numeric",
	minute: "2-digit",
};

const PREPARING_POLL_MS = 10_000;

function anchorOf(meeting: Meeting) {
	if (meeting.contact) return { contactId: meeting.contact.id };
	if (meeting.company) return { companyId: meeting.company.id };
	return null;
}

function PrepAction({ meeting }: { meeting: Meeting }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();
	const prepare = useMutation(
		trpc.meetings.prepare.mutationOptions({
			onSuccess: async () => {
				await cache.meetingNotes();
				toast.success("The agent is preparing a brief before the meeting.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (meeting.prep === "unavailable") return null;

	if (meeting.prep === "preparing") {
		return (
			<span className="flex items-center gap-1.5 text-muted-foreground">
				<Spinner /> Preparing
			</span>
		);
	}

	if (meeting.prep === "ready" && meeting.contact) {
		const contactId = meeting.contact.id;
		return (
			<Button
				size="xs"
				variant="outline"
				onClick={() => openRecord({ kind: "contact", id: contactId })}
			>
				Read the brief
			</Button>
		);
	}

	const failed = meeting.prep === "failed";

	return (
		<span className="flex items-center gap-2">
			{failed ? (
				<span className="text-muted-foreground">
					The agent could not prepare a brief.
				</span>
			) : null}
			<Button
				size="xs"
				variant={failed ? "outline" : "default"}
				disabled={prepare.isPending}
				onClick={() => prepare.mutate({ eventId: meeting.id })}
			>
				{prepare.isPending ? <Spinner /> : null}
				{failed ? "Try again" : "Prepare me"}
			</Button>
		</span>
	);
}

function NotesAction({ meeting }: { meeting: Meeting }) {
	const openRecord = useOpenRecord();
	const [open, setOpen] = useState(false);
	const anchor = anchorOf(meeting);

	if (!anchor) return null;

	if (meeting.notesActivityId) {
		return (
			<Button
				size="xs"
				variant="outline"
				onClick={() =>
					openRecord(
						meeting.contact
							? { kind: "contact", id: meeting.contact.id }
							: { kind: "company", id: meeting.company?.id ?? "" },
					)
				}
			>
				Notes added
			</Button>
		);
	}

	return (
		<>
			<Button size="xs" onClick={() => setOpen(true)}>
				Add notes
			</Button>
			<MeetingNotesDialog
				anchor={anchor}
				meeting={{ calendarEventId: meeting.id, title: meeting.title }}
				open={open}
				onOpenChange={setOpen}
			/>
		</>
	);
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
	return (
		<li className="flex flex-col gap-1.5 px-5 py-2.5 text-xs sm:flex-row sm:items-center md:px-6">
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate font-medium">
					{meeting.title ?? "Untitled meeting"}
				</span>
				<span className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
					<LocalDateTime date={meeting.startsAt} options={WHEN} />
					{meeting.contact ? (
						<RecordLink kind="contact" id={meeting.contact.id}>
							{meeting.contact.name}
						</RecordLink>
					) : null}
					{meeting.company ? (
						<RecordLink kind="company" id={meeting.company.id}>
							{meeting.company.name}
						</RecordLink>
					) : null}
					{meeting.team.length > 0 ? (
						<span>with {meeting.team.join(", ")}</span>
					) : null}
				</span>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{meeting.phase === "upcoming" ? (
					<PrepAction meeting={meeting} />
				) : (
					<NotesAction meeting={meeting} />
				)}
			</div>
		</li>
	);
}

export function UpcomingMeetings() {
	const trpc = useTRPC();
	const business = useBusinessFocus();
	const meetings = useQuery({
		...trpc.meetings.upcoming.queryOptions({ business }),
		refetchInterval: (query) =>
			query.state.data?.some((meeting) => meeting.prep === "preparing")
				? PREPARING_POLL_MS
				: false,
	});
	const rows = meetings.data ?? [];
	const upcoming = rows.filter((meeting) => meeting.phase === "upcoming");
	const done = rows.filter((meeting) => meeting.phase === "done").reverse();

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Meetings</CardTitle>
				<CardDescription>
					From everyone's calendars. Need prep before one, or a summary after?
				</CardDescription>
			</CardHeader>
			<CardPanel size="content">
				{meetings.isPending ? (
					<CardPanelEmpty>
						<Spinner />
					</CardPanelEmpty>
				) : meetings.isError ? (
					<CardPanelEmpty>
						The meetings did not load.{" "}
						<Button variant="link" onClick={() => void meetings.refetch()}>
							Try again
						</Button>
					</CardPanelEmpty>
				) : rows.length === 0 ? (
					<CardPanelEmpty>
						No meetings with people in the CRM this week. Meetings appear once
						someone connects their calendar in Settings → Connections.
					</CardPanelEmpty>
				) : (
					<div className="flex flex-col divide-y">
						{upcoming.length > 0 ? (
							<section>
								<p className="px-5 pt-3 text-muted-foreground text-xs uppercase tracking-wider md:px-6">
									Coming up
								</p>
								<ul className="flex flex-col divide-y">
									{upcoming.map((meeting) => (
										<MeetingRow key={meeting.id} meeting={meeting} />
									))}
								</ul>
							</section>
						) : null}
						{done.length > 0 ? (
							<section>
								<p className="px-5 pt-3 text-muted-foreground text-xs uppercase tracking-wider md:px-6">
									Just happened
								</p>
								<ul className="flex flex-col divide-y">
									{done.map((meeting) => (
										<MeetingRow key={meeting.id} meeting={meeting} />
									))}
								</ul>
							</section>
						) : null}
					</div>
				)}
			</CardPanel>
		</Card>
	);
}
