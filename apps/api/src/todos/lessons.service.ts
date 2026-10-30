import type { Db, Prisma } from "@crm/db";
import { LESSONS } from "@crm/validation/lessons";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { LessonAddInput, LessonsListInput } from "./lessons.contracts";

function visibleTo(userId: string): Prisma.AgentLessonWhereInput {
	return {
		retiredAt: null,
		OR: [{ scope: "TEAM" }, { scope: "PERSONAL", createdById: userId }],
	};
}

@Injectable()
export class LessonsService {
	private readonly logger = new Logger(LessonsService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(input: LessonsListInput, actingUserId: string) {
		const pageSize = LESSONS.listPageSize;
		const where = visibleTo(actingUserId);

		const [rows, total] = await Promise.all([
			this.db.agentLesson.findMany({
				where,
				orderBy: { createdAt: "desc" },
				skip: (input.page - 1) * pageSize,
				take: pageSize,
				select: {
					id: true,
					scope: true,
					origin: true,
					text: true,
					createdAt: true,
					createdBy: { select: { name: true } },
				},
			}),
			this.db.agentLesson.count({ where }),
		]);

		return {
			items: rows.map((row) => ({
				id: row.id,
				scope: row.scope,
				origin: row.origin,
				text: row.text,
				author: row.createdBy?.name ?? null,
				createdAt: row.createdAt.toISOString(),
			})),
			total,
			pageSize,
		};
	}

	async add(input: LessonAddInput, actingUserId: string) {
		const lesson = await this.db.agentLesson.create({
			data: {
				scope: input.scope,
				origin: "TAUGHT",
				text: input.text,
				createdById: actingUserId,
			},
			select: { id: true },
		});

		this.logger.log({
			message: "Lesson taught",
			lessonId: lesson.id,
			userId: actingUserId,
		});
		return lesson;
	}

	async remove(id: string, actingUserId: string) {
		const { count } = await this.db.agentLesson.updateMany({
			where: { ...visibleTo(actingUserId), id },
			data: { retiredAt: new Date(), retiredById: actingUserId },
		});
		if (count === 0) throw new NotFoundException(`No lesson with id ${id}.`);

		this.logger.log({
			message: "Lesson removed",
			lessonId: id,
			userId: actingUserId,
		});
		return { id };
	}
}
