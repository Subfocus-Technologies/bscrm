import { ActivityType, type Db } from "@crm/db";
import { automatedAuthorFor } from "@crm/db/business-filing";
import type { ActivityMetaFields } from "@crm/validation/activity-meta";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { ActivityStampService } from "./activity-stamp.service";

export type EnrichmentEvent = {
	companyId?: string | null;
	contactId?: string | null;
	subject: string;
	body?: string | null;
	meta?: ActivityMetaFields;
};

@Injectable()
export class EnrichmentLogService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly stamp: ActivityStampService,
	) {}

	async record(event: EnrichmentEvent): Promise<string | null> {
		const author = await automatedAuthorFor(this.db, event);
		if (!author) return null;

		const activity = await this.db.activity.create({
			data: {
				type: ActivityType.ENRICHMENT,
				subject: event.subject,
				body: event.body ?? null,
				occurredAt: new Date(),
				companyId: event.companyId ?? null,
				contactId: event.contactId ?? null,
				createdById: author,
				meta: { ...event.meta, automated: true },
			},
			select: { id: true, createdAt: true },
		});

		await this.stamp.touch(
			{ companyId: event.companyId, contactId: event.contactId },
			activity.createdAt,
		);

		return activity.id;
	}
}

export function describeFilled(fields: readonly string[]): string | null {
	if (fields.length === 0) return null;
	if (fields.length === 1) return `Filled in ${fields[0]}.`;

	const last = fields[fields.length - 1];
	return `Filled in ${fields.slice(0, -1).join(", ")} and ${last}.`;
}
