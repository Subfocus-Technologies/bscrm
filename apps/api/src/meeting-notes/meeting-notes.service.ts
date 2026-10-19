import { ActivityType, type Db } from "@crm/db";
import { RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import { meetingNotesMeta } from "@crm/validation/meeting-notes";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	FollowUpDecideInput,
	FollowUps,
	MeetingNotesImportInput,
} from "./meeting-notes.contracts";

const DEFAULT_TITLE = "Meeting notes";

const SOURCE_LABEL = {
	GEMINI: "Gemini",
	CLUELY: "Cluely",
	OTHER: "pasted",
} as const;

function parseDate(value: string | undefined): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function taskBody(item: {
	detail: string | null;
	owner: string | null;
	quote: string;
}): string {
	return [
		item.detail,
		item.owner ? `Owner in the notes: ${item.owner}` : null,
		`From the meeting notes: “${item.quote}”`,
	]
		.filter(Boolean)
		.join("\n\n");
}

@Injectable()
export class MeetingNotesService {
	private readonly logger = new Logger(MeetingNotesService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly stamp: ActivityStampService,
	) {}

	async importNotes(
		input: MeetingNotesImportInput,
		actingUserId: string,
	): Promise<{ activityId: string }> {
		const records = await this.resolveRecords(input);

		const activity = await this.db.activity.create({
			data: {
				type: ActivityType.MEETING,
				subject:
					input.title?.trim() ||
					`${DEFAULT_TITLE} (${SOURCE_LABEL[input.source]})`,
				body: input.notes,
				occurredAt: parseDate(input.occurredAt) ?? new Date(),
				...records,
				createdById: actingUserId,
				meta: {
					meetingNotes: true,
					source: input.source,
					calendarEventId: input.calendarEventId ?? null,
				},
			},
			select: { id: true, createdAt: true },
		});

		await this.stamp.touch(records, activity.createdAt);
		await this.agent.meetingNotesImported({
			activityId: activity.id,
			...records,
		});

		this.logger.log({
			message: "Meeting notes imported",
			activityId: activity.id,
			source: input.source,
			userId: actingUserId,
		});

		return { activityId: activity.id };
	}

	async followUps(activityId: string): Promise<FollowUps> {
		await this.requireNotes(activityId);

		const [items, task] = await Promise.all([
			this.db.meetingFollowUp.findMany({
				where: { activityId },
				orderBy: [{ position: "asc" }, { createdAt: "asc" }],
			}),
			this.db.agentTask.findFirst({
				where: { kind: "meeting-notes", subject: activityId },
				orderBy: { createdAt: "desc" },
				select: { finishedAt: true, outcome: true },
			}),
		]);

		const reading = !task?.finishedAt
			? task
				? "reading"
				: "ready"
			: task.outcome === RETIRED_OUTCOME
				? "failed"
				: "ready";

		return {
			reading,
			outcome: task?.outcome ?? null,
			items: items.map((item) => ({
				id: item.id,
				kind: item.kind,
				title: item.title,
				detail: item.detail,
				owner: item.owner,
				dueAt: item.dueAt?.toISOString() ?? null,
				quote: item.quote,
				status: item.status,
				taskId: item.taskId,
			})),
		};
	}

	async decide(
		input: FollowUpDecideInput,
		actingUserId: string,
	): Promise<{
		id: string;
		status: "ACCEPTED" | "DISMISSED";
		taskId: string | null;
	}> {
		const result = await this.db.$transaction(async (tx) => {
			const item = await tx.meetingFollowUp.findUnique({
				where: { id: input.id },
				include: {
					activity: {
						select: { companyId: true, contactId: true, dealId: true },
					},
				},
			});
			if (!item)
				throw new NotFoundException(`No follow-up with id ${input.id}.`);
			if (item.status !== "PROPOSED") {
				throw new ConflictException("Someone already decided this one.");
			}

			const decided = { decidedById: actingUserId, decidedAt: new Date() };

			if (input.decision === "dismiss") {
				await tx.meetingFollowUp.update({
					where: { id: item.id },
					data: { status: "DISMISSED", ...decided },
				});
				return { id: item.id, status: "DISMISSED" as const, taskId: null };
			}

			const task = await tx.activity.create({
				data: {
					type: ActivityType.TASK,
					subject: item.title,
					body: taskBody(item),
					occurredAt: new Date(),
					dueAt: item.dueAt,
					companyId: item.activity.companyId,
					contactId: item.activity.contactId,
					dealId: item.activity.dealId,
					createdById: actingUserId,
					meta: { fromMeetingNotes: item.activityId },
				},
				select: { id: true },
			});

			await tx.meetingFollowUp.update({
				where: { id: item.id },
				data: { status: "ACCEPTED", taskId: task.id, ...decided },
			});

			return { id: item.id, status: "ACCEPTED" as const, taskId: task.id };
		});

		this.logger.log({
			message: "Meeting follow-up decided",
			followUpId: input.id,
			status: result.status,
			userId: actingUserId,
		});

		return result;
	}

	async reread(
		activityId: string,
		actingUserId: string,
	): Promise<{ queued: boolean }> {
		const activity = await this.requireNotes(activityId);

		const open = await this.db.agentTask.count({
			where: { kind: "meeting-notes", subject: activityId, finishedAt: null },
		});
		if (open > 0) return { queued: false };

		await this.agent.meetingNotesImported({ activityId, ...activity });

		this.logger.log({
			message: "Meeting notes queued to read again",
			activityId,
			userId: actingUserId,
		});

		return { queued: true };
	}

	private async requireNotes(activityId: string) {
		const activity = await this.db.activity.findUnique({
			where: { id: activityId },
			select: { meta: true, companyId: true, contactId: true, dealId: true },
		});

		if (!activity || !meetingNotesMeta.parse(activity.meta)) {
			throw new NotFoundException(`No meeting notes with id ${activityId}.`);
		}

		return {
			companyId: activity.companyId,
			contactId: activity.contactId,
			dealId: activity.dealId,
		};
	}

	private async resolveRecords(input: MeetingNotesImportInput) {
		if (input.dealId) {
			const deal = await this.db.deal.findUnique({
				where: { id: input.dealId },
				select: { companyId: true },
			});
			if (!deal)
				throw new NotFoundException(`No deal with id ${input.dealId}.`);
			return {
				dealId: input.dealId,
				companyId: deal.companyId,
				contactId: input.contactId ?? null,
			};
		}

		if (input.contactId) {
			const contact = await this.db.contact.findUnique({
				where: { id: input.contactId },
				select: { companyId: true },
			});
			if (!contact) {
				throw new NotFoundException(`No contact with id ${input.contactId}.`);
			}
			return {
				contactId: input.contactId,
				companyId: contact.companyId,
				dealId: null,
			};
		}

		if (!input.companyId) {
			throw new BadRequestException(
				"Meeting notes have to be about a company, a contact or a deal.",
			);
		}

		const company = await this.db.company.count({
			where: { id: input.companyId },
		});
		if (company === 0) {
			throw new NotFoundException(`No company with id ${input.companyId}.`);
		}

		return { companyId: input.companyId, contactId: null, dealId: null };
	}
}
