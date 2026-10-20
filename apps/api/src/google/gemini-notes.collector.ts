import { MEETING_NOTES } from "@crm/validation/meeting-notes";
import { Injectable, Logger } from "@nestjs/common";
import {
	geminiDocUrl,
	geminiNoteBody,
	geminiNoteTitle,
} from "../meeting-notes/gemini-note";
import {
	IncomingNotesService,
	type ReceivedNote,
} from "../meeting-notes/incoming-notes.service";
import { GmailClient, type GmailMessage } from "./gmail.client";
import { header, htmlBody, plainTextBody } from "./gmail-mime";

export type GeminiCollectOutcome = {
	listed: number;
	stored: number;
	remaining: number;
};

export function geminiNotesQuery(): string {
	const { geminiSender, backfillDays } = MEETING_NOTES.inbox;
	return `from:${geminiSender} newer_than:${backfillDays}d`;
}

@Injectable()
export class GeminiNotesCollector {
	private readonly logger = new Logger(GeminiNotesCollector.name);

	constructor(
		private readonly gmail: GmailClient,
		private readonly incoming: IncomingNotesService,
	) {}

	async collect(
		userId: string,
		accessToken: string,
	): Promise<GeminiCollectOutcome> {
		const listed = await this.gmail.searchMessages(accessToken, {
			query: geminiNotesQuery(),
			maxResults: MEETING_NOTES.inbox.listMax,
		});
		if (listed.outcome !== "ok") {
			this.logger.warn({
				message: "Could not list Gemini notes",
				userId,
				outcome: listed.outcome,
				reason: listed.reason,
			});
			return { listed: 0, stored: 0, remaining: 0 };
		}

		const ids = (listed.data.messages ?? []).flatMap((message) =>
			message.id ? [message.id] : [],
		);
		const settled = await this.incoming.settled(ids);
		const pending = ids.filter((id) => !settled.has(id));
		const batch = pending.slice(0, MEETING_NOTES.inbox.fetchPerSync);

		let stored = 0;
		for (const id of batch) {
			const message = await this.gmail.getMessage(accessToken, id);
			if (message.outcome !== "ok") continue;

			const note = this.parse(message.data, userId);
			if (!note) continue;

			await this.incoming.receive(note);
			stored += 1;
		}

		const remaining = pending.length - batch.length;
		if (stored > 0 || remaining > 0) {
			this.logger.log({
				message: "Gemini notes collected",
				userId,
				stored,
				remaining,
			});
		}

		return { listed: ids.length, stored, remaining };
	}

	private parse(message: GmailMessage, userId: string): ReceivedNote | null {
		const headers = message.payload?.headers;
		const from = header(headers, "from")?.toLowerCase() ?? "";
		if (!message.id || !from.includes(MEETING_NOTES.inbox.geminiSender)) {
			return null;
		}

		const subject = header(headers, "subject") ?? "Meeting notes";
		const sentAt = Number(message.internalDate);
		const heldAt = Number.isFinite(sentAt) ? new Date(sentAt) : new Date();
		const text = plainTextBody(message.payload);
		const html = htmlBody(message.payload);

		return {
			gmailMessageId: message.id,
			mailboxUserId: userId,
			subject: subject.slice(0, MEETING_NOTES.title.maxLength * 2),
			title: geminiNoteTitle(subject),
			body: geminiNoteBody(text).slice(0, MEETING_NOTES.notes.maxLength),
			docUrl: geminiDocUrl(html, text),
			heldAt,
		};
	}
}
