import { z } from "zod";

export const MEETING_NOTES = {
	notes: { maxLength: 50_000 },
	upcoming: { daysBack: 2, daysAhead: 7, maxMeetings: 30, briefFreshDays: 30 },
	inbox: {
		geminiSender: "gemini-notes@google.com",
		backfillDays: 90,
		listMax: 100,
		fetchPerSync: 20,
		matchWindowHours: 36,
		pageSize: 25,
	},
	title: { maxLength: 160 },
	followUps: {
		maxItems: 15,
		titleMaxLength: 160,
		detailMaxLength: 600,
		ownerMaxLength: 80,
		quoteMaxLength: 400,
	},
} as const;

export const MEETING_NOTE_SOURCES = ["GEMINI", "CLUELY", "OTHER"] as const;

export type MeetingNoteSource = (typeof MEETING_NOTE_SOURCES)[number];

export const INCOMING_MEETING_NOTE_VIEWS = ["NEW", "FILED", "IGNORED"] as const;

export type IncomingMeetingNoteView =
	(typeof INCOMING_MEETING_NOTE_VIEWS)[number];

export const meetingNotesPayload = z.object({
	activityId: z.string().trim().min(1),
});

export type MeetingNotesPayload = z.infer<typeof meetingNotesPayload>;

export const meetingNotesMeta = z
	.object({
		meetingNotes: z.literal(true),
		source: z.enum(MEETING_NOTE_SOURCES),
		calendarEventId: z.string().nullable().optional(),
	})
	.nullable()
	.catch(null);

export type MeetingNotesMeta = NonNullable<z.infer<typeof meetingNotesMeta>>;

export const meetingFollowUpItem = z.object({
	kind: z.enum(["TODO", "NEXT_STEP"]),
	title: z.string().trim().min(1).max(MEETING_NOTES.followUps.titleMaxLength),
	detail: z
		.string()
		.trim()
		.max(MEETING_NOTES.followUps.detailMaxLength)
		.nullable()
		.default(null),
	owner: z
		.string()
		.trim()
		.max(MEETING_NOTES.followUps.ownerMaxLength)
		.nullable()
		.default(null),
	dueDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "A due date is YYYY-MM-DD.")
		.nullable()
		.default(null),
	quote: z.string().trim().min(1).max(MEETING_NOTES.followUps.quoteMaxLength),
});

export type MeetingFollowUpItem = z.infer<typeof meetingFollowUpItem>;
