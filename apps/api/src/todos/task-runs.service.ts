import { ActivityType, type Db, type Prisma } from "@crm/db";
import { RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import { WORKSPACE_TIME_ZONE } from "@crm/db/settings";
import {
	parseTaskRunAction,
	TASK_RUNS,
	type TaskRunActionPayload,
} from "@crm/validation/task-runs";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import { CalendarClient } from "../google/calendar.client";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { CalendarSlotsService } from "./calendar-slots.service";
import { EmailReplyService } from "./email-reply.service";
import type {
	TaskRunApproveInput,
	TaskRunOutput,
	TaskRunStartInput,
	TaskRunsListInput,
} from "./task-runs.contracts";

const MINUTE_MS = 60_000;
const DUE_TIME = "T09:00:00.000Z";
const OPEN = ["QUEUED", "WORKING"] as const;

const RUN_SELECT = {
	id: true,
	taskId: true,
	status: true,
	instructions: true,
	summary: true,
	deliverable: true,
	createdAt: true,
	task: { select: { subject: true } },
	actions: {
		orderBy: { position: "asc" },
		select: {
			id: true,
			why: true,
			status: true,
			result: true,
			payload: true,
			decidedBy: { select: { name: true } },
		},
	},
} satisfies Prisma.TaskRunSelect;

type RunRow = Prisma.TaskRunGetPayload<{ select: typeof RUN_SELECT }>;

@Injectable()
export class TaskRunsService {
	private readonly logger = new Logger(TaskRunsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly replies: EmailReplyService,
		private readonly tokens: MailboxTokenService,
		private readonly calendar: CalendarClient,
		private readonly slots: CalendarSlotsService,
	) {}

	async start(input: TaskRunStartInput, actingUserId: string) {
		const task = await this.db.activity.findFirst({
			where: { id: input.taskId, type: ActivityType.TASK },
			select: { id: true, contactId: true, companyId: true, dealId: true },
		});
		if (!task) throw new NotFoundException(`No to-do with id ${input.taskId}.`);

		const open = await this.db.taskRun.findFirst({
			where: { taskId: task.id, status: { in: [...OPEN] } },
			select: { id: true },
		});
		if (open && !(await this.hasStopped(open.id))) return { id: open.id };

		const run = await this.db.taskRun.create({
			data: {
				taskId: task.id,
				userId: actingUserId,
				instructions: input.instructions || null,
			},
			select: { id: true },
		});

		await this.agent.taskRunRequested({
			taskRunId: run.id,
			contactId: task.contactId,
			companyId: task.companyId,
			dealId: task.dealId,
		});

		this.logger.log({
			message: "Task run started",
			taskRunId: run.id,
			taskId: task.id,
			userId: actingUserId,
		});
		return run;
	}

	async get(id: string, actingUserId: string): Promise<TaskRunOutput> {
		const run = await this.db.taskRun.findFirst({
			where: { id, userId: actingUserId },
			select: RUN_SELECT,
		});
		if (!run) throw new NotFoundException(`No run with id ${id}.`);

		const [failure, canSendEmail, canAddToCalendar] = await Promise.all([
			this.failureOf(run),
			this.tokens.canSendGmail(actingUserId),
			this.tokens.canWriteCalendar(actingUserId),
		]);

		return {
			id: run.id,
			taskId: run.taskId,
			taskTitle: run.task.subject ?? "Untitled",
			status: failure ? "FAILED" : run.status,
			instructions: run.instructions,
			summary: run.summary,
			deliverable: run.deliverable,
			failure,
			createdAt: run.createdAt.toISOString(),
			actions: run.actions.map((action) => ({
				id: action.id,
				why: action.why,
				status: action.status,
				result: action.result,
				payload: parseTaskRunAction(action.payload),
				decidedBy: action.decidedBy?.name ?? null,
			})),
			canSendEmail,
			canAddToCalendar,
		};
	}

	async list(input: TaskRunsListInput, actingUserId: string) {
		const pageSize = TASK_RUNS.listPageSize;
		const where: Prisma.TaskRunWhereInput = {
			userId: actingUserId,
			status: "AWAITING_APPROVAL",
		};

		const [rows, total] = await Promise.all([
			this.db.taskRun.findMany({
				where,
				orderBy: { createdAt: "desc" },
				skip: (input.page - 1) * pageSize,
				take: pageSize,
				select: {
					id: true,
					taskId: true,
					summary: true,
					createdAt: true,
					task: { select: { subject: true } },
					_count: {
						select: { actions: { where: { status: "PROPOSED" } } },
					},
				},
			}),
			this.db.taskRun.count({ where }),
		]);

		return {
			items: rows.map((row) => ({
				id: row.id,
				taskId: row.taskId,
				taskTitle: row.task.subject ?? "Untitled",
				summary: row.summary,
				waiting: row._count.actions,
				createdAt: row.createdAt.toISOString(),
			})),
			total,
			pageSize,
		};
	}

	async statuses(taskIds: readonly string[], actingUserId: string) {
		const runs = await this.db.taskRun.findMany({
			where: { taskId: { in: [...taskIds] }, userId: actingUserId },
			orderBy: { createdAt: "desc" },
			distinct: ["taskId"],
			select: {
				id: true,
				taskId: true,
				status: true,
				_count: {
					select: { actions: { where: { status: "PROPOSED" } } },
				},
			},
		});

		return Promise.all(
			runs.map(async (run) => ({
				taskId: run.taskId,
				runId: run.id,
				status: (await this.hasStopped(run.id, run.status))
					? ("FAILED" as const)
					: run.status,
				waiting: run._count.actions,
			})),
		);
	}

	async approve(input: TaskRunApproveInput, actingUserId: string) {
		const action = await this.claim(
			input.actionId,
			actingUserId,
			input.payload,
		);

		try {
			const result = await this.execute(action, input.payload, actingUserId);
			if (result === null) {
				return { id: action.id, status: "RUNNING" as const, result: null };
			}

			await this.settle(action, "DONE", result);
			this.logger.log({
				message: "Task run action carried out",
				actionId: action.id,
				kind: input.payload.kind,
				userId: actingUserId,
			});
			return { id: action.id, status: "DONE" as const, result };
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			await this.settle(action, "FAILED", reason);
			this.logger.warn({
				message: "Task run action failed",
				actionId: action.id,
				kind: input.payload.kind,
				userId: actingUserId,
			});
			return { id: action.id, status: "FAILED" as const, result: reason };
		}
	}

	async skip(actionId: string, actingUserId: string) {
		const { count } = await this.db.taskRunAction.updateMany({
			where: {
				id: actionId,
				status: { in: ["PROPOSED", "FAILED"] },
				run: { userId: actingUserId },
			},
			data: {
				status: "SKIPPED",
				decidedById: actingUserId,
				decidedAt: new Date(),
			},
		});
		if (count === 0) {
			throw new ConflictException("This step is already decided.");
		}

		const action = await this.db.taskRunAction.findUniqueOrThrow({
			where: { id: actionId },
			select: { id: true, runId: true, status: true, result: true },
		});
		await this.finishIfSettled(action.runId);
		return { id: action.id, status: action.status, result: action.result };
	}

	private async claim(
		actionId: string,
		actingUserId: string,
		payload: TaskRunActionPayload,
	) {
		const { count } = await this.db.taskRunAction.updateMany({
			where: {
				id: actionId,
				status: { in: ["PROPOSED", "FAILED"] },
				run: { userId: actingUserId },
			},
			data: {
				status: "RUNNING",
				payload,
				decidedById: actingUserId,
				decidedAt: new Date(),
			},
		});
		const action = await this.db.taskRunAction.findFirst({
			where: { id: actionId, run: { userId: actingUserId } },
			select: {
				id: true,
				runId: true,
				kind: true,
				run: {
					select: {
						task: {
							select: {
								contactId: true,
								companyId: true,
								dealId: true,
								dueAt: true,
							},
						},
					},
				},
			},
		});
		if (!action) throw new NotFoundException(`No step with id ${actionId}.`);
		if (count === 0) {
			throw new ConflictException("This step is already decided.");
		}
		if (action.kind !== payload.kind) {
			await this.settle(action, "FAILED", "The step changed type.");
			throw new BadRequestException("A step cannot change its type.");
		}
		return action;
	}

	private async execute(
		action: Awaited<ReturnType<TaskRunsService["claim"]>>,
		payload: TaskRunActionPayload,
		actingUserId: string,
	): Promise<string | null> {
		if (payload.kind === "EMAIL") {
			const sent = await this.replies.sendEmail(payload, actingUserId);
			return `Sent to ${sent.toEmail}.`;
		}

		if (payload.kind === "EVENT") {
			const token = await this.tokens.calendarWriteToken(actingUserId);
			if (token.outcome !== "ok") {
				throw new BadRequestException(
					"Allow the CRM to add events to your Google Calendar first.",
				);
			}

			const durationMs = payload.minutes * MINUTE_MS;
			const slot = payload.startsAt
				? {
						start: new Date(payload.startsAt),
						end: new Date(new Date(payload.startsAt).getTime() + durationMs),
					}
				: await this.slots.find(
						token.accessToken,
						action.run.task.dueAt,
						durationMs,
					);
			const event = await this.calendar.insertEvent(token.accessToken, {
				summary: payload.title,
				description: payload.description,
				start: slot.start,
				end: slot.end,
				timeZone: WORKSPACE_TIME_ZONE,
				attendees: payload.attendees,
			});
			if (event.outcome !== "ok") {
				throw new BadRequestException(
					`Google Calendar did not add it: ${event.reason}.`,
				);
			}
			return event.data.htmlLink ?? `Added for ${slot.start.toISOString()}.`;
		}

		if (payload.kind === "TODO") {
			await this.db.activity.create({
				data: {
					type: ActivityType.TASK,
					subject: payload.title,
					occurredAt: new Date(),
					dueAt: payload.dueDate
						? new Date(`${payload.dueDate}${DUE_TIME}`)
						: null,
					contactId: action.run.task.contactId,
					companyId: action.run.task.companyId,
					dealId: action.run.task.dealId,
					createdById: actingUserId,
					meta: { fromTaskRun: action.runId },
				},
			});
			return "Added to your to-dos.";
		}

		await this.agent.pullRequestApproved(action.id);
		return null;
	}

	private async settle(
		action: { id: string; runId: string },
		status: "DONE" | "FAILED",
		result: string,
	): Promise<void> {
		await this.db.taskRunAction.update({
			where: { id: action.id },
			data: { status, result },
		});
		await this.finishIfSettled(action.runId);
	}

	private async finishIfSettled(runId: string): Promise<void> {
		const waiting = await this.db.taskRunAction.count({
			where: { runId, status: { in: ["PROPOSED", "RUNNING", "FAILED"] } },
		});
		if (waiting > 0) return;

		await this.db.taskRun.updateMany({
			where: { id: runId, status: "AWAITING_APPROVAL" },
			data: { status: "FINISHED", finishedAt: new Date() },
		});
	}

	private async failureOf(run: RunRow): Promise<string | null> {
		if (run.status !== "QUEUED" && run.status !== "WORKING") return null;

		const task = await this.db.agentTask.findFirst({
			where: { kind: "task-run", subject: run.id },
			orderBy: { createdAt: "desc" },
			select: { finishedAt: true, outcome: true },
		});
		if (!task?.finishedAt) return null;

		return task.outcome === RETIRED_OUTCOME || !task.outcome
			? "The agent did not finish. Try again."
			: task.outcome;
	}

	private async hasStopped(
		runId: string,
		status: string = "WORKING",
	): Promise<boolean> {
		if (status !== "QUEUED" && status !== "WORKING") return false;

		const task = await this.db.agentTask.findFirst({
			where: { kind: "task-run", subject: runId },
			orderBy: { createdAt: "desc" },
			select: { finishedAt: true },
		});
		return task?.finishedAt != null;
	}
}
