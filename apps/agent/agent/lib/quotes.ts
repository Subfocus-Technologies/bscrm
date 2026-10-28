export function squash(text: string): string {
	return text
		.normalize("NFKC")
		.replace(/[‘’‚‛′]/g, "'")
		.replace(/[“”„‟″]/g, '"')
		.replace(/[‐-―−]/g, "-")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}
