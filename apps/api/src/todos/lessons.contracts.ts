import { LESSON_SCOPES, lessonText } from "@crm/validation/lessons";
import { z } from "zod";

export const lessonsListInput = z.object({
	page: z.number().int().min(1).default(1),
});

export type LessonsListInput = z.infer<typeof lessonsListInput>;

export const lessonsListOutput = z.object({
	items: z.array(
		z.object({
			id: z.string(),
			scope: z.enum(LESSON_SCOPES),
			origin: z.enum(["LEARNED", "TAUGHT"]),
			text: z.string(),
			author: z.string().nullable(),
			createdAt: z.string(),
		}),
	),
	total: z.number(),
	pageSize: z.number(),
});

export const lessonAddInput = z.object({
	text: lessonText,
	scope: z.enum(LESSON_SCOPES),
});

export type LessonAddInput = z.infer<typeof lessonAddInput>;

export const lessonIdInput = z.object({ id: z.string().min(1) });

export const lessonIdOutput = z.object({ id: z.string() });
