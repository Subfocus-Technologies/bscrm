"use client";

import Calendar from "@carbon/icons-react/es/Calendar";
import Launch from "@carbon/icons-react/es/Launch";
import VideoChat from "@carbon/icons-react/es/VideoChat";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { Skeleton } from "@crm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
	LocalDateTimeRange,
	LocalRelativeTime,
} from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type NextMeetings = RouterOutputs["meetings"]["mine"];
type Meeting = NextMeetings["meetings"][number];

const REFRESH_MS = 60_000;

const WHEN: Intl.DateTimeFormatOptions = {
	weekday: "short",
	day: "numeric",
	month: "short",
	hour: "numeric",
	minute: "2-digit",
};

function isHappening(meeting: Meeting): boolean {
	const now = Date.now();
	return (
		new Date(meeting.startsAt).getTime() <= now &&
		new Date(meeting.endsAt).getTime() > now
	);
}

function MeetingItem({ meeting }: { meeting: Meeting }) {
	return (
		<li className="flex flex-col gap-1.5 py-2.5">
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="truncate font-medium">
					{meeting.title ?? "Untitled meeting"}
				</span>
				<span className="text-muted-foreground">
					<LocalDateTimeRange
						start={meeting.startsAt}
						end={meeting.endsAt}
						options={WHEN}
					/>
				</span>
				{meeting.location ? (
					<span className="truncate text-muted-foreground">
						{meeting.location}
					</span>
				) : null}
			</div>
			<div className="flex flex-wrap gap-1.5">
				{meeting.conferenceUrl ? (
					<Button asChild size="xs">
						<a href={meeting.conferenceUrl} target="_blank" rel="noreferrer">
							<Icon icon={VideoChat} data-icon="inline-start" />
							Join
						</a>
					</Button>
				) : null}
				{meeting.calendarUrl ? (
					<Button asChild size="xs" variant="outline">
						<a href={meeting.calendarUrl} target="_blank" rel="noreferrer">
							<Icon icon={Launch} data-icon="inline-start" />
							Open in Google Calendar
						</a>
					</Button>
				) : null}
			</div>
		</li>
	);
}

function Body({ data }: { data: NextMeetings }) {
	const workspaceUrl = useWorkspaceUrl();
	const connections = workspaceUrl("/settings/connections");

	if (data.status === "not-connected" || data.status === "reconnect") {
		return (
			<p className="flex flex-col items-start gap-2 text-muted-foreground">
				{data.status === "reconnect"
					? "Your Google Calendar needs reconnecting."
					: "Connect your Google Calendar to see your next meetings here."}
				<Button asChild size="xs" variant="outline">
					<Link href={connections}>Open Connections</Link>
				</Button>
			</p>
		);
	}

	if (data.status === "unavailable") {
		return (
			<p className="text-muted-foreground">
				Google Calendar did not answer. The CRM tries again in a minute.
			</p>
		);
	}

	if (data.meetings.length === 0) {
		return (
			<p className="text-muted-foreground">
				Nothing on your calendar in the next 7 days.
			</p>
		);
	}

	return (
		<ul className="flex flex-col divide-y">
			{data.meetings.map((meeting) => (
				<MeetingItem key={meeting.id} meeting={meeting} />
			))}
		</ul>
	);
}

function TriggerLabel({ data }: { data: NextMeetings }) {
	const next = data.meetings[0];
	if (data.status !== "connected" || !next) {
		return <span className="hidden sm:inline">Calendar</span>;
	}

	return (
		<span className="hidden min-w-0 items-center gap-1 sm:flex">
			<span className="max-w-40 truncate">{next.title ?? "Meeting"}</span>
			<span className="text-muted-foreground">
				{isHappening(next) ? "now" : <LocalRelativeTime date={next.startsAt} />}
			</span>
		</span>
	);
}

export function NextMeeting() {
	const trpc = useTRPC();
	const mine = useQuery({
		...trpc.meetings.mine.queryOptions(),
		staleTime: REFRESH_MS,
		refetchInterval: REFRESH_MS,
	});

	if (mine.isPending) return <Skeleton className="h-8 w-8 sm:w-40" />;
	if (mine.isError) return null;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					aria-label="Your next meetings"
					className="max-w-64"
				>
					<Icon icon={Calendar} data-icon="inline-start" />
					<TriggerLabel data={mine.data} />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 text-xs">
				<PopoverHeader>
					<PopoverTitle>Your next meetings</PopoverTitle>
					<PopoverDescription>From your Google Calendar.</PopoverDescription>
				</PopoverHeader>
				<Body data={mine.data} />
			</PopoverContent>
		</Popover>
	);
}
