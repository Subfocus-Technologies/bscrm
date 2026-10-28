import {
	ActivityType,
	type Db,
	type Prisma,
	TodoSuggestionStatus,
} from "@crm/db";
import { workspaceDayStart } from "@crm/db/day";
import { WORKSPACE_TIME_ZONE } from "@crm/db/settings";
import { TODOS, type TodoSuggestionView } from "@crm/validation/todos";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { CalendarClient } from "../google/calendar.client";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { firstFreeSlot, type Interval } from "./free-slot";
import type {
	AddTodoInput,
	SuggestionOutput,
	SuggestionsInput,
} from "./todos.contracts";

const DAY_MS = 24 * 60 * 60 * 1000;

const VIEW_STATUSES = {
	PROPOSED: [TodoSuggestionStatus.PROPOSED],
	IGNORED: [TodoSuggestionStatus.IGNORED],
} satisfies Record<TodoSuggestionView, TodoSuggestionStatus[]>;

function suggestionSelect(userId: string) {
	return {
		id: true,
		kind: true,
		title: true,
		detail: true,
		dueAt: true,
		quote: true,
		status: true,
		createdAt: true,
		decidedAt: true,
		taskId: true,
		contact: { select: { id: true, firstName: true, lastName: true } },
		company: { select: { id: true, name: true } },
		emailThread: {
			select: {
				id: true,
				subject: true,
				lastMessageAt: true,
				messages: {
					where: { direction: "INBOUND" },
					orderBy: { sentAt: "desc" },
					take: 1,
					select: { fromName: true, fromEmail: true },
				},
				replies: {
					where: { userId, status: "DRAFT" },
					take: 1,
					select: { id: true },
				},
			},
		},
		calendarEvent: { select: { id: true, title: true, startsAt: true } },
		incomingMeetingNote: { select: { id: true, title: true, heldAt: true } },
	} satisfies Prisma.TodoSuggestionSelect;
}

type SuggestionRow = Prisma.TodoSuggestionGetPayload<{
	select: ReturnType<typeof suggestionSelect>;
}>;

function sourceOf(row: SuggestionRow): SuggestionOutput["source"] {
	if (row.emailThread) {
		const from = row.emailThread.messages[0];
		return {
			kind: "email",
			emailThreadId: row.emailThread.id,
			subject: row.emailThread.subject,
			from: from ? (from.fromName ?? from.fromEmail) : null,
			lastMessageAt: row.emailThread.lastMessageAt.toISOString(),
			hasDraft: row.emailThread.replies.length > 0,
		};
	}
	if (row.incomingMeetingNote) {
		return {
			kind: "note",
			incomingMeetingNoteId: row.incomingMeetingNote.id,
			title: row.incomingMeetingNote.title,
			heldAt: row.incomingMeetingNote.heldAt.toISOString(),
		};
	}
	if (row.calendarEvent) {
		return {
			kind: "meeting",
			calendarEventId: row.calendarEvent.id,
			title: row.calendarEvent.title,
			startsAt: row.calendarEvent.startsAt.toISOString(),
		};
	}
	return null;
}

function recordOf(row: SuggestionRow): SuggestionOutput["record"] {
	if (row.contact) {
		return {
			kind: "contact",
			id: row.contact.id,
			name: [row.contact.firstName, row.contact.lastName]
				.filter(Boolean)
				.join(" "),
		};
	}
	if (row.company) {
		return { kind: "company", id: row.company.id, name: row.company.name };
	}
	return null;
}

function toSuggestion(row: SuggestionRow): SuggestionOutput {
	return {
		id: row.id,
		kind: row.kind,
		title: row.title,
		detail: row.detail,
		dueAt: row.dueAt?.toISOString() ?? null,
		quote: row.quote,
		status: row.status,
		createdAt: row.createdAt.toISOString(),
		decidedAt: row.decidedAt?.toISOString() ?? null,
		taskId: row.taskId,
		source: sourceOf(row),
		record: recordOf(row),
	};
}

type ClaimedSuggestion = {
	id: string;
	title: string;
	detail: string | null;
	quote: string;
	dueAt: Date | null;
	contactId: string | null;
	companyId: string | null;
};

function endOfDay(at: Date): Date {
	return new Date(workspaceDayStart(at).getTime() + DAY_MS);
}

function taskBody(item: { detail: string | null; quote: string }): string {
	return [item.detail, `"${item.quote}"`].filter(Boolean).join("\n\n");
}

@Injectable()
export class TodosService {
	private readonly logger = new Logger(TodosService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly tokens: MailboxTokenService,
		private readonly calendar: CalendarClient,
	) {}

	async suggestions(input: SuggestionsInput, actingUserId: string) {
		const pageSize = TODOS.suggestions.pageSize;
		const mine = { userId: actingUserId };
		const where: Prisma.TodoSuggestionWhereInput = {
			...mine,
			status: { in: VIEW_STATUSES[input.view] },
		};
		const orderBy: Prisma.TodoSuggestionOrderByWithRelationInput[] =
			input.view === "PROPOSED"
				? [{ createdAt: "desc" }, { position: "asc" }]
				: [{ decidedAt: { sort: "desc", nulls: "last" } }];

		const [rows, total, grouped, canAddToCalendar] = await Promise.all([
			this.db.todoSuggestion.findMany({
				where,
				orderBy,
				skip: (input.page - 1) * pageSize,
				take: pageSize,
				select: suggestionSelect(actingUserId),
			}),
			this.db.todoSuggestion.count({ where }),
			this.db.todoSuggestion.groupBy({
				by: ["status"],
				where: mine,
				_count: { _all: true },
			}),
			this.tokens.canWriteCalendar(actingUserId),
		]);

		const countOf = (statuses: TodoSuggestionStatus[]) =>
			grouped
				.filter((group) => statuses.includes(group.status))
				.reduce((sum, group) => sum + group._count._all, 0);

		return {
			items: rows.map(toSuggestion),
			total,
			pageSize,
			canAddToCalendar,
			counts: {
				PROPOSED: countOf(VIEW_STATUSES.PROPOSED),
				IGNORED: countOf(VIEW_STATUSES.IGNORED),
			},
		};
	}

	async add(input: AddTodoInput, actingUserId: string) {
		const contact = input.contactId
			? await this.db.contact.findUnique({
					where: { id: input.contactId },
					select: { id: true, companyId: true },
				})
			: null;
		if (input.contactId && !contact) {
			throw new NotFoundException(`No contact with id ${input.contactId}.`);
		}

		const task = await this.db.activity.create({
			data: {
				type: ActivityType.TASK,
				subject: input.title,
				body: input.notes || null,
				occurredAt: new Date(),
				dueAt: input.dueAt ? new Date(input.dueAt) : null,
				contactId: contact?.id ?? null,
				companyId: input.companyId ?? contact?.companyId ?? null,
				createdById: actingUserId,
			},
			select: { id: true },
		});

		this.logger.log({
			message: "To-do added by hand",
			taskId: task.id,
			userId: actingUserId,
		});
		return task;
	}

	async accept(id: string, actingUserId: string) {
		const result = await this.decide(
			id,
			actingUserId,
			TodoSuggestionStatus.ACCEPTED,
			(item) => ({ dueAt: item.dueAt }),
		);

		this.logger.log({
			message: "To-do suggestion added as a task",
			suggestionId: id,
			taskId: result.taskId,
			userId: actingUserId,
		});
		return result;
	}

	async done(id: string, actingUserId: string) {
		const result = await this.decide(
			id,
			actingUserId,
			TodoSuggestionStatus.DONE,
			(item) => ({ dueAt: item.dueAt, completedAt: new Date() }),
		);

		this.logger.log({
			message: "To-do suggestion marked done",
			suggestionId: id,
			taskId: result.taskId,
			userId: actingUserId,
		});
		return result;
	}

	async schedule(id: string, actingUserId: string) {
		const item = await this.db.todoSuggestion.findFirst({
			where: { id, userId: actingUserId },
			select: {
				status: true,
				title: true,
				detail: true,
				quote: true,
				dueAt: true,
			},
		});
		if (!item) throw new NotFoundException(`No suggestion with id ${id}.`);
		if (item.status !== TodoSuggestionStatus.PROPOSED) {
			throw new ConflictException("This suggestion is already decided.");
		}

		const token = await this.tokens.calendarWriteToken(actingUserId);
		if (token.outcome !== "ok") {
			throw new BadRequestException(
				"Allow the CRM to add events to your Google Calendar first.",
			);
		}

		const slot = await this.freeSlot(token.accessToken, item.dueAt);
		const event = await this.calendar.insertEvent(token.accessToken, {
			summary: item.title,
			description: taskBody(item),
			start: slot.start,
			end: slot.end,
			timeZone: WORKSPACE_TIME_ZONE,
		});
		if (event.outcome !== "ok") {
			this.logger.warn({
				message: "Calendar event was not created",
				suggestionId: id,
				outcome: event.outcome,
				userId: actingUserId,
			});
			throw new BadRequestException(
				`Google Calendar did not add it: ${event.reason}.`,
			);
		}

		const result = await this.decide(
			id,
			actingUserId,
			TodoSuggestionStatus.ACCEPTED,
			() => ({
				dueAt: slot.start,
				meta: { calendarEventUrl: event.data.htmlLink ?? null },
			}),
		);

		this.logger.log({
			message: "To-do suggestion added to the calendar",
			suggestionId: id,
			taskId: result.taskId,
			userId: actingUserId,
		});
		return {
			...result,
			startsAt: slot.start.toISOString(),
			endsAt: slot.end.toISOString(),
			eventUrl: event.data.htmlLink ?? null,
		};
	}

	private async freeSlot(
		accessToken: string,
		dueAt: Date | null,
	): Promise<Interval> {
		const from = new Date();
		const until = new Date(from.getTime() + TODOS.calendar.searchMs);
		const busy = await this.calendar.busyTimes(accessToken, {
			timeMin: from,
			timeMax: until,
			timeZone: WORKSPACE_TIME_ZONE,
		});
		if (busy.outcome !== "ok") {
			throw new BadRequestException(
				`Google Calendar did not say when you are free: ${busy.reason}.`,
			);
		}

		const taken = busy.data.map((time) => ({
			start: new Date(time.start),
			end: new Date(time.end),
		}));
		const deadline = dueAt && dueAt > from ? endOfDay(dueAt) : until;
		const slot =
			firstFreeSlot({ busy: taken, from, until: deadline }) ??
			firstFreeSlot({ busy: taken, from, until });
		if (!slot) {
			throw new BadRequestException(
				"Your calendar has no free half hour in working hours for the next two weeks.",
			);
		}
		return slot;
	}

	private async decide(
		id: string,
		actingUserId: string,
		status: TodoSuggestionStatus,
		task: (item: ClaimedSuggestion) => {
			dueAt: Date | null;
			completedAt?: Date;
			meta?: Record<string, string | null>;
		},
	) {
		return this.db.$transaction(async (tx) => {
			const item = await this.claim(tx, id, actingUserId, status);
			const shape = task(item);

			const created = await tx.activity.create({
				data: {
					type: ActivityType.TASK,
					subject: item.title,
					body: taskBody(item),
					occurredAt: new Date(),
					dueAt: shape.dueAt,
					completedAt: shape.completedAt ?? null,
					companyId: item.companyId,
					contactId: item.contactId,
					createdById: actingUserId,
					meta: { fromTodoSuggestion: item.id, ...shape.meta },
				},
				select: { id: true },
			});

			await tx.todoSuggestion.update({
				where: { id: item.id },
				data: { taskId: created.id },
			});

			return { id: item.id, status, taskId: created.id };
		});
	}

	async ignore(id: string, actingUserId: string) {
		await this.db.$transaction((tx) =>
			this.claim(tx, id, actingUserId, TodoSuggestionStatus.IGNORED),
		);

		this.logger.log({
			message: "To-do suggestion ignored",
			suggestionId: id,
			userId: actingUserId,
		});
		return { id, status: TodoSuggestionStatus.IGNORED, taskId: null };
	}

	async restore(id: string, actingUserId: string) {
		const { count } = await this.db.todoSuggestion.updateMany({
			where: {
				id,
				userId: actingUserId,
				status: TodoSuggestionStatus.IGNORED,
			},
			data: { status: TodoSuggestionStatus.PROPOSED, decidedAt: null },
		});
		if (count === 0) {
			throw new ConflictException(
				"Only an ignored suggestion can be put back.",
			);
		}

		this.logger.log({
			message: "To-do suggestion put back",
			suggestionId: id,
			userId: actingUserId,
		});
		return { id, status: TodoSuggestionStatus.PROPOSED, taskId: null };
	}

	private async claim(
		tx: Prisma.TransactionClient,
		id: string,
		actingUserId: string,
		status: TodoSuggestionStatus,
	) {
		const { count } = await tx.todoSuggestion.updateMany({
			where: {
				id,
				userId: actingUserId,
				status: TodoSuggestionStatus.PROPOSED,
			},
			data: { status, decidedAt: new Date() },
		});

		const item = await tx.todoSuggestion.findFirst({
			where: { id, userId: actingUserId },
			select: {
				id: true,
				title: true,
				detail: true,
				quote: true,
				dueAt: true,
				contactId: true,
				companyId: true,
			},
		});
		if (!item) throw new NotFoundException(`No suggestion with id ${id}.`);
		if (count === 0) {
			throw new ConflictException("This suggestion is already decided.");
		}
		return item;
	}
}
