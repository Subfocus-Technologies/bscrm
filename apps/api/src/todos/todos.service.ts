import {
	ActivityType,
	type Db,
	type Prisma,
	TodoSuggestionStatus,
} from "@crm/db";
import { TODOS, type TodoSuggestionView } from "@crm/validation/todos";
import {
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { SuggestionOutput, SuggestionsInput } from "./todos.contracts";

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

function taskBody(item: { detail: string | null; quote: string }): string {
	return [item.detail, `"${item.quote}"`].filter(Boolean).join("\n\n");
}

@Injectable()
export class TodosService {
	private readonly logger = new Logger(TodosService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

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

		const [rows, total, grouped] = await Promise.all([
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
		]);

		const countOf = (statuses: TodoSuggestionStatus[]) =>
			grouped
				.filter((group) => statuses.includes(group.status))
				.reduce((sum, group) => sum + group._count._all, 0);

		return {
			items: rows.map(toSuggestion),
			total,
			pageSize,
			counts: {
				PROPOSED: countOf(VIEW_STATUSES.PROPOSED),
				IGNORED: countOf(VIEW_STATUSES.IGNORED),
			},
		};
	}

	async accept(id: string, actingUserId: string) {
		const result = await this.db.$transaction(async (tx) => {
			const item = await this.claim(
				tx,
				id,
				actingUserId,
				TodoSuggestionStatus.ACCEPTED,
			);

			const task = await tx.activity.create({
				data: {
					type: ActivityType.TASK,
					subject: item.title,
					body: taskBody(item),
					occurredAt: new Date(),
					dueAt: item.dueAt,
					companyId: item.companyId,
					contactId: item.contactId,
					createdById: actingUserId,
					meta: { fromTodoSuggestion: item.id },
				},
				select: { id: true },
			});

			await tx.todoSuggestion.update({
				where: { id: item.id },
				data: { taskId: task.id },
			});

			return {
				id: item.id,
				status: TodoSuggestionStatus.ACCEPTED,
				taskId: task.id,
			};
		});

		this.logger.log({
			message: "To-do suggestion added as a task",
			suggestionId: id,
			taskId: result.taskId,
			userId: actingUserId,
		});
		return result;
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
