import { type Db, Prisma as PrismaNamespace } from "@crm/db";
import { ruleDomain, ruleMailbox } from "@crm/db/business-filing";
import { BUSINESS_FILING } from "@crm/validation/business-filing";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	BusinessRuleAddInput,
	BusinessRuleSummary,
} from "./businesses.contracts";
import { requireBusiness } from "./require-business";

const RULE_SELECT = {
	id: true,
	businessId: true,
	kind: true,
	value: true,
} as const;

function normalizeRuleValue(input: BusinessRuleAddInput): string {
	const value =
		input.kind === "EMAIL_DOMAIN"
			? ruleDomain(input.value)
			: ruleMailbox(input.value);

	if (!value) {
		throw new BadRequestException(
			input.kind === "EMAIL_DOMAIN"
				? "That is not a domain. Type it like knightfrank.com."
				: "That is not an email address.",
		);
	}

	return value;
}

@Injectable()
export class BusinessRulesService {
	private readonly logger = new Logger(BusinessRulesService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(): Promise<BusinessRuleSummary[]> {
		return this.db.businessRule.findMany({
			select: RULE_SELECT,
			orderBy: [{ kind: "asc" }, { value: "asc" }],
		});
	}

	async add(
		input: BusinessRuleAddInput,
		userId: string,
	): Promise<BusinessRuleSummary> {
		await requireBusiness(this.db, input.businessId);
		const value = normalizeRuleValue(input);

		const count = await this.db.businessRule.count({
			where: { businessId: input.businessId },
		});
		if (count >= BUSINESS_FILING.rules.maxPerBusiness) {
			throw new BadRequestException(
				`A business can have ${BUSINESS_FILING.rules.maxPerBusiness} rules at most.`,
			);
		}

		try {
			const rule = await this.db.businessRule.create({
				data: {
					businessId: input.businessId,
					kind: input.kind,
					value,
					createdById: userId,
				},
				select: RULE_SELECT,
			});

			this.logger.log({
				message: "Business rule added",
				ruleId: rule.id,
				businessId: rule.businessId,
				kind: rule.kind,
				userId,
			});

			return rule;
		} catch (error) {
			if (
				error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				throw new ConflictException("That rule is already there.");
			}
			throw error;
		}
	}

	async remove(id: string, userId: string): Promise<{ id: string }> {
		const { count } = await this.db.businessRule.deleteMany({ where: { id } });
		if (count === 0) throw new NotFoundException(`No rule with id ${id}.`);

		this.logger.log({ message: "Business rule removed", ruleId: id, userId });

		return { id };
	}
}
