import type { Db, Prisma } from "@crm/db";
import { RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import {
	OPPORTUNITIES,
	type OpportunityKind,
} from "@crm/validation/opportunities";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	OpportunitiesListInput,
	OpportunityOutput,
	OpportunityUpdateInput,
} from "./opportunities.contracts";

const OPPORTUNITY_SELECT = {
	id: true,
	kind: true,
	title: true,
	organiser: true,
	url: true,
	summary: true,
	quote: true,
	location: true,
	startsAt: true,
	deadlineAt: true,
	status: true,
	decidedAt: true,
	business: { select: { id: true, name: true } },
	owner: { select: { id: true, name: true } },
	decidedBy: { select: { name: true } },
} satisfies Prisma.OpportunitySelect;

type OpportunityRow = Prisma.OpportunityGetPayload<{
	select: typeof OPPORTUNITY_SELECT;
}>;

function toOpportunity(row: OpportunityRow): OpportunityOutput {
	return {
		id: row.id,
		kind: row.kind,
		title: row.title,
		organiser: row.organiser,
		url: row.url,
		summary: row.summary,
		quote: row.quote,
		location: row.location,
		startsAt: row.startsAt?.toISOString() ?? null,
		deadlineAt: row.deadlineAt?.toISOString() ?? null,
		business: row.business,
		status: row.status,
		owner: row.owner,
		decidedBy: row.decidedBy?.name ?? null,
		decidedAt: row.decidedAt?.toISOString() ?? null,
	};
}

function stillOpen(now: Date): Prisma.OpportunityWhereInput[] {
	return [
		{ OR: [{ startsAt: null }, { startsAt: { gte: now } }] },
		{ OR: [{ deadlineAt: null }, { deadlineAt: { gte: now } }] },
	];
}

@Injectable()
export class OpportunitiesService {
	private readonly logger = new Logger(OpportunitiesService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async list(input: OpportunitiesListInput) {
		const pageSize = OPPORTUNITIES.list.pageSize;
		const now = new Date();
		const where: Prisma.OpportunityWhereInput = {
			kind: input.kind,
			status: input.view,
			AND: input.view === "SUGGESTED" ? stillOpen(now) : undefined,
		};

		const [rows, total, grouped, suggested, review] = await Promise.all([
			this.db.opportunity.findMany({
				where,
				orderBy: [
					{ deadlineAt: { sort: "asc", nulls: "last" } },
					{ startsAt: { sort: "asc", nulls: "last" } },
					{ createdAt: "desc" },
				],
				skip: (input.page - 1) * pageSize,
				take: pageSize,
				select: OPPORTUNITY_SELECT,
			}),
			this.db.opportunity.count({ where }),
			this.db.opportunity.groupBy({
				by: ["status"],
				where: { kind: input.kind },
				_count: { _all: true },
			}),
			this.db.opportunity.count({
				where: { kind: input.kind, status: "SUGGESTED", AND: stillOpen(now) },
			}),
			this.latestReview(input.kind),
		]);

		const countOf = (status: OpportunityRow["status"]) =>
			grouped.find((group) => group.status === status)?._count._all ?? 0;

		return {
			items: rows.map(toOpportunity),
			total,
			pageSize,
			counts: {
				SUGGESTED: suggested,
				PLANNED: countOf("PLANNED"),
				DONE: countOf("DONE"),
				DISMISSED: countOf("DISMISSED"),
			},
			review,
		};
	}

	async review(
		kind: OpportunityKind,
		actingUserId: string,
	): Promise<{ queued: boolean }> {
		const queued = await this.agent.opportunityReviewRequested(kind);

		this.logger.log({
			message: "Opportunity review requested",
			kind,
			queued,
			userId: actingUserId,
		});
		return { queued };
	}

	async update(
		input: OpportunityUpdateInput,
		actingUserId: string,
	): Promise<OpportunityOutput> {
		const found = await this.db.opportunity.findUnique({
			where: { id: input.id },
			select: { id: true },
		});
		if (!found) {
			throw new NotFoundException(`No opportunity with id ${input.id}.`);
		}

		const row = await this.db.opportunity.update({
			where: { id: input.id },
			data: {
				ownerId: input.ownerId,
				status: input.status,
				decidedById: input.status ? actingUserId : undefined,
				decidedAt: input.status ? new Date() : undefined,
			},
			select: OPPORTUNITY_SELECT,
		});

		this.logger.log({
			message: "Opportunity updated",
			opportunityId: input.id,
			status: input.status,
			userId: actingUserId,
		});
		return toOpportunity(row);
	}

	private async latestReview(kind: OpportunityKind) {
		const task = await this.db.agentTask.findFirst({
			where: { kind: "opportunity-review", subject: kind },
			orderBy: { createdAt: "desc" },
			select: {
				createdAt: true,
				finishedAt: true,
				leasedUntil: true,
				outcome: true,
			},
		});
		if (!task) return null;

		const state = task.finishedAt
			? task.outcome === RETIRED_OUTCOME
				? ("failed" as const)
				: ("finished" as const)
			: task.leasedUntil && task.leasedUntil.getTime() > Date.now()
				? ("running" as const)
				: ("waiting" as const);

		return {
			state,
			requestedAt: task.createdAt.toISOString(),
			finishedAt: task.finishedAt?.toISOString() ?? null,
			outcome: task.outcome,
		};
	}
}
