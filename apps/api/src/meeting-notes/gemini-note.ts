import { MEETING_NOTES } from "@crm/validation/meeting-notes";

const NOTES_PREFIX =
	/^\s*(?:(?:re|fwd?)\s*:\s*)*notes(?:\s+by\s+gemini)?\s*[:\-–—]\s*/i;
const QUOTED = /[“"‘']([^”"’']{2,})[”"’']/;
const TRAILING_DATE =
	/\s+(?:[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Z][a-z]{2,8}\.?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/;
const DOC_URL = /https:\/\/docs\.google\.com\/document\/d\/[\w-]+/;
const MIN_MATCH_LENGTH = 4;

export function geminiNoteTitle(subject: string): string {
	const withoutPrefix = subject.replace(NOTES_PREFIX, "");
	const quoted = QUOTED.exec(withoutPrefix)?.[1];
	const title = (quoted ?? withoutPrefix.replace(TRAILING_DATE, "")).trim();

	return (title || subject.trim() || "Meeting notes").slice(
		0,
		MEETING_NOTES.title.maxLength,
	);
}

const BOILERPLATE = [
	/^Notes from /,
	/^These notes have been sent to /,
	/^Open meeting notes$/,
	/auto-generated on /,
];
const FOOTER =
	/^(Meeting records|Is the content of this email helpful|You have received this email because|Google LLC,)/;

export function geminiDocUrl(...sources: string[]): string | null {
	for (const source of sources) {
		const found = DOC_URL.exec(source)?.[0];
		if (found) return found;
	}
	return null;
}

export function geminiNoteBody(text: string): string {
	const paragraphs = text
		.replace(/\r\n/g, "\n")
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);
	const footer = paragraphs.findIndex((paragraph) => FOOTER.test(paragraph));
	const kept = (footer >= 0 ? paragraphs.slice(0, footer) : paragraphs).filter(
		(paragraph) => !BOILERPLATE.some((pattern) => pattern.test(paragraph)),
	);

	return kept.join("\n\n");
}

function comparable(value: string): string {
	return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function titlesMatch(noteTitle: string, eventTitle: string): boolean {
	const note = comparable(noteTitle);
	const event = comparable(eventTitle);
	if (note.length < MIN_MATCH_LENGTH || event.length < MIN_MATCH_LENGTH) {
		return note === event && note.length > 0;
	}

	return note === event || note.includes(event) || event.includes(note);
}

export function notesBody(body: string, docUrl: string | null): string {
	const footer = docUrl ? `\n\nFull notes in Google Docs: ${docUrl}` : "";
	const text = body.trim() || "Gemini sent these notes without a summary.";

	return `${text.slice(0, MEETING_NOTES.notes.maxLength - footer.length)}${footer}`;
}
