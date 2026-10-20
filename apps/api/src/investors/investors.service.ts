import type { Db, Prisma } from "@crm/db";
import { addInvestors, investorResearchRunsToday } from "@crm/db/investors";
import {
	INVESTOR_STAGES,
	INVESTORS,
	parseInvestorFit,
	parseInvestorProfile,
} from "@crm/validation/investors";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { decimalFromCents, fromCents, toCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import type {
	FundraiseOutput,
	FundraiseSaveInput,
	InvestorImportInput,
	InvestorList,
	InvestorListInput,
	InvestorRow,
	InvestorStageInput,
} from "./investors.contracts";

const INVESTOR_SELECT = {
	id: true,
	name: true,
	kind: true,
	firm: true,
	website: true,
	linkedinUrl: true,
	email: true,
	location: true,
	stages: true,
	sectors: true,
	chequeMin: true,
	chequeMax: true,
	chequeCurrency: true,
	thesis: true,
	notes: true,
	source: true,
	sourceDetail: true,
	stage: true,
	stageChangedAt: true,
	fitScore: true,
	fit: true,
	researchedAt: true,
} as const;

type InvestorSelected = Prisma.InvestorGetPayload<{
	select: typeof INVESTOR_SELECT;
}>;

const ORDER_BY = {
	fit: [{ fitScore: { sort: "desc", nulls: "last" } }, { name: "asc" }],
	name: [{ name: "asc" }],
	newest: [{ createdAt: "desc" }, { name: "asc" }],
} satisfies Record<
	InvestorListInput["sort"],
	Prisma.InvestorOrderByWithRelationInput[]
>;

function toFundraise(row: {
	id: string;
	name: string;
	company: string;
	summary: string | null;
	whyNow: string | null;
	traction: string | null;
	website: string | null;
	founderLinkedIn: string | null;
	roundSize: Prisma.Decimal | null;
	roundCurrency: string;
	profile: Prisma.JsonValue;
	researchDailyLimit: number;
	autoDiscover: boolean;
	weeklyMeetingTarget: number;
	updatedAt: Date;
}): FundraiseOutput {
	return {
		id: row.id,
		name: row.name,
		company: row.company,
		summary: row.summary,
		whyNow: row.whyNow,
		traction: row.traction,
		website: row.website,
		founderLinkedIn: row.founderLinkedIn,
		roundSizeCents: toCents(row.roundSize),
		roundCurrency: row.roundCurrency,
		profile: parseInvestorProfile(row.profile),
		researchDailyLimit: row.researchDailyLimit,
		autoDiscover: row.autoDiscover,
		weeklyMeetingTarget: row.weeklyMeetingTarget,
		updatedAt: row.updatedAt.toISOString(),
	};
}

function toRow(
	{ chequeMin, chequeMax, ...row }: InvestorSelected,
	researching: boolean,
): InvestorRow {
	return {
		...row,
		chequeMinCents: toCents(chequeMin),
		chequeMaxCents: toCents(chequeMax),
		stageChangedAt: row.stageChangedAt.toISOString(),
		fit: parseInvestorFit(row.fit),
		researchedAt: row.researchedAt?.toISOString() ?? null,
		researching,
	};
}

@Injectable()
export class InvestorsService {
	private readonly logger = new Logger(InvestorsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async fundraise(): Promise<FundraiseOutput | null> {
		const row = await this.db.fundraise.findFirst({
			orderBy: { createdAt: "asc" },
		});
		return row ? toFundraise(row) : null;
	}

	async save(
		input: FundraiseSaveInput,
		actingUserId: string,
	): Promise<FundraiseOutput> {
		const data = {
			name: input.name,
			company: input.company,
			summary: input.summary,
			whyNow: input.whyNow,
			traction: input.traction,
			website: input.website,
			founderLinkedIn: input.founderLinkedIn,
			roundSize: decimalFromCents(input.roundSizeCents),
			profile: input.profile,
			researchDailyLimit: input.researchDailyLimit,
			autoDiscover: input.autoDiscover,
			weeklyMeetingTarget: input.weeklyMeetingTarget,
			updatedById: actingUserId,
		};

		const id = input.id ?? (await this.fundraise())?.id;
		if (input.id) {
			const found = await this.db.fundraise.count({ where: { id: input.id } });
			if (found === 0) {
				throw new NotFoundException(`No fundraise with id ${input.id}.`);
			}
		}

		const row = id
			? await this.db.fundraise.update({ where: { id }, data })
			: await this.db.fundraise.create({
					data: { ...data, createdById: actingUserId },
				});

		this.logger.log({
			message: "Fundraise saved",
			fundraiseId: row.id,
			criteria: input.profile.criteria.length,
			userId: actingUserId,
		});

		return toFundraise(row);
	}

	async list(input: InvestorListInput): Promise<InvestorList> {
		const fundraise = await this.fundraise();
		const empty = Object.fromEntries(
			INVESTOR_STAGES.map((stage) => [stage, 0]),
		) as InvestorList["counts"];

		if (!fundraise) {
			return {
				items: [],
				total: 0,
				pageSize: INVESTORS.pageSize,
				counts: empty,
				research: { usedToday: 0, dailyLimit: 0 },
			};
		}

		const search = input.q
			? {
					OR: [
						{ name: { contains: input.q, mode: "insensitive" as const } },
						{ firm: { contains: input.q, mode: "insensitive" as const } },
						{ location: { contains: input.q, mode: "insensitive" as const } },
					],
				}
			: {};
		const base = {
			fundraiseId: fundraise.id,
			AND: [
				search,
				input.kinds.length > 0 ? { kind: { in: input.kinds } } : {},
			],
		} satisfies Prisma.InvestorWhereInput;
		const where = { ...base, stage: input.stage };

		const [rows, total, grouped, usedToday] = await Promise.all([
			this.db.investor.findMany({
				where,
				orderBy: ORDER_BY[input.sort],
				skip: (input.page - 1) * INVESTORS.pageSize,
				take: INVESTORS.pageSize,
				select: INVESTOR_SELECT,
			}),
			this.db.investor.count({ where }),
			this.db.investor.groupBy({
				by: ["stage"],
				where: base,
				_count: { _all: true },
			}),
			investorResearchRunsToday(this.db),
		]);

		const researching = new Set(
			(
				await this.db.agentTask.findMany({
					where: {
						kind: "investor-research",
						finishedAt: null,
						subject: { in: rows.map((row) => row.id) },
					},
					select: { subject: true },
				})
			).map((task) => task.subject),
		);

		return {
			items: rows.map((row) => toRow(row, researching.has(row.id))),
			total,
			pageSize: INVESTORS.pageSize,
			counts: {
				...empty,
				...Object.fromEntries(
					grouped.map((group) => [group.stage, group._count._all]),
				),
			},
			research: {
				usedToday,
				dailyLimit: fundraise.researchDailyLimit,
			},
		};
	}

	async setStage(
		input: InvestorStageInput,
		actingUserId: string,
	): Promise<{ updated: number }> {
		const { count } = await this.db.investor.updateMany({
			where: { id: { in: input.ids }, stage: { not: input.stage } },
			data: {
				stage: input.stage,
				stageChangedAt: new Date(),
				stageChangedById: actingUserId,
			},
		});

		this.logger.log({
			message: "Investors moved",
			stage: input.stage,
			updated: count,
			userId: actingUserId,
		});

		return { updated: count };
	}

	async importRows(
		input: InvestorImportInput,
		actingUserId: string,
	): Promise<{ created: number; duplicates: number; queued: number }> {
		const fundraise = await this.requireFundraise();

		const added = await addInvestors(this.db, {
			fundraiseId: fundraise.id,
			source: "IMPORT",
			createdById: actingUserId,
			investors: input.rows.map((row) => ({
				...row,
				chequeMin: fromCents(row.chequeMinCents),
				chequeMax: fromCents(row.chequeMaxCents),
				sourceDetail: input.label,
			})),
		});

		const queued = await this.agent.investorResearchRequested(
			fundraise.id,
			added.created.map((investor) => investor.id),
			`Score investors imported from ${input.label}`,
		);

		this.logger.log({
			message: "Investors imported",
			label: input.label,
			created: added.created.length,
			duplicates: added.duplicates.length,
			userId: actingUserId,
		});

		return {
			created: added.created.length,
			duplicates: added.duplicates.length,
			queued,
		};
	}

	async research(
		ids: readonly string[],
		actingUserId: string,
	): Promise<{ queued: number }> {
		const fundraise = await this.requireFundraise();
		const queued = await this.agent.investorResearchRequested(
			fundraise.id,
			ids,
			"A person asked to research and score these investors",
		);

		this.logger.log({
			message: "Investor research requested",
			requested: ids.length,
			queued,
			userId: actingUserId,
		});

		return { queued };
	}

	async findMore(actingUserId: string): Promise<{ queued: number }> {
		const fundraise = await this.requireFundraise();
		if (fundraise.profile.criteria.length === 0) {
			throw new BadRequestException(
				"Add the ideal investor profile first, so the agent knows who to look for.",
			);
		}

		const queued = await this.agent.investorDiscoveryRequested(
			fundraise.id,
			"A person asked the agent to find more investors",
		);

		this.logger.log({
			message: "Investor discovery requested",
			queued,
			userId: actingUserId,
		});

		return { queued: queued ? 1 : 0 };
	}

	private async requireFundraise(): Promise<FundraiseOutput> {
		const fundraise = await this.fundraise();
		if (!fundraise) {
			throw new BadRequestException(
				"Set up the fundraise profile first, on the Profile tab.",
			);
		}
		return fundraise;
	}
}
