import { z } from "zod";

export const LESSONS = {
	budget: 2,
	textMaxLength: 300,
	maxPerReview: 5,
	maxRetiredPerReview: 5,
	maxInPrompt: 40,
	removedInPrompt: 15,
	listPageSize: 25,
	evidenceMaxChars: 12_000,
} as const;

export const LESSON_SCOPES = ["PERSONAL", "TEAM"] as const;

export const lessonText = z
	.string()
	.trim()
	.min(1, "Write the lesson first.")
	.max(
		LESSONS.textMaxLength,
		`Keep a lesson to ${LESSONS.textMaxLength} characters.`,
	);

export const lessonSource = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("task-run"), id: z.string().trim().min(1) }),
	z.object({ kind: z.literal("reply"), id: z.string().trim().min(1) }),
]);

export type LessonSource = z.infer<typeof lessonSource>;

export function lessonSourceKey(source: LessonSource): string {
	return `${source.kind}:${source.id}`;
}

export function parseLessonSourceKey(key: string | null): LessonSource | null {
	const split = key?.indexOf(":") ?? -1;
	if (!key || split < 1) return null;

	const parsed = lessonSource.safeParse({
		kind: key.slice(0, split),
		id: key.slice(split + 1),
	});
	return parsed.success ? parsed.data : null;
}
