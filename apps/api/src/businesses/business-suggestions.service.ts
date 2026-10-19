import { type Db, Prisma as PrismaNamespace } from "@crm/db";
import { businessFilingRunsToday, fileRecord } from "@crm/db/business-filing";
import {
	BUSINESS_FILING_LIMIT,
	readBusinessFilingDailyLimit,
	writeBusinessFilingDailyLimit,
} from "@crm/db/settings";
import {
	BUSINESS_FILING,
	parseBusinessFilingEvidence,
} from "@crm/validation/business-filing";
import {
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import { BUSINESS_SUMMARY_SELECT, toBusinessSummary } from "./business-summary";
import type {
	BusinessSuggestionDecideInput,
	BusinessSuggestionListInput,
	BusinessSuggestionSummary,
} from "./businesses.contracts";
import { BUSINESSES_CONFIG } from "./businesses-config";

const SUGGESTION_SELECT = {
	id: true,
	reason: true,
	evidence: true,
	createdAt: true,
	business: { select: BUSINESS_SUMMARY_SELECT },
	company: { select: { id: true, name: true } },
	contact: { select: { id: true, firstName: true, lastName: true } },
} as const;

type SuggestionRow = PrismaNamespace.BusinessSuggestionGetPayload<{
	select: typeof SUGGESTION_SELECT;
}>;

const UNFILED_COMPANY: PrismaNamespace.CompanyWhereInput = {
	archivedAt: null,
	businesses: { none: {} },
};

const UNFILED_CONTACT: PrismaNamespace.ContactWhereInput = {
	archivedAt: null,
	businesses: { none: {} },
};

function serialize(row: SuggestionRow): BusinessSuggestionSummary {
	const record = row.company
		? { kind: "company" as const, id: row.company.id, name: row.company.name }
		: {
				kind: "contact" as const,
				id: row.contact?.id ?? "",
				name: [row.contact?.firstName, row.contact?.lastName]
					.filter(Boolean)
					.join(" "),
			};

	return {
		id: row.id,
		business: toBusinessSummary(row.business),
		record,
		reason: row.reason,
		evidence: parseBusinessFilingEvidence(row.evidence),
		createdAt: row.createdAt.toISOString(),
	};
}

@Injectable()
export class BusinessSuggestionsService {
	private readonly logger = new Logger(BusinessSuggestionsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async list(input: BusinessSuggestionListInput): Promise<{
		rows: BusinessSuggestionSummary[];
		total: number;
	}> {
		const where: PrismaNamespace.BusinessSuggestionWhereInput = {
			status: "PROPOSED",
			companyId:
				input.entity === "COMPANY"
					? (input.recordId ?? { not: null })
					: undefined,
			contactId:
				input.entity === "CONTACT"
					? (input.recordId ?? { not: null })
					: undefined,
		};

		const [rows, total] = await Promise.all([
			this.db.businessSuggestion.findMany({
				where,
				select: SUGGESTION_SELECT,
				orderBy: [{ createdAt: "desc" }, { id: "asc" }],
				take: BUSINESSES_CONFIG.suggestions.pageSize,
			}),
			this.db.businessSuggestion.count({ where }),
		]);

		return { rows: rows.map(serialize), total };
	}

	async decide(
		input: BusinessSuggestionDecideInput,
		userId: string,
	): Promise<{ id: string; status: "ACCEPTED" | "DISMISSED" }> {
		const status = input.decision === "accept" ? "ACCEPTED" : "DISMISSED";

		await this.db.$transaction(async (tx) => {
			const suggestion = await tx.businessSuggestion.findUnique({
				where: { id: input.id },
				select: {
					status: true,
					businessId: true,
					companyId: true,
					contactId: true,
					reason: true,
				},
			});

			if (!suggestion) {
				throw new NotFoundException(`No suggestion with id ${input.id}.`);
			}
			if (suggestion.status !== "PROPOSED") {
				throw new ConflictException("Someone already decided this one.");
			}

			await tx.businessSuggestion.update({
				where: { id: input.id },
				data: { status, decidedById: userId, decidedAt: new Date() },
			});

			if (status === "DISMISSED") return;

			const record = suggestion.companyId
				? { kind: "company" as const, id: suggestion.companyId }
				: suggestion.contactId
					? { kind: "contact" as const, id: suggestion.contactId }
					: null;
			if (!record) return;

			await fileRecord(tx, {
				record,
				businessId: suggestion.businessId,
				source: "MANUAL",
				reason: `Suggested by the agent: ${suggestion.reason}`,
				addedById: userId,
			});
		});

		this.logger.log({
			message: "Business suggestion decided",
			suggestionId: input.id,
			status,
			userId,
		});

		return { id: input.id, status };
	}

	async unfiled(): Promise<{ companies: number; contacts: number }> {
		const [companies, contacts] = await Promise.all([
			this.db.company.count({ where: UNFILED_COMPANY }),
			this.db.contact.count({ where: UNFILED_CONTACT }),
		]);

		return { companies, contacts };
	}

	async sortUnfiled(
		userId: string,
	): Promise<{ queued: number; remaining: number }> {
		const businesses = await this.db.business.count();
		if (businesses === 0) {
			throw new ConflictException(
				"Add a business first, so there is somewhere to file records.",
			);
		}

		const limit = BUSINESS_FILING.sweep.maxRecords;
		const companies = await this.db.company.findMany({
			where: UNFILED_COMPANY,
			select: { id: true },
			orderBy: [{ lastActivityAt: { sort: "desc", nulls: "last" } }],
			take: limit,
		});
		const contacts = await this.db.contact.findMany({
			where: UNFILED_CONTACT,
			select: { id: true },
			orderBy: [{ lastActivityAt: { sort: "desc", nulls: "last" } }],
			take: Math.max(0, limit - companies.length),
		});

		const queued = await this.agent.businessFilingRequested(
			[
				...companies.map((company) => ({ companyId: company.id })),
				...contacts.map((contact) => ({ contactId: contact.id })),
			],
			"A person asked to sort records that are in no business yet",
		);

		const { companies: leftCompanies, contacts: leftContacts } =
			await this.unfiled();
		const remaining = Math.max(
			0,
			leftCompanies + leftContacts - companies.length - contacts.length,
		);

		this.logger.log({
			message: "Unfiled records queued for sorting",
			queued,
			remaining,
			userId,
		});

		return { queued, remaining };
	}

	async filingLimit(): Promise<{
		limit: number;
		usedToday: number;
		max: number;
	}> {
		const [limit, usedToday] = await Promise.all([
			readBusinessFilingDailyLimit(this.db),
			businessFilingRunsToday(this.db),
		]);

		return { limit, usedToday, max: BUSINESS_FILING_LIMIT.max };
	}

	async setFilingLimit(limit: number, userId: string) {
		const saved = await writeBusinessFilingDailyLimit(this.db, limit);

		this.logger.log({
			message: "Business filing limit changed",
			limit: saved,
			userId,
		});

		return this.filingLimit();
	}
}
