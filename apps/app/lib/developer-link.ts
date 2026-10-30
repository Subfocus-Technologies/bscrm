const CLAUDE_CODE_NEW_SESSION = "claude://code/new";

export function developerLink(folder: string, pageUrl: string): string {
	const prompt = `I am on ${pageUrl} in the CRM. I want to change: `;

	return `${CLAUDE_CODE_NEW_SESSION}?folder=${encodeURIComponent(folder)}&q=${encodeURIComponent(prompt)}`;
}
