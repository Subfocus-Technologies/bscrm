const DASH_BETWEEN_NUMBERS = /(\d)[ \t]*[—–][ \t]*(\d)/g;
const DASH_AT_LINE_START = /^[ \t]*[—–][ \t]*/gm;
const DASH_AT_LINE_END = /[ \t]*[—–][ \t]*$/gm;
const DASH_IN_TEXT = /[ \t]*[—–][ \t]*/g;

export function withoutEmDashes(text: string): string {
	return text
		.replace(DASH_BETWEEN_NUMBERS, "$1-$2")
		.replace(DASH_AT_LINE_START, "")
		.replace(DASH_AT_LINE_END, "")
		.replace(DASH_IN_TEXT, ", ");
}

const MARKDOWN_HEADING = /^#{1,6}[ \t]+/gm;
const MARKDOWN_BOLD = /\*\*/g;

export function markdownToPlainText(text: string): string {
	return text.replace(MARKDOWN_HEADING, "").replace(MARKDOWN_BOLD, "").trim();
}
