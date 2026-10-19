import { type Db, type FieldEntity, Prisma as PrismaNamespace } from "@crm/db";
import { fileRecord } from "@crm/db/business-filing";
import { readReportingCurrency } from "@crm/db/settings";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import type { BulkResult } from "../crm/bulk";
import { decimalFromCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { BUSINESS_SUMMARY_SELECT, toBusinessSummary } from "./business-summary";
import type {
	BusinessCreateInput,
	BusinessFocusResult,
	BusinessMembershipInput,
	BusinessRecordInput,
	BusinessReorderInput,
	BusinessSummary,
	BusinessUpdateInput,
	RecordBusiness,
} from "./businesses.contracts";
import { BUSINESSES_CONFIG } from "./businesses-config";
import { requireBusiness } from "./require-business";

const SUMMARY = BUSINESS_SUMMARY_SELECT;

const REMOVED_BY_PERSON = "A person removed it from this business.";

type Membership = {
	requested: number;
	changed: number;
	eligible: number;
	unchanged: string;
};

function membershipResult(membership: Membership): BulkResult {
	const skipped = membership.eligible - membership.changed;

	return {
		requested: membership.requested,
		succeeded: membership.changed,
		skipped,
		failed: membership.requested - membership.eligible,
		message:
			membership.changed === 0 && skipped > 0 ? membership.unchanged : null,
	};
}

@Injectable()
export class BusinessesService {
	private readonly logger = new Logger(BusinessesService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(userId: string): Promise<BusinessSummary[]> {
		const businesses = await this.db.business.findMany({
			select: {
				...SUMMARY,
				createdAt: true,
				positions: { where: { userId }, select: { position: true } },
			},
			orderBy: [{ createdAt: "asc" }, { name: "asc" }],
		});

		return businesses
			.map((business, index) => ({
				business,
				rank: business.positions[0]?.position ?? businesses.length + index,
			}))
			.sort((left, right) => left.rank - right.rank)
			.map(({ business }) => toBusinessSummary(business));
	}

	async focus(userId: string): Promise<BusinessFocusResult> {
		const focus = await this.db.businessFocus.findUnique({
			where: { userId },
			select: { businessId: true },
		});

		return { businessId: focus?.businessId ?? null };
	}

	async setFocus(
		userId: string,
		businessId: string | null,
	): Promise<BusinessFocusResult> {
		if (!businessId) {
			await this.db.businessFocus.deleteMany({ where: { userId } });
			return { businessId: null };
		}

		await requireBusiness(this.db, businessId);

		await this.db.businessFocus.upsert({
			where: { userId },
			create: { userId, businessId },
			update: { businessId },
		});

		return { businessId };
	}

	async create(
		input: BusinessCreateInput,
		userId: string,
	): Promise<BusinessSummary> {
		await this.requireUniqueName(input.name);

		try {
			const business = await this.db.business.create({
				data: {
					name: input.name,
					tone: await this.nextTone(),
					createdById: userId,
					updatedById: userId,
				},
				select: SUMMARY,
			});

			this.logger.log({
				message: "Business added",
				businessId: business.id,
				userId,
			});

			return toBusinessSummary(business);
		} catch (error) {
			throw this.translate(error);
		}
	}

	async update(
		input: BusinessUpdateInput,
		userId: string,
	): Promise<BusinessSummary> {
		await this.requireUniqueName(input.name, input.id);

		try {
			const business = await this.db.business.update({
				where: { id: input.id },
				data: {
					name: input.name,
					playbook: input.playbook,
					monthlyTarget: decimalFromCents(input.monthlyTargetCents),
					monthlyTargetCurrency:
						input.monthlyTargetCents === null
							? null
							: await readReportingCurrency(this.db),
					updatedById: userId,
				},
				select: SUMMARY,
			});

			this.logger.log({
				message: "Business updated",
				businessId: business.id,
				userId,
			});

			return toBusinessSummary(business);
		} catch (error) {
			throw this.translate(error, input.id);
		}
	}

	async delete(id: string, userId: string): Promise<{ id: string }> {
		try {
			await this.db.business.delete({ where: { id }, select: { id: true } });
		} catch (error) {
			throw this.translate(error, id);
		}

		this.logger.log({ message: "Business removed", businessId: id, userId });

		return { id };
	}

	async reorder(
		input: BusinessReorderInput,
		userId: string,
	): Promise<BusinessSummary[]> {
		const ids = [...new Set(input.ids)];
		const found = await this.db.business.count({ where: { id: { in: ids } } });

		if (found !== ids.length || ids.length !== input.ids.length) {
			throw new BadRequestException(
				"That order names a business which does not exist.",
			);
		}

		await this.db.$transaction(
			ids.map((businessId, position) =>
				this.db.businessPosition.upsert({
					where: { userId_businessId: { userId, businessId } },
					create: { userId, businessId, position },
					update: { position },
				}),
			),
		);

		return this.list(userId);
	}

	async forRecord(input: BusinessRecordInput): Promise<RecordBusiness[]> {
		await this.requireRecord(input.entity, input.id);

		if (input.entity === "DEAL") {
			const deal = await this.db.deal.findUnique({
				where: { id: input.id },
				select: { business: { select: SUMMARY } },
			});
			return deal?.business
				? [{ ...toBusinessSummary(deal.business), source: null, reason: null }]
				: [];
		}

		const select = {
			source: true,
			reason: true,
			business: { select: SUMMARY },
		} as const;
		const orderBy = { business: { name: "asc" } } as const;

		const rows =
			input.entity === "COMPANY"
				? await this.db.companyBusiness.findMany({
						where: { companyId: input.id },
						select,
						orderBy,
					})
				: await this.db.contactBusiness.findMany({
						where: { contactId: input.id },
						select,
						orderBy,
					});

		return rows.map((row) => ({
			...toBusinessSummary(row.business),
			source: row.source,
			reason: row.reason,
		}));
	}

	async addRecords(
		input: BusinessMembershipInput,
		userId: string,
	): Promise<BulkResult> {
		await requireBusiness(this.db, input.businessId);

		const ids = [...new Set(input.ids)];
		const existing = await this.existingRecordIds(input.entity, ids);
		const changed = await this.add(
			input.entity,
			existing,
			input.businessId,
			userId,
		);

		this.logger.log({
			message: "Records added to business",
			entity: input.entity,
			businessId: input.businessId,
			count: changed,
			userId,
		});

		return membershipResult({
			requested: ids.length,
			changed,
			eligible: existing.length,
			unchanged: "They are already in that business.",
		});
	}

	async removeRecords(
		input: BusinessMembershipInput,
		userId: string,
	): Promise<BulkResult> {
		await requireBusiness(this.db, input.businessId);

		const ids = [...new Set(input.ids)];
		const existing = await this.existingRecordIds(input.entity, ids);
		const changed = await this.remove(
			input.entity,
			existing,
			input.businessId,
			userId,
		);

		this.logger.log({
			message: "Records removed from business",
			entity: input.entity,
			businessId: input.businessId,
			count: changed,
			userId,
		});

		return membershipResult({
			requested: ids.length,
			changed,
			eligible: existing.length,
			unchanged: "None of them were in that business.",
		});
	}

	private async add(
		entity: FieldEntity,
		ids: string[],
		businessId: string,
		addedById: string,
	): Promise<number> {
		if (ids.length === 0) return 0;

		if (entity === "DEAL") {
			const { count } = await this.db.deal.updateMany({
				where: {
					id: { in: ids },
					OR: [{ businessId: null }, { businessId: { not: businessId } }],
				},
				data: { businessId },
			});
			return count;
		}

		let filed = 0;
		for (const id of ids) {
			const entries = await this.db.$transaction((tx) =>
				fileRecord(tx, {
					record:
						entity === "COMPANY"
							? { kind: "company", id }
							: { kind: "contact", id },
					businessId,
					source: "MANUAL",
					reason: null,
					addedById,
				}),
			);
			if (entries.length > 0) filed += 1;
		}

		return filed;
	}

	private async remove(
		entity: FieldEntity,
		ids: string[],
		businessId: string,
		decidedById: string,
	): Promise<number> {
		if (ids.length === 0) return 0;

		if (entity === "DEAL") {
			const { count } = await this.db.deal.updateMany({
				where: { id: { in: ids }, businessId },
				data: { businessId: null },
			});
			return count;
		}

		const dismissed = {
			status: "DISMISSED",
			reason: REMOVED_BY_PERSON,
			decidedById,
			decidedAt: new Date(),
		} as const;

		return this.db.$transaction(async (tx) => {
			if (entity === "COMPANY") {
				const members = await tx.companyBusiness.findMany({
					where: { companyId: { in: ids }, businessId },
					select: { companyId: true },
				});
				await tx.companyBusiness.deleteMany({
					where: { companyId: { in: ids }, businessId },
				});
				for (const { companyId } of members) {
					await tx.businessSuggestion.upsert({
						where: { businessId_companyId: { businessId, companyId } },
						create: { businessId, companyId, ...dismissed },
						update: dismissed,
					});
				}
				return members.length;
			}

			const members = await tx.contactBusiness.findMany({
				where: { contactId: { in: ids }, businessId },
				select: { contactId: true },
			});
			await tx.contactBusiness.deleteMany({
				where: { contactId: { in: ids }, businessId },
			});
			for (const { contactId } of members) {
				await tx.businessSuggestion.upsert({
					where: { businessId_contactId: { businessId, contactId } },
					create: { businessId, contactId, ...dismissed },
					update: dismissed,
				});
			}
			return members.length;
		});
	}

	private async existingRecordIds(
		entity: FieldEntity,
		ids: string[],
	): Promise<string[]> {
		const where = { id: { in: ids } };
		const select = { id: true } as const;

		const rows =
			entity === "COMPANY"
				? await this.db.company.findMany({ where, select })
				: entity === "CONTACT"
					? await this.db.contact.findMany({ where, select })
					: await this.db.deal.findMany({ where, select });

		return rows.map((row) => row.id);
	}

	private async requireRecord(entity: FieldEntity, id: string): Promise<void> {
		const [found] = await this.existingRecordIds(entity, [id]);

		if (!found) {
			throw new NotFoundException(`No ${entity.toLowerCase()} with id ${id}.`);
		}
	}

	private async nextTone(): Promise<number> {
		const used = await this.db.business.groupBy({
			by: ["tone"],
			_count: { _all: true },
		});
		const counts = Array.from(
			{ length: BUSINESSES_CONFIG.tones.count },
			(_, tone) => used.find((group) => group.tone === tone)?._count._all ?? 0,
		);

		return counts.indexOf(Math.min(...counts));
	}

	private async requireUniqueName(name: string, exceptId?: string) {
		const taken = await this.db.business.findFirst({
			where: {
				name: { equals: name, mode: "insensitive" },
				id: exceptId ? { not: exceptId } : undefined,
			},
			select: { id: true },
		});

		if (taken) {
			throw new ConflictException(
				`There is already a business called "${name}".`,
			);
		}
	}

	private translate(cause: unknown, id?: string): never {
		if (cause instanceof PrismaNamespace.PrismaClientKnownRequestError) {
			if (cause.code === "P2002") {
				throw new ConflictException(
					"There is already a business with that name.",
				);
			}
			if (cause.code === "P2025") {
				throw new NotFoundException(`No business with id ${id}.`);
			}
		}
		throw cause;
	}
}
