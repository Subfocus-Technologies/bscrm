import { db, type Prisma } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { nextWorkspaceDayStart, workspaceDayStart } from "@crm/db/day";
import { withoutEmDashes } from "@crm/validation/plain-text";
import {
	emailActionsPayload,
	meetingActionsPayload,
	noteActionsPayload,
	replyBody,
	replySubject,
	TODOS,
	type TodoSuggestionItem,
	todoSuggestionItem,
	wordCount,
} from "@crm/validation/todos";
import { lessonsMarkdown } from "./lessons";
import { squash } from "./quotes";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DUE_DAYS_AHEAD = 366;

export type TodoSource =
	| { kind: "email"; emailThreadId: string; userId: string }
	| { kind: "meeting"; calendarEventId: string; userId: string }
	| { kind: "note"; incomingMeetingNoteId: string; userId: string };

export type ProposeTodosOutcome = {
	saved: number;
	replyDrafted: boolean;
	dropped: { title: string; reason: string }[];
};

export type TodoPreflight =
	| { kind: "research" }
	| { kind: "done"; outcome: string }
	| { kind: "deferred"; until: Date; reason: string };

type SourceContext = {
	text: string;
	heldAt: Date;
	contactId: string | null;
	companyId: string | null;
	replyTo: string | null;
	subject: string | null;
};

async function ownerName(userId: string): Promise<string> {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { name: true },
	});
	return user?.name ?? "the mailbox owner";
}

async function loadThread(emailThreadId: string) {
	const thread = await db.emailThread.findUnique({
		where: { id: emailThreadId },
		select: {
			id: true,
			subject: true,
			contactId: true,
			companyId: true,
			messages: {
				orderBy: { sentAt: "desc" },
				take: TODOS.email.messagesInBrief,
				select: {
					direction: true,
					fromEmail: true,
					fromName: true,
					body: true,
					snippet: true,
					sentAt: true,
				},
			},
		},
	});
	if (!thread) return null;

	return {
		...thread,
		messages: thread.messages
			.map((message) => ({
				...message,
				text: (message.body ?? message.snippet ?? "").slice(
					0,
					TODOS.email.bodyMaxChars,
				),
			}))
			.reverse(),
	};
}

async function loadMeeting(calendarEventId: string) {
	return db.calendarEvent.findUnique({
		where: { id: calendarEventId },
		select: {
			id: true,
			title: true,
			description: true,
			startsAt: true,
			endsAt: true,
			status: true,
			contactId: true,
			companyId: true,
			attendees: { select: { email: true, name: true } },
		},
	});
}

async function loadNote(incomingMeetingNoteId: string) {
	const note = await db.incomingMeetingNote.findUnique({
		where: { id: incomingMeetingNoteId },
		select: {
			title: true,
			body: true,
			heldAt: true,
			status: true,
			activity: { select: { contactId: true, companyId: true } },
			calendarEvent: { select: { contactId: true, companyId: true } },
		},
	});
	if (!note) return null;

	const record = note.activity ?? note.calendarEvent;
	return {
		...note,
		body: note.body.slice(0, TODOS.notes.bodyMaxChars),
		contactId: record?.contactId ?? null,
		companyId: record?.companyId ?? null,
	};
}

async function sourceContext(
	source: TodoSource,
): Promise<SourceContext | null> {
	if (source.kind === "email") {
		const thread = await loadThread(source.emailThreadId);
		if (!thread) return null;

		const lastInbound = [...thread.messages]
			.reverse()
			.find((message) => message.direction === "INBOUND");

		return {
			text: [
				thread.subject ?? "",
				...thread.messages.map((message) => message.text),
			].join("\n"),
			heldAt: thread.messages.at(-1)?.sentAt ?? new Date(),
			contactId: thread.contactId,
			companyId: thread.companyId,
			replyTo: lastInbound?.fromEmail ?? null,
			subject: thread.subject,
		};
	}

	if (source.kind === "note") {
		const note = await loadNote(source.incomingMeetingNoteId);
		if (!note) return null;

		return {
			text: [note.title, note.body].join("\n"),
			heldAt: note.heldAt,
			contactId: note.contactId,
			companyId: note.companyId,
			replyTo: null,
			subject: note.title,
		};
	}

	const meeting = await loadMeeting(source.calendarEventId);
	if (!meeting) return null;

	return {
		text: [meeting.title ?? "", meeting.description ?? ""].join("\n"),
		heldAt: meeting.startsAt,
		contactId: meeting.contactId,
		companyId: meeting.companyId,
		replyTo: null,
		subject: meeting.title,
	};
}

function sourceWhere(source: TodoSource): Prisma.TodoSuggestionWhereInput {
	if (source.kind === "email") {
		return { emailThreadId: source.emailThreadId, userId: source.userId };
	}
	if (source.kind === "note") {
		return {
			incomingMeetingNoteId: source.incomingMeetingNoteId,
			userId: source.userId,
		};
	}
	return { calendarEventId: source.calendarEventId, userId: source.userId };
}

function dueAtOf(
	item: TodoSuggestionItem,
	heldAt: Date,
): Date | null | "invalid" {
	if (!item.dueDate) return null;

	const due = new Date(`${item.dueDate}T09:00:00.000Z`);
	if (Number.isNaN(due.getTime())) return "invalid";

	const earliest = heldAt.getTime() - DAY_MS;
	const latest = heldAt.getTime() + MAX_DUE_DAYS_AHEAD * DAY_MS;
	return due.getTime() < earliest || due.getTime() > latest ? "invalid" : due;
}

async function decidedLines(source: TodoSource): Promise<string[]> {
	const decided = await db.todoSuggestion.findMany({
		where: { ...sourceWhere(source), status: { not: "PROPOSED" } },
		orderBy: { createdAt: "asc" },
		select: { title: true },
	});
	return decided.map((item) => `- ${item.title}`);
}

function datedLine(at: Date): string {
	return at.toISOString().slice(0, 16).replace("T", " ");
}

export async function emailActionsMarkdown(
	payload: Prisma.JsonValue,
): Promise<string> {
	const parsed = emailActionsPayload.safeParse(payload);
	if (!parsed.success) return "";

	const { emailThreadId, userId, replyRequested, instructions } = parsed.data;
	const [thread, owner, decided, lessons] = await Promise.all([
		loadThread(emailThreadId),
		ownerName(userId),
		decidedLines({ kind: "email", emailThreadId, userId }),
		lessonsMarkdown(userId),
	]);
	if (!thread) return "";

	const conversation = thread.messages.map((message) =>
		[
			`### ${datedLine(message.sentAt)} — ${
				message.direction === "OUTBOUND" ? "from us" : "from them"
			}: ${message.fromName ?? message.fromEmail} <${message.fromEmail}>`,
			message.text,
		].join("\n"),
	);

	return [
		`**This is an email-actions task.** You are reading ${owner}'s mailbox. Below is an email conversation with a client or a contact. Work out what ${owner} should do about it, then call \`propose_todos\` once.`,
		`- What ${owner} promised in their own emails is work too: "I'll send you something in the next couple of days" is a TODO, due when they said.`,
		`- A **REPLY** item only when the last message is from them and they are waiting for an answer from ${owner}. Put the reply itself in \`reply\`: written as ${owner}, British English, plain text, at most ${TODOS.reply.maxWords} words, no greeting line repeated from their email, no sign-off name (it is added when sent). Never promise a date, a price or a fact the conversation does not support; say ${owner} will confirm instead.`,
		`- A **TODO** item for anything else ${owner} or our team agreed to do or needs to do: send a document, book a call, check something, introduce someone.`,
		"- Each item quotes the exact words in the emails it comes from, or it is dropped. Give a due date only when the emails say when, and resolve words like 'Friday' against the date of the email.",
		`- A thank-you, a newsletter or an automated notice needs nothing: call \`propose_todos\` with no items.`,
		"- Never invent work the emails do not contain. Read the record's history only when a name or a commitment is unclear.",
		replyRequested
			? `**${owner} asked for a reply to be drafted.** Include one REPLY item and the reply.${
					instructions
						? ` Their instructions for the reply: "${instructions}".`
						: ""
				}`
			: "",
		decided.length > 0
			? `${owner} already decided these. Do not suggest them again:\n${decided.join("\n")}`
			: "",
		lessons,
		`## The conversation — thread \`${emailThreadId}\``,
		`Subject: ${thread.subject ?? "(no subject)"}`,
		conversation.join("\n\n"),
	]
		.filter(Boolean)
		.join("\n\n");
}

export async function meetingActionsMarkdown(
	payload: Prisma.JsonValue,
): Promise<string> {
	const parsed = meetingActionsPayload.safeParse(payload);
	if (!parsed.success) return "";

	const { calendarEventId, userId } = parsed.data;
	const [meeting, owner, decided] = await Promise.all([
		loadMeeting(calendarEventId),
		ownerName(userId),
		decidedLines({ kind: "meeting", calendarEventId, userId }),
	]);
	if (!meeting) return "";

	const attendees = meeting.attendees
		.map((person) => `- ${person.name ?? person.email} <${person.email}>`)
		.join("\n");

	return [
		`**This is a meeting-actions task.** A meeting in ${owner}'s calendar with a client or a contact has ended. Suggest the follow-ups ${owner} should do, then call \`propose_todos\` once with TODO items only.`,
		"- Read the record's history first: the emails before the meeting usually say what it was for and what was promised.",
		"- Each item quotes the exact words in the meeting title or description below, or it is dropped. A follow-up after the meeting may quote the title.",
		"- At most three items. When there is nothing to follow up, call it with no items.",
		decided.length > 0
			? `${owner} already decided these. Do not suggest them again:\n${decided.join("\n")}`
			: "",
		`## The meeting — \`${calendarEventId}\``,
		`Title: ${meeting.title ?? "(no title)"}`,
		`When: ${datedLine(meeting.startsAt)} to ${datedLine(meeting.endsAt)} UTC`,
		meeting.description ? `Description:\n${meeting.description}` : "",
		attendees ? `Attendees:\n${attendees}` : "",
	]
		.filter(Boolean)
		.join("\n\n");
}

export async function noteActionsMarkdown(
	payload: Prisma.JsonValue,
): Promise<string> {
	const parsed = noteActionsPayload.safeParse(payload);
	if (!parsed.success) return "";

	const { incomingMeetingNoteId, userId } = parsed.data;
	const [note, owner, decided] = await Promise.all([
		loadNote(incomingMeetingNoteId),
		ownerName(userId),
		decidedLines({ kind: "note", incomingMeetingNoteId, userId }),
	]);
	if (!note) return "";

	return [
		`**This is a note-actions task.** Below are Gemini's notes from a meeting in ${owner}'s calendar, held ${note.heldAt.toISOString().slice(0, 10)}. Turn every action point into a to-do for ${owner}'s list, then call \`propose_todos\` once with TODO items only.`,
		`- Include the action points for ${owner} and for our team. Leave out what only the other side agreed to do, unless ${owner} has to chase it.`,
		"- Each item quotes the exact words in the notes it comes from, or it is dropped. Give a due date only when the notes say when, and resolve words like 'next Friday' against the meeting date.",
		"- When the notes hold no action points, call it with no items. Never invent work the notes do not contain.",
		decided.length > 0
			? `${owner} already decided these. Do not suggest them again:\n${decided.join("\n")}`
			: "",
		`## The notes — \`${incomingMeetingNoteId}\``,
		`### ${note.title}`,
		note.body,
	]
		.filter(Boolean)
		.join("\n\n");
}

export async function proposeTodos(
	source: TodoSource,
	items: unknown[],
	reply: string | null,
	replyRequested = false,
): Promise<ProposeTodosOutcome> {
	const context = await sourceContext(source);
	if (!context) {
		return {
			saved: 0,
			replyDrafted: false,
			dropped: [{ title: "all", reason: "The email or meeting is gone." }],
		};
	}

	const haystack = squash(context.text);
	const decided = await db.todoSuggestion.findMany({
		where: { ...sourceWhere(source), status: { not: "PROPOSED" } },
		select: { title: true, quote: true },
	});
	const alreadyDecided = new Set(
		decided.flatMap((item) => [squash(item.title), squash(item.quote)]),
	);
	const dropped: ProposeTodosOutcome["dropped"] = [];
	const kept: (TodoSuggestionItem & { dueAt: Date | null })[] = [];
	const parsedReply = replyBody.safeParse(reply);
	let replyText: string | null = null;

	for (const raw of items.slice(0, TODOS.suggestions.maxItems)) {
		const parsed = todoSuggestionItem.safeParse(raw);
		if (!parsed.success) {
			dropped.push({ title: "unreadable item", reason: parsed.error.message });
			continue;
		}

		const item = parsed.data;
		const drop = (reason: string) =>
			dropped.push({ title: item.title, reason });

		if (!haystack.includes(squash(item.quote))) {
			drop("Its quote is not in the source, word for word.");
			continue;
		}
		if (
			alreadyDecided.has(squash(item.title)) ||
			alreadyDecided.has(squash(item.quote))
		) {
			drop("A person already added, finished or ignored this one.");
			continue;
		}

		const dueAt = dueAtOf(item, context.heldAt);
		if (dueAt === "invalid") {
			drop("The due date is not plausible.");
			continue;
		}

		if (item.kind === "REPLY") {
			if (source.kind !== "email") {
				drop("A REPLY item is only for an email conversation.");
				continue;
			}
			if (replyText !== null) {
				drop("There is already a REPLY item.");
				continue;
			}
			if (!context.replyTo) {
				drop("There is no message from them to answer.");
				continue;
			}
			if (!parsedReply.success) {
				drop("A REPLY item needs the reply text in `reply`.");
				continue;
			}
			const words = wordCount(parsedReply.data);
			if (words > TODOS.reply.maxWords) {
				drop(
					`The reply is ${words} words; keep it to ${TODOS.reply.maxWords}.`,
				);
				continue;
			}
			replyText = parsedReply.data;
		}

		kept.push({ ...item, dueAt });
	}

	if (replyRequested && replyText === null) {
		dropped.push({
			title: "reply",
			reason: "A reply was asked for: include one REPLY item and its text.",
		});
	}

	await db.$transaction(async (tx) => {
		await tx.todoSuggestion.deleteMany({
			where: { ...sourceWhere(source), status: "PROPOSED" },
		});
		await tx.todoSuggestion.createMany({
			data: kept.map((item, position) => ({
				userId: source.userId,
				kind: item.kind,
				title: item.title,
				detail: item.detail,
				dueAt: item.dueAt,
				quote: item.quote,
				position,
				emailThreadId: source.kind === "email" ? source.emailThreadId : null,
				calendarEventId:
					source.kind === "meeting" ? source.calendarEventId : null,
				incomingMeetingNoteId:
					source.kind === "note" ? source.incomingMeetingNoteId : null,
				contactId: context.contactId,
				companyId: context.companyId,
			})),
		});

		if (source.kind !== "email" || replyText === null || !context.replyTo) {
			return;
		}

		const draft = {
			toEmail: context.replyTo,
			subject: replySubject(context.subject),
			body: withoutEmDashes(replyText),
		};
		const existing = await tx.emailReply.findFirst({
			where: {
				emailThreadId: source.emailThreadId,
				userId: source.userId,
				status: "DRAFT",
			},
			select: { id: true },
		});
		if (existing) {
			await tx.emailReply.update({ where: { id: existing.id }, data: draft });
		} else {
			await tx.emailReply.create({
				data: {
					...draft,
					emailThreadId: source.emailThreadId,
					userId: source.userId,
				},
			});
		}
	});

	return { saved: kept.length, replyDrafted: replyText !== null, dropped };
}

export async function preflightEmailActions(
	payload: Prisma.JsonValue,
	now = new Date(),
): Promise<TodoPreflight> {
	const parsed = emailActionsPayload.safeParse(payload);
	if (!parsed.success) {
		return { kind: "done", outcome: "The task names no email." };
	}

	const thread = await db.emailThread.count({
		where: { id: parsed.data.emailThreadId },
	});
	if (thread === 0) return { kind: "done", outcome: "The email is gone." };
	if (parsed.data.replyRequested) return { kind: "research" };

	const used = await db.agentTask.count({
		where: {
			kind: "email-actions",
			sessionId: { not: null },
			startedAt: { gte: workspaceDayStart(now) },
			payload: { path: ["userId"], equals: parsed.data.userId },
		},
	});
	if (used >= TODOS.email.dailyLimitPerUser) {
		return {
			kind: "deferred",
			until: nextWorkspaceDayStart(now),
			reason: `Waiting for tomorrow: today's limit of ${TODOS.email.dailyLimitPerUser} emails read for to-dos is used up.`,
		};
	}

	return { kind: "research" };
}

export async function preflightMeetingActions(
	payload: Prisma.JsonValue,
): Promise<TodoPreflight> {
	const parsed = meetingActionsPayload.safeParse(payload);
	if (!parsed.success) {
		return { kind: "done", outcome: "The task names no meeting." };
	}

	const meeting = await db.calendarEvent.findUnique({
		where: { id: parsed.data.calendarEventId },
		select: { status: true, _count: { select: { meetingNotes: true } } },
	});
	if (!meeting) return { kind: "done", outcome: "The meeting is gone." };
	if (meeting.status === "cancelled") {
		return { kind: "done", outcome: "The meeting was cancelled." };
	}
	if (meeting._count.meetingNotes > 0) {
		return {
			kind: "done",
			outcome: "The meeting has notes, and the notes are read for follow-ups.",
		};
	}

	return { kind: "research" };
}

export async function queueEndedMeetings(now = new Date()): Promise<number> {
	const { lookbackMs, settleMs, perTick, budget } = TODOS.meetings;
	const endedAfter = new Date(now.getTime() - lookbackMs);

	const ended = await db.calendarEvent.findMany({
		where: {
			startsAt: { gte: new Date(endedAfter.getTime() - DAY_MS) },
			endsAt: { gte: endedAfter, lte: new Date(now.getTime() - settleMs) },
			isAllDay: false,
			status: { not: "cancelled" },
			syncedByUserId: { not: null },
			OR: [{ contactId: { not: null } }, { companyId: { not: null } }],
		},
		orderBy: { endsAt: "asc" },
		take: perTick * 4,
		select: {
			id: true,
			syncedByUserId: true,
			contactId: true,
			companyId: true,
		},
	});
	if (ended.length === 0) return 0;

	const seen = await db.agentTask.findMany({
		where: {
			kind: "meeting-actions",
			subject: { in: ended.map((meeting) => meeting.id) },
		},
		select: { subject: true },
	});
	const queued = new Set(seen.map((task) => task.subject));
	const fresh = ended
		.filter((meeting) => !queued.has(meeting.id))
		.slice(0, perTick);

	const { count } = await db.agentTask.createMany({
		data: fresh.flatMap((meeting) =>
			meeting.syncedByUserId
				? [
						{
							kind: "meeting-actions",
							reason: "A meeting with a client ended",
							priority: PRIORITY.meetingActions,
							budget,
							dueAt: now,
							subject: meeting.id,
							contactId: meeting.contactId,
							companyId: meeting.companyId,
							payload: {
								calendarEventId: meeting.id,
								userId: meeting.syncedByUserId,
							} satisfies Prisma.InputJsonValue,
						},
					]
				: [],
		),
	});

	return count;
}

export async function preflightNoteActions(
	payload: Prisma.JsonValue,
): Promise<TodoPreflight> {
	const parsed = noteActionsPayload.safeParse(payload);
	if (!parsed.success) {
		return { kind: "done", outcome: "The task names no meeting notes." };
	}

	const note = await db.incomingMeetingNote.findUnique({
		where: { id: parsed.data.incomingMeetingNoteId },
		select: { status: true },
	});
	if (!note) return { kind: "done", outcome: "The meeting notes are gone." };
	if (note.status !== "NEW") {
		return {
			kind: "done",
			outcome:
				"The notes were filed, ignored or are a copy, so they are not read here.",
		};
	}

	return { kind: "research" };
}

export async function queueUnreadEmails(now = new Date()): Promise<number> {
	const { maxAgeMs, settleMs, perTick, budget } = TODOS.email;

	const threads = await db.emailThread.findMany({
		where: {
			lastMessageAt: {
				gte: new Date(now.getTime() - maxAgeMs),
				lte: new Date(now.getTime() - settleMs),
			},
		},
		orderBy: { lastMessageAt: "desc" },
		take: perTick * 10,
		select: {
			id: true,
			contactId: true,
			companyId: true,
			lastMessageAt: true,
			messages: {
				orderBy: { sentAt: "desc" },
				take: 1,
				select: { syncedByUserId: true },
			},
		},
	});
	if (threads.length === 0) return 0;

	const read = await db.agentTask.findMany({
		where: {
			kind: "email-actions",
			subject: { in: threads.map((thread) => thread.id) },
		},
		select: { subject: true, createdAt: true },
	});
	const lastRead = new Map<string, number>();
	for (const task of read) {
		if (!task.subject) continue;
		lastRead.set(
			task.subject,
			Math.max(task.createdAt.getTime(), lastRead.get(task.subject) ?? 0),
		);
	}

	const due = threads
		.flatMap((thread) => {
			const userId = thread.messages[0]?.syncedByUserId;
			const unread =
				(lastRead.get(thread.id) ?? 0) < thread.lastMessageAt.getTime();
			return userId && unread ? [{ ...thread, userId }] : [];
		})
		.slice(0, perTick);

	const { count } = await db.agentTask.createMany({
		data: due.map((thread) => ({
			kind: "email-actions",
			reason: "An email conversation with a client has something new",
			priority: PRIORITY.emailActions,
			budget,
			dueAt: now,
			subject: thread.id,
			contactId: thread.contactId,
			companyId: thread.companyId,
			payload: {
				emailThreadId: thread.id,
				userId: thread.userId,
				replyRequested: false,
				instructions: null,
			} satisfies Prisma.InputJsonValue,
		})),
	});

	return count;
}

export async function queueUnreadNotes(now = new Date()): Promise<number> {
	const { lookbackMs, perTick, budget } = TODOS.notes;

	const notes = await db.incomingMeetingNote.findMany({
		where: {
			status: "NEW",
			heldAt: { gte: new Date(now.getTime() - lookbackMs) },
		},
		orderBy: { heldAt: "desc" },
		take: perTick * 10,
		select: {
			id: true,
			mailboxUserId: true,
			calendarEvent: { select: { contactId: true, companyId: true } },
		},
	});
	if (notes.length === 0) return 0;

	const read = await db.agentTask.findMany({
		where: {
			kind: "note-actions",
			subject: { in: notes.map((note) => note.id) },
		},
		select: { subject: true },
	});
	const done = new Set(read.map((task) => task.subject));
	const due = notes.filter((note) => !done.has(note.id)).slice(0, perTick);

	const { count } = await db.agentTask.createMany({
		data: due.map((note) => ({
			kind: "note-actions",
			reason: "Gemini meeting notes to read for action points",
			priority: PRIORITY.noteActions,
			budget,
			dueAt: now,
			subject: note.id,
			contactId: note.calendarEvent?.contactId ?? null,
			companyId: note.calendarEvent?.companyId ?? null,
			payload: {
				incomingMeetingNoteId: note.id,
				userId: note.mailboxUserId,
			} satisfies Prisma.InputJsonValue,
		})),
	});

	return count;
}
