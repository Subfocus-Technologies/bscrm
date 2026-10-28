import { type Db, IncomingMeetingNoteStatus, type Prisma } from "@crm/db";
import { MEETING_NOTES } from "@crm/validation/meeting-notes";
import {
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { notesBody, titlesMatch } from "./gemini-note";
import type {
	IncomingNote,
	IncomingNoteFileInput,
	IncomingNotes,
	IncomingNotesInput,
} from "./meeting-notes.contracts";
import { MeetingNotesService } from "./meeting-notes.service";

const HOUR_MS = 60 * 60 * 1000;
const PREVIEW_LENGTH = 1_200;

export type ReceivedNote = {
	gmailMessageId: string;
	mailboxUserId: string;
	subject: string;
	title: string;
	body: string;
	docUrl: string | null;
	heldAt: Date;
};

function needsRereading(row: {
	status: IncomingMeetingNoteStatus;
	parserVersion: number;
}): boolean {
	return (
		row.status === IncomingMeetingNoteStatus.NEW &&
		row.parserVersion < MEETING_NOTES.inbox.parserVersion
	);
}

type NoteRecord = { contactId?: string; companyId?: string };

const NOTE_SELECT = {
	id: true,
	title: true,
	heldAt: true,
	body: true,
	docUrl: true,
	status: true,
	activityId: true,
	filedAt: true,
	mailboxUser: { select: { name: true } },
	filedBy: { select: { name: true } },
	calendarEvent: {
		select: {
			title: true,
			startsAt: true,
			contact: { select: { id: true, firstName: true, lastName: true } },
			company: { select: { id: true, name: true } },
			attendees: {
				where: { contactId: { not: null } },
				select: {
					contact: { select: { id: true, firstName: true, lastName: true } },
				},
				take: 1,
			},
		},
	},
	activity: {
		select: {
			contact: { select: { id: true, firstName: true, lastName: true } },
			company: { select: { id: true, name: true } },
		},
	},
} as const;

type NoteRow = Prisma.IncomingMeetingNoteGetPayload<{
	select: typeof NOTE_SELECT;
}>;

type RecordParts = {
	contact?: {
		id: string;
		firstName: string | null;
		lastName: string | null;
	} | null;
	company?: { id: string; name: string } | null;
};

function toRecord({ contact, company }: RecordParts): IncomingNote["record"] {
	if (contact) {
		return {
			kind: "contact",
			id: contact.id,
			name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
		};
	}

	return company
		? { kind: "company", id: company.id, name: company.name }
		: null;
}

function suggestedRecord(row: NoteRow): IncomingNote["suggested"] {
	const event = row.calendarEvent;
	if (!event) return null;

	return toRecord({
		contact: event.contact ?? event.attendees[0]?.contact ?? null,
		company: event.company,
	});
}

function toNote(row: NoteRow): IncomingNote {
	return {
		id: row.id,
		title: row.title,
		heldAt: row.heldAt.toISOString(),
		preview: row.body.slice(0, PREVIEW_LENGTH),
		docUrl: row.docUrl,
		mailbox: row.mailboxUser.name,
		status: row.status,
		activityId: row.activityId,
		filedBy: row.filedBy?.name ?? null,
		filedAt: row.filedAt?.toISOString() ?? null,
		record: toRecord({
			contact: row.activity?.contact,
			company: row.activity?.company,
		}),
		suggested: suggestedRecord(row),
		meeting: row.calendarEvent
			? {
					title: row.calendarEvent.title,
					startsAt: row.calendarEvent.startsAt.toISOString(),
				}
			: null,
	};
}

@Injectable()
export class IncomingNotesService {
	private readonly logger = new Logger(IncomingNotesService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly notes: MeetingNotesService,
	) {}

	async settled(gmailMessageIds: readonly string[]): Promise<Set<string>> {
		if (gmailMessageIds.length === 0) return new Set();

		const rows = await this.db.incomingMeetingNote.findMany({
			where: { gmailMessageId: { in: [...gmailMessageIds] } },
			select: { gmailMessageId: true, status: true, parserVersion: true },
		});

		return new Set(
			rows
				.filter((row) => !needsRereading(row))
				.map((row) => row.gmailMessageId),
		);
	}

	async receive(note: ReceivedNote): Promise<IncomingMeetingNoteStatus> {
		const existing = await this.db.incomingMeetingNote.findUnique({
			where: { gmailMessageId: note.gmailMessageId },
			select: { status: true, parserVersion: true },
		});
		if (existing && !needsRereading(existing)) return existing.status;

		const calendarEventId = await this.matchEvent(note);
		const duplicate = await this.isDuplicate(note, calendarEventId);
		const read = {
			subject: note.subject,
			title: note.title,
			body: note.body,
			docUrl: note.docUrl,
			calendarEventId,
			parserVersion: MEETING_NOTES.inbox.parserVersion,
			status: duplicate
				? IncomingMeetingNoteStatus.DUPLICATE
				: IncomingMeetingNoteStatus.NEW,
		};

		const saved = await this.db.incomingMeetingNote.upsert({
			where: { gmailMessageId: note.gmailMessageId },
			create: { ...note, ...read, source: "GEMINI" },
			update: read,
			select: { status: true },
		});

		return saved.status;
	}

	async list(
		input: IncomingNotesInput,
		userId: string,
	): Promise<IncomingNotes> {
		const pageSize = MEETING_NOTES.inbox.pageSize;
		const where = {
			mailboxUserId: userId,
			status: input.view,
		} satisfies Prisma.IncomingMeetingNoteWhereInput;

		const [rows, total, grouped] = await Promise.all([
			this.db.incomingMeetingNote.findMany({
				where,
				orderBy: [{ heldAt: "desc" }, { id: "desc" }],
				skip: (input.page - 1) * pageSize,
				take: pageSize,
				select: NOTE_SELECT,
			}),
			this.db.incomingMeetingNote.count({ where }),
			this.db.incomingMeetingNote.groupBy({
				by: ["status"],
				where: { mailboxUserId: userId },
				_count: { _all: true },
			}),
		]);

		const countOf = (status: IncomingMeetingNoteStatus) =>
			grouped.find((group) => group.status === status)?._count._all ?? 0;

		return {
			items: rows.map(toNote),
			total,
			pageSize,
			counts: {
				NEW: countOf(IncomingMeetingNoteStatus.NEW),
				FILED: countOf(IncomingMeetingNoteStatus.FILED),
				IGNORED: countOf(IncomingMeetingNoteStatus.IGNORED),
			},
		};
	}

	async file(
		input: IncomingNoteFileInput,
		actingUserId: string,
	): Promise<{ activityId: string }> {
		const record = input.contactId
			? { contactId: input.contactId }
			: { companyId: input.companyId };

		const activityId = await this.fileNote(input.id, record, actingUserId);

		this.logger.log({
			message: "Meeting notes filed from the inbox",
			noteId: input.id,
			activityId,
			userId: actingUserId,
		});

		return { activityId };
	}

	async setIgnored(
		id: string,
		ignored: boolean,
		actingUserId: string,
	): Promise<{ id: string; status: "NEW" | "IGNORED" }> {
		const from = ignored
			? IncomingMeetingNoteStatus.NEW
			: IncomingMeetingNoteStatus.IGNORED;
		const to = ignored
			? IncomingMeetingNoteStatus.IGNORED
			: IncomingMeetingNoteStatus.NEW;

		const updated = await this.db.incomingMeetingNote.updateMany({
			where: { id, mailboxUserId: actingUserId, status: from },
			data: { status: to },
		});
		if (updated.count === 0) await this.conflict(id, actingUserId);

		this.logger.log({
			message: ignored ? "Meeting notes ignored" : "Meeting notes restored",
			noteId: id,
			userId: actingUserId,
		});

		return { id, status: to };
	}

	private async fileNote(
		id: string,
		record: NoteRecord,
		userId: string,
	): Promise<string> {
		const sameMeeting = await this.sameMeeting(id, userId);
		if (sameMeeting) {
			const activityId = await this.filedElsewhere(id, userId, sameMeeting);
			if (activityId) return activityId;
		}

		const claimed = await this.db.incomingMeetingNote.updateMany({
			where: {
				id,
				mailboxUserId: userId,
				status: {
					in: [
						IncomingMeetingNoteStatus.NEW,
						IncomingMeetingNoteStatus.IGNORED,
					],
				},
			},
			data: {
				status: IncomingMeetingNoteStatus.FILED,
				filedById: userId,
				filedAt: new Date(),
			},
		});
		if (claimed.count === 0) await this.conflict(id, userId);

		const note = await this.db.incomingMeetingNote.findUniqueOrThrow({
			where: { id },
			select: {
				title: true,
				body: true,
				docUrl: true,
				heldAt: true,
				calendarEventId: true,
			},
		});

		try {
			const readForTodos = await this.db.agentTask.count({
				where: { kind: "note-actions", subject: id },
			});
			const { activityId } = await this.notes.importNotes(
				{
					...record,
					title: note.title,
					notes: notesBody(note.body, note.docUrl),
					source: "GEMINI",
					occurredAt: note.heldAt.toISOString(),
					calendarEventId: note.calendarEventId ?? undefined,
				},
				userId,
				{ readForFollowUps: readForTodos === 0 },
			);

			await this.db.$transaction([
				this.db.incomingMeetingNote.update({
					where: { id },
					data: { activityId },
				}),
				this.db.todoSuggestion.updateMany({
					where: { incomingMeetingNoteId: id },
					data: {
						contactId: record.contactId ?? null,
						companyId: record.companyId ?? null,
					},
				}),
			]);

			if (sameMeeting) {
				await this.db.incomingMeetingNote.updateMany({
					where: { ...sameMeeting, status: IncomingMeetingNoteStatus.NEW },
					data: { status: IncomingMeetingNoteStatus.DUPLICATE },
				});
			}

			return activityId;
		} catch (error) {
			await this.db.incomingMeetingNote.update({
				where: { id },
				data: {
					status: IncomingMeetingNoteStatus.NEW,
					filedById: null,
					filedAt: null,
				},
			});
			throw error;
		}
	}

	private async sameMeeting(
		id: string,
		userId: string,
	): Promise<Prisma.IncomingMeetingNoteWhereInput | null> {
		const note = await this.db.incomingMeetingNote.findFirst({
			where: { id, mailboxUserId: userId },
			select: { docUrl: true, calendarEventId: true },
		});
		if (!note) return null;

		const matches: Prisma.IncomingMeetingNoteWhereInput[] = [
			note.docUrl ? { docUrl: note.docUrl } : null,
			note.calendarEventId ? { calendarEventId: note.calendarEventId } : null,
		].filter((condition) => condition !== null);

		return matches.length > 0 ? { id: { not: id }, OR: matches } : null;
	}

	private async filedElsewhere(
		id: string,
		userId: string,
		sameMeeting: Prisma.IncomingMeetingNoteWhereInput,
	): Promise<string | null> {
		const twin = await this.db.incomingMeetingNote.findFirst({
			where: {
				...sameMeeting,
				status: IncomingMeetingNoteStatus.FILED,
				activityId: { not: null },
			},
			select: { activityId: true },
		});
		if (!twin?.activityId) return null;

		const settled = await this.db.incomingMeetingNote.updateMany({
			where: {
				id,
				mailboxUserId: userId,
				status: {
					in: [
						IncomingMeetingNoteStatus.NEW,
						IncomingMeetingNoteStatus.IGNORED,
						IncomingMeetingNoteStatus.DUPLICATE,
					],
				},
			},
			data: { status: IncomingMeetingNoteStatus.DUPLICATE },
		});
		if (settled.count === 0) await this.conflict(id, userId);

		return twin.activityId;
	}

	private async conflict(id: string, userId: string): Promise<never> {
		const exists = await this.db.incomingMeetingNote.count({
			where: { id, mailboxUserId: userId },
		});
		if (exists === 0) {
			throw new NotFoundException(`No meeting notes with id ${id}.`);
		}
		throw new ConflictException(
			"Someone already filed or changed these notes.",
		);
	}

	private async isDuplicate(
		note: ReceivedNote,
		calendarEventId: string | null,
	): Promise<boolean> {
		const sameMeeting: Prisma.IncomingMeetingNoteWhereInput[] = [
			note.docUrl ? { docUrl: note.docUrl } : null,
			calendarEventId ? { calendarEventId } : null,
		].filter((condition) => condition !== null);
		if (sameMeeting.length === 0) return false;

		const existing = await this.db.incomingMeetingNote.count({
			where: {
				mailboxUserId: note.mailboxUserId,
				gmailMessageId: { not: note.gmailMessageId },
				status: { not: IncomingMeetingNoteStatus.DUPLICATE },
				OR: sameMeeting,
			},
		});

		return existing > 0;
	}

	private async matchEvent(note: ReceivedNote): Promise<string | null> {
		const candidates = await this.db.calendarEvent.findMany({
			where: {
				startsAt: {
					gte: new Date(
						note.heldAt.getTime() -
							MEETING_NOTES.inbox.matchWindowHours * HOUR_MS,
					),
					lte: note.heldAt,
				},
				status: { not: "cancelled" },
				title: { not: null },
			},
			orderBy: { startsAt: "desc" },
			take: 50,
			select: { id: true, title: true },
		});

		const event = candidates.find(
			(candidate) =>
				candidate.title && titlesMatch(note.title, candidate.title),
		);

		return event?.id ?? null;
	}
}
