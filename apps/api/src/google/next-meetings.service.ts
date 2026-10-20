import { MEETING_NOTES } from "@crm/validation/meeting-notes";
import { Injectable, Logger } from "@nestjs/common";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import type { NextMeeting, NextMeetings } from "../meetings/meetings.contracts";
import {
	CalendarClient,
	conferenceUrl,
	eventTime,
	type GoogleEvent,
} from "./calendar.client";

const DAY_MS = 24 * 60 * 60 * 1000;

function declinedByMe(event: GoogleEvent): boolean {
	return Boolean(
		event.attendees?.some(
			(attendee) => attendee.self && attendee.responseStatus === "declined",
		),
	);
}

function toMeeting(event: GoogleEvent): NextMeeting | null {
	const start = eventTime(event.start);
	const end = eventTime(event.end);
	if (!event.id || !start || !end || start.isAllDay) return null;
	if (event.status === "cancelled" || declinedByMe(event)) return null;

	return {
		id: event.id,
		title: event.summary ?? null,
		startsAt: start.at.toISOString(),
		endsAt: end.at.toISOString(),
		conferenceUrl: conferenceUrl(event),
		calendarUrl: event.htmlLink ?? null,
		location: event.location ?? null,
	};
}

@Injectable()
export class NextMeetingsService {
	private readonly logger = new Logger(NextMeetingsService.name);
	private readonly cache = new Map<
		string,
		{ until: number; value: NextMeetings }
	>();

	constructor(
		private readonly calendar: CalendarClient,
		private readonly tokens: MailboxTokenService,
	) {}

	async forUser(userId: string, now = new Date()): Promise<NextMeetings> {
		const cached = this.cache.get(userId);
		if (cached && cached.until > now.getTime()) return cached.value;

		const value = await this.read(userId, now);
		this.cache.set(userId, {
			until: now.getTime() + MEETING_NOTES.myCalendar.cacheMs,
			value,
		});
		return value;
	}

	private async read(userId: string, now: Date): Promise<NextMeetings> {
		const token = await this.tokens.accessTokenFor(userId, "calendar");
		if (token.outcome === "not-connected") {
			return { status: "not-connected", meetings: [] };
		}
		if (token.outcome === "needs-reconnect") {
			return { status: "reconnect", meetings: [] };
		}

		const { maxMeetings, daysAhead } = MEETING_NOTES.myCalendar;
		const result = await this.calendar.upcomingEvents(token.accessToken, {
			timeMin: now.toISOString(),
			timeMax: new Date(now.getTime() + daysAhead * DAY_MS).toISOString(),
			maxResults: maxMeetings * 3,
		});

		if (result.outcome !== "ok") {
			this.logger.warn({
				message: "Could not read the next meetings",
				userId,
				outcome: result.outcome,
				reason: result.reason,
			});
			return {
				status: result.outcome === "unauthorized" ? "reconnect" : "unavailable",
				meetings: [],
			};
		}

		const meetings = (result.data.items ?? [])
			.flatMap((event) => {
				const meeting = toMeeting(event);
				return meeting ? [meeting] : [];
			})
			.slice(0, maxMeetings);

		return { status: "connected", meetings };
	}
}
