import type { Db, Prisma, WeeklyPriorityStatus } from "@crm/db";
import { nextWorkspaceWeekStart, workspaceWeekStart } from "@crm/db/day";
import { WORKSPACE_TIME_ZONE } from "@crm/db/settings";
import { PRIORITIES } from "@crm/validation/priorities";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	PrioritiesWeekInput,
	PriorityCreateInput,
	PriorityOutput,
	PriorityUpdateInput,
} from "./priorities.contracts";

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_TIME = "T09:00:00.000Z";

const PRIORITY_SELECT = {
	id: true,
	title: true,
	deliverable: true,
	status: true,
	weekStart: true,
	dueAt: true,
	completedAt: true,
	updatedAt: true,
	owner: { select: { id: true, name: true } },
	createdBy: { select: { name: true } },
	updatedBy: { select: { name: true } },
} satisfies Prisma.WeeklyPrioritySelect;

type PriorityRow = Prisma.WeeklyPriorityGetPayload<{
	select: typeof PRIORITY_SELECT;
}>;

function toPriority(row: PriorityRow, week: Date): PriorityOutput {
	return {
		id: row.id,
		title: row.title,
		deliverable: row.deliverable,
		status: row.status,
		dueAt: row.dueAt?.toISOString() ?? null,
		completedAt: row.completedAt?.toISOString() ?? null,
		carriedOver: row.status !== "DONE" && row.weekStart < week,
		owner: row.owner,
		createdBy: row.createdBy.name,
		updatedBy: row.updatedBy.name,
		updatedAt: row.updatedAt.toISOString(),
	};
}

function weekOf(day: string | undefined): Date {
	return workspaceWeekStart(
		day ? new Date(`${day}T12:00:00.000Z`) : new Date(),
	);
}

function dayLabel(at: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: WORKSPACE_TIME_ZONE,
	}).format(at);
}

function dueAtOf(day: string | null | undefined): Date | null | undefined {
	if (day === undefined) return undefined;
	return day ? new Date(`${day}${DUE_TIME}`) : null;
}

function statusChange(
	status: WeeklyPriorityStatus | undefined,
	startedAt: Date | null,
): Prisma.WeeklyPriorityUncheckedUpdateInput {
	if (status === "DONE") {
		return {
			status,
			startedAt: startedAt ?? new Date(),
			completedAt: new Date(),
		};
	}
	if (status === "ONGOING") {
		return { status, startedAt: startedAt ?? new Date(), completedAt: null };
	}
	if (status === "PRIORITY") {
		return { status, startedAt: null, completedAt: null };
	}
	return {};
}

@Injectable()
export class PrioritiesService {
	private readonly logger = new Logger(PrioritiesService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async week(input: PrioritiesWeekInput) {
		const start = weekOf(input.week);
		const next = nextWorkspaceWeekStart(start);
		const owner = input.ownerId ? { ownerId: input.ownerId } : {};

		const open = (status: WeeklyPriorityStatus) => ({
			...owner,
			status,
			weekStart: { lt: next },
		});
		const done = {
			...owner,
			status: "DONE" as const,
			completedAt: { gte: start, lt: next },
		};

		const [priority, ongoing, finished] = await Promise.all([
			this.column(open("PRIORITY"), start),
			this.column(open("ONGOING"), start),
			this.column(done, start),
		]);

		return {
			week: dayLabel(start),
			thisWeek: dayLabel(workspaceWeekStart()),
			previousWeek: dayLabel(new Date(start.getTime() - 3 * DAY_MS)),
			nextWeek: dayLabel(next),
			columns: { PRIORITY: priority, ONGOING: ongoing, DONE: finished },
		};
	}

	async create(input: PriorityCreateInput, actingUserId: string) {
		const week = weekOf(input.week);
		const row = await this.db.weeklyPriority.create({
			data: {
				title: input.title,
				deliverable: input.deliverable || null,
				dueAt: dueAtOf(input.dueDate) ?? null,
				ownerId: input.ownerId ?? null,
				weekStart: week,
				createdById: actingUserId,
				updatedById: actingUserId,
			},
			select: PRIORITY_SELECT,
		});

		this.logger.log({
			message: "Weekly priority added",
			priorityId: row.id,
			ownerId: input.ownerId ?? null,
			userId: actingUserId,
		});
		return toPriority(row, week);
	}

	async update(input: PriorityUpdateInput, actingUserId: string) {
		const existing = await this.db.weeklyPriority.findUnique({
			where: { id: input.id },
			select: { startedAt: true },
		});
		if (!existing) {
			throw new NotFoundException(`No priority with id ${input.id}.`);
		}

		const row = await this.db.weeklyPriority.update({
			where: { id: input.id },
			data: {
				title: input.title,
				deliverable:
					input.deliverable === undefined
						? undefined
						: input.deliverable || null,
				dueAt: dueAtOf(input.dueDate),
				ownerId: input.ownerId,
				updatedById: actingUserId,
				...statusChange(input.status, existing.startedAt),
			},
			select: PRIORITY_SELECT,
		});

		this.logger.log({
			message: "Weekly priority updated",
			priorityId: row.id,
			status: input.status,
			ownerId: input.ownerId,
			userId: actingUserId,
		});
		return toPriority(row, workspaceWeekStart());
	}

	async remove(id: string, actingUserId: string): Promise<{ id: string }> {
		const { count } = await this.db.weeklyPriority.deleteMany({
			where: { id },
		});
		if (count === 0) throw new NotFoundException(`No priority with id ${id}.`);

		this.logger.log({
			message: "Weekly priority removed",
			priorityId: id,
			userId: actingUserId,
		});
		return { id };
	}

	private async column(where: Prisma.WeeklyPriorityWhereInput, week: Date) {
		const [rows, total] = await Promise.all([
			this.db.weeklyPriority.findMany({
				where,
				orderBy: [
					{ dueAt: { sort: "asc", nulls: "last" } },
					{ createdAt: "asc" },
				],
				take: PRIORITIES.columnMax,
				select: PRIORITY_SELECT,
			}),
			this.db.weeklyPriority.count({ where }),
		]);

		return { items: rows.map((row) => toPriority(row, week)), total };
	}
}
