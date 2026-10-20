import { describe, expect, it } from "bun:test";
import type {
	CalendarClient,
	GoogleEvent,
} from "../src/google/calendar.client";
import { NextMeetingsService } from "../src/google/next-meetings.service";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";

const NOW = new Date("2026-10-20T09:00:00Z");

function tokens(outcome: "ok" | "not-connected" | "needs-reconnect") {
	return {
		accessTokenFor: async () =>
			outcome === "ok"
				? { outcome, accessToken: "token" }
				: { outcome, reason: "test" },
	} as unknown as MailboxTokenService;
}

function calendar(items: GoogleEvent[], calls: string[] = []) {
	return {
		upcomingEvents: async (
			_token: string,
			query: { timeMin: string; timeMax: string },
		) => {
			calls.push(query.timeMin);
			return { outcome: "ok" as const, data: { items } };
		},
	} as unknown as CalendarClient;
}

const standUp: GoogleEvent = {
	id: "standup",
	summary: "Team stand-up",
	start: { dateTime: "2026-10-20T09:30:00Z" },
	end: { dateTime: "2026-10-20T09:45:00Z" },
	hangoutLink: "https://meet.google.com/abc-defg-hij",
	htmlLink: "https://calendar.google.com/event?eid=standup",
};

describe("my next meetings", () => {
	it("lists timed meetings I have not declined, with join links", async () => {
		const service = new NextMeetingsService(
			calendar([
				{
					id: "holiday",
					summary: "Bank holiday",
					start: { date: "2026-10-20" },
					end: { date: "2026-10-21" },
				},
				standUp,
				{
					id: "declined",
					summary: "Optional demo",
					start: { dateTime: "2026-10-20T11:00:00Z" },
					end: { dateTime: "2026-10-20T12:00:00Z" },
					attendees: [{ self: true, responseStatus: "declined" }],
				},
			]),
			tokens("ok"),
		);

		expect(await service.forUser("me", NOW)).toEqual({
			status: "connected",
			meetings: [
				{
					id: "standup",
					title: "Team stand-up",
					startsAt: "2026-10-20T09:30:00.000Z",
					endsAt: "2026-10-20T09:45:00.000Z",
					conferenceUrl: "https://meet.google.com/abc-defg-hij",
					calendarUrl: "https://calendar.google.com/event?eid=standup",
					location: null,
				},
			],
		});
	});

	it("says when the calendar is not connected or needs reconnecting", async () => {
		const notConnected = new NextMeetingsService(
			calendar([]),
			tokens("not-connected"),
		);
		const reconnect = new NextMeetingsService(
			calendar([]),
			tokens("needs-reconnect"),
		);

		expect(await notConnected.forUser("me", NOW)).toEqual({
			status: "not-connected",
			meetings: [],
		});
		expect(await reconnect.forUser("me", NOW)).toEqual({
			status: "reconnect",
			meetings: [],
		});
	});

	it("asks Google at most once a minute for the same person", async () => {
		const calls: string[] = [];
		const service = new NextMeetingsService(
			calendar([standUp], calls),
			tokens("ok"),
		);

		await service.forUser("me", NOW);
		await service.forUser("me", new Date(NOW.getTime() + 30_000));
		await service.forUser("me", new Date(NOW.getTime() + 61_000));

		expect(calls).toHaveLength(2);
	});
});
