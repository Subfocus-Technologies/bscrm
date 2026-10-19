export function normalizeDomain(
	input: string | null | undefined,
): string | null {
	const trimmed = input?.trim().toLowerCase();
	if (!trimmed) return null;

	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	let host: string;
	try {
		host = new URL(withScheme).hostname;
	} catch {
		return null;
	}

	const bare = host.replace(/^www\./, "");

	return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(bare) ? bare : null;
}
