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

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
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
	calendarEvent: { select: { title: true, startsAt: true } },
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

function recordOf(row: NoteRow): IncomingNote["record"] {
	const contact = row.activity?.contact;
	if (contact) {
		return {
			kind: "contact",
			id: contact.id,
			name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
		};
	}

	const company = row.activity?.company;
	return company
		? { kind: "company", id: company.id, name: company.name }
		: null;
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
		record: recordOf(row),
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

		const event = await this.matchEvent(note);
		const duplicate = await this.isDuplicate(note, event?.id ?? null);
		const read = {
			subject: note.subject,
			title: note.title,
			body: note.body,
			docUrl: note.docUrl,
			calendarEventId: event?.id ?? null,
			parserVersion: MEETING_NOTES.inbox.parserVersion,
			status: duplicate
				? IncomingMeetingNoteStatus.DUPLICATE
				: IncomingMeetingNoteStatus.NEW,
		};

		const created = await this.db.incomingMeetingNote.upsert({
			where: { gmailMessageId: note.gmailMessageId },
			create: { ...note, ...read, source: "GEMINI" },
			update: read,
			select: { id: true, status: true },
		});

		if (created.status !== IncomingMeetingNoteStatus.NEW || !event?.record) {
			return created.status;
		}

		await this.fileNote(created.id, event.record, note.mailboxUserId, null);

		this.logger.log({
			message: "Gemini notes filed on their meeting",
			noteId: created.id,
			calendarEventId: event.id,
			userId: note.mailboxUserId,
		});

		return IncomingMeetingNoteStatus.FILED;
	}

	async list(input: IncomingNotesInput): Promise<IncomingNotes> {
		const pageSize = MEETING_NOTES.inbox.pageSize;
		const where = {
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

		const activityId = await this.fileNote(
			input.id,
			record,
			actingUserId,
			actingUserId,
		);

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
			where: { id, status: from },
			data: { status: to },
		});
		if (updated.count === 0) await this.conflict(id);

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
		authorId: string,
		filedById: string | null,
	): Promise<string> {
		const claimed = await this.db.incomingMeetingNote.updateMany({
			where: {
				id,
				status: {
					in: [
						IncomingMeetingNoteStatus.NEW,
						IncomingMeetingNoteStatus.IGNORED,
					],
				},
			},
			data: {
				status: IncomingMeetingNoteStatus.FILED,
				filedById,
				filedAt: new Date(),
			},
		});
		if (claimed.count === 0) await this.conflict(id);

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
			const { activityId } = await this.notes.importNotes(
				{
					...record,
					title: note.title,
					notes: notesBody(note.body, note.docUrl),
					source: "GEMINI",
					occurredAt: note.heldAt.toISOString(),
					calendarEventId: note.calendarEventId ?? undefined,
				},
				authorId,
			);

			await this.db.incomingMeetingNote.update({
				where: { id },
				data: { activityId },
			});

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

	private async conflict(id: string): Promise<never> {
		const exists = await this.db.incomingMeetingNote.count({ where: { id } });
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
		const windowMs = MEETING_NOTES.inbox.duplicateWindowMinutes * MINUTE_MS;
		const sameMeeting: Prisma.IncomingMeetingNoteWhereInput[] = [
			note.docUrl ? { docUrl: note.docUrl } : null,
			calendarEventId ? { calendarEventId } : null,
			{
				title: { equals: note.title, mode: "insensitive" as const },
				mailboxUserId: { not: note.mailboxUserId },
				heldAt: {
					gte: new Date(note.heldAt.getTime() - windowMs),
					lte: new Date(note.heldAt.getTime() + windowMs),
				},
			},
		].filter((condition) => condition !== null);

		const existing = await this.db.incomingMeetingNote.count({
			where: {
				gmailMessageId: { not: note.gmailMessageId },
				status: { not: IncomingMeetingNoteStatus.DUPLICATE },
				OR: sameMeeting,
			},
		});

		return existing > 0;
	}

	private async matchEvent(
		note: ReceivedNote,
	): Promise<{ id: string; record: NoteRecord | null } | null> {
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
			select: {
				id: true,
				title: true,
				contactId: true,
				companyId: true,
				attendees: {
					where: { contactId: { not: null } },
					select: { contactId: true },
					take: 1,
				},
			},
		});

		const event = candidates.find(
			(candidate) =>
				candidate.title && titlesMatch(note.title, candidate.title),
		);
		if (!event) return null;

		const contactId = event.contactId ?? event.attendees[0]?.contactId ?? null;
		const record = contactId
			? { contactId }
			: event.companyId
				? { companyId: event.companyId }
				: null;

		return { id: event.id, record };
	}
}
