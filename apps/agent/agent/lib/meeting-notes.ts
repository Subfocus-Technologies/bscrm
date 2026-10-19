import { db } from "@crm/db";
import {
	MEETING_NOTES,
	type MeetingFollowUpItem,
	meetingFollowUpItem,
	meetingNotesMeta,
} from "@crm/validation/meeting-notes";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DUE_DAYS_AHEAD = 366;

export type ProposeOutcome = {
	saved: number;
	dropped: { title: string; reason: string }[];
};

function squash(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function readMeetingNotes(activityId: string) {
	const activity = await db.activity.findUnique({
		where: { id: activityId },
		select: {
			subject: true,
			body: true,
			occurredAt: true,
			createdAt: true,
			meta: true,
		},
	});

	if (!activity?.body || !meetingNotesMeta.parse(activity.meta)) return null;

	return {
		title: activity.subject,
		body: activity.body,
		heldAt: activity.occurredAt ?? activity.createdAt,
	};
}

export async function meetingNotesMarkdown(
	activityId: string,
): Promise<string> {
	const notes = await readMeetingNotes(activityId);
	if (!notes) return "";

	return [
		"**This is a meeting-notes task.** A person pasted notes from a meeting",
		"with this record. Turn them into follow-ups: to-dos (something a person",
		"agreed to do) and next steps (where the relationship goes from here).",
		"Call `propose_follow_ups` once with every item. Each item must quote the",
		"exact words in the notes it comes from, or it is dropped. Give a due date",
		"only when the notes say when; resolve words like 'next Friday' against",
		`the meeting date, ${notes.heldAt.toISOString().slice(0, 10)}. Never invent`,
		"a task the notes do not contain.",
		"",
		`## The notes — activity \`${activityId}\``,
		"",
		notes.title ? `### ${notes.title}` : "",
		"",
		notes.body,
	].join("\n");
}

function dueAtOf(
	item: MeetingFollowUpItem,
	heldAt: Date,
): Date | null | "invalid" {
	if (!item.dueDate) return null;

	const due = new Date(`${item.dueDate}T09:00:00.000Z`);
	if (Number.isNaN(due.getTime())) return "invalid";

	const earliest = heldAt.getTime() - DAY_MS;
	const latest = heldAt.getTime() + MAX_DUE_DAYS_AHEAD * DAY_MS;
	return due.getTime() < earliest || due.getTime() > latest ? "invalid" : due;
}

export async function proposeFollowUps(
	activityId: string,
	items: unknown[],
): Promise<ProposeOutcome> {
	const notes = await readMeetingNotes(activityId);
	if (!notes) {
		return {
			saved: 0,
			dropped: [
				{ title: "all", reason: "There are no meeting notes with that id." },
			],
		};
	}

	const haystack = squash(notes.body);
	const dropped: ProposeOutcome["dropped"] = [];
	const kept: (MeetingFollowUpItem & { dueAt: Date | null })[] = [];

	for (const raw of items.slice(0, MEETING_NOTES.followUps.maxItems)) {
		const parsed = meetingFollowUpItem.safeParse(raw);
		if (!parsed.success) {
			dropped.push({ title: "unreadable item", reason: parsed.error.message });
			continue;
		}

		const item = parsed.data;
		if (!haystack.includes(squash(item.quote))) {
			dropped.push({
				title: item.title,
				reason: "Its quote is not in the notes, word for word.",
			});
			continue;
		}

		const dueAt = dueAtOf(item, notes.heldAt);
		if (dueAt === "invalid") {
			dropped.push({
				title: item.title,
				reason: "The due date is not plausible.",
			});
			continue;
		}

		kept.push({ ...item, dueAt });
	}

	await db.$transaction(async (tx) => {
		await tx.meetingFollowUp.deleteMany({
			where: { activityId, status: "PROPOSED" },
		});
		await tx.meetingFollowUp.createMany({
			data: kept.map((item, position) => ({
				activityId,
				kind: item.kind,
				title: item.title,
				detail: item.detail,
				owner: item.owner,
				dueAt: item.dueAt,
				quote: item.quote,
				position,
			})),
		});
	});

	return { saved: kept.length, dropped };
}
