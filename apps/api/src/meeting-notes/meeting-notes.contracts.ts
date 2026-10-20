import {
	INCOMING_MEETING_NOTE_VIEWS,
	MEETING_NOTE_SOURCES,
	MEETING_NOTES,
} from "@crm/validation/meeting-notes";
import { z } from "zod";

export const meetingNotesImportInput = z
	.object({
		companyId: z.string().optional(),
		contactId: z.string().optional(),
		dealId: z.string().optional(),
		title: z.string().trim().max(MEETING_NOTES.title.maxLength).optional(),
		notes: z
			.string()
			.trim()
			.min(1, "Paste the meeting notes first.")
			.max(
				MEETING_NOTES.notes.maxLength,
				`Notes can be up to ${MEETING_NOTES.notes.maxLength} characters.`,
			),
		source: z.enum(MEETING_NOTE_SOURCES),
		occurredAt: z.string().optional(),
		calendarEventId: z.string().optional(),
	})
	.refine((input) => input.companyId || input.contactId || input.dealId, {
		message: "Meeting notes have to be about a company, a contact or a deal.",
	});

export type MeetingNotesImportInput = z.infer<typeof meetingNotesImportInput>;

export const meetingNotesImportOutput = z.object({ activityId: z.string() });

export const followUpsInput = z.object({ activityId: z.string() });

const followUpOutput = z.object({
	id: z.string(),
	kind: z.enum(["TODO", "NEXT_STEP"]),
	title: z.string(),
	detail: z.string().nullable(),
	owner: z.string().nullable(),
	dueAt: z.string().nullable(),
	quote: z.string(),
	status: z.enum(["PROPOSED", "ACCEPTED", "DISMISSED"]),
	taskId: z.string().nullable(),
});

export const followUpsOutput = z.object({
	reading: z.enum(["reading", "ready", "failed"]),
	outcome: z.string().nullable(),
	items: z.array(followUpOutput),
});

export type FollowUps = z.infer<typeof followUpsOutput>;

export const followUpDecideInput = z.object({
	id: z.string(),
	decision: z.enum(["accept", "dismiss"]),
});

export type FollowUpDecideInput = z.infer<typeof followUpDecideInput>;

export const followUpDecideOutput = z.object({
	id: z.string(),
	status: z.enum(["ACCEPTED", "DISMISSED"]),
	taskId: z.string().nullable(),
});

export const rereadOutput = z.object({ queued: z.boolean() });

export const incomingNotesInput = z.object({
	view: z.enum(INCOMING_MEETING_NOTE_VIEWS).default("NEW"),
	page: z.number().int().min(1).default(1),
});

export type IncomingNotesInput = z.infer<typeof incomingNotesInput>;

const incomingNoteRecord = z.object({
	kind: z.enum(["contact", "company"]),
	id: z.string(),
	name: z.string(),
});

const incomingNoteOutput = z.object({
	id: z.string(),
	title: z.string(),
	heldAt: z.string(),
	preview: z.string(),
	docUrl: z.string().nullable(),
	mailbox: z.string(),
	status: z.enum(["NEW", "FILED", "IGNORED", "DUPLICATE"]),
	activityId: z.string().nullable(),
	filedBy: z.string().nullable(),
	filedAt: z.string().nullable(),
	record: incomingNoteRecord.nullable(),
	suggested: incomingNoteRecord.nullable(),
	meeting: z
		.object({ title: z.string().nullable(), startsAt: z.string() })
		.nullable(),
});

export type IncomingNote = z.infer<typeof incomingNoteOutput>;

export const incomingNotesOutput = z.object({
	items: z.array(incomingNoteOutput),
	total: z.number(),
	pageSize: z.number(),
	counts: z.object({ NEW: z.number(), FILED: z.number(), IGNORED: z.number() }),
});

export type IncomingNotes = z.infer<typeof incomingNotesOutput>;

export const incomingNoteFileInput = z
	.object({
		id: z.string(),
		companyId: z.string().optional(),
		contactId: z.string().optional(),
	})
	.refine((input) => input.companyId || input.contactId, {
		message: "Choose a company or a contact to file these notes under.",
	});

export type IncomingNoteFileInput = z.infer<typeof incomingNoteFileInput>;

export const incomingNoteIdInput = z.object({ id: z.string() });

export const incomingNoteFileOutput = z.object({ activityId: z.string() });

export const incomingNoteStatusOutput = z.object({
	id: z.string(),
	status: z.enum(["NEW", "IGNORED"]),
});
