import { z } from "zod";
import { businessScopeInput } from "../trpc/list-input";

export const upcomingMeetingsInput = z.object({
	business: businessScopeInput,
});

export type UpcomingMeetingsInput = z.infer<typeof upcomingMeetingsInput>;

const recordRef = z.object({ id: z.string(), name: z.string() });

const meetingOutput = z.object({
	id: z.string(),
	title: z.string().nullable(),
	startsAt: z.string(),
	endsAt: z.string(),
	conferenceUrl: z.string().nullable(),
	phase: z.enum(["upcoming", "done"]),
	team: z.array(z.string()),
	contact: recordRef.nullable(),
	company: recordRef.nullable(),
	prep: z.enum(["none", "preparing", "ready", "unavailable"]),
	notesActivityId: z.string().nullable(),
});

export type UpcomingMeeting = z.infer<typeof meetingOutput>;

export const upcomingMeetingsOutput = z.array(meetingOutput);

export const prepareMeetingInput = z.object({ eventId: z.string() });

export const prepareMeetingOutput = z.object({ queued: z.boolean() });
