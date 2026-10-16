const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const TIMEOUT_MS = 15_000;

export type SearchResult = {
	title: string;
	url: string;
	snippet: string;
	published: string | null;
};

type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

export function braveEnabled(): boolean {
	return Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim());
}

function plain(html: string): string {
	return html
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.trim();
}

export async function search(
	query: string,
	count: number,
): Promise<Outcome<SearchResult[]>> {
	const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
	if (!apiKey) return { ok: false, reason: "No BRAVE_SEARCH_API_KEY." };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const url = new URL(ENDPOINT);
		url.searchParams.set("q", query);
		url.searchParams.set("count", String(count));

		const response = await fetch(url, {
			headers: {
				accept: "application/json",
				"x-subscription-token": apiKey,
			},
			signal: controller.signal,
		});

		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const body = (await response.json()) as {
			web?: {
				results?: {
					title?: string;
					url?: string;
					description?: string;
					page_age?: string;
				}[];
			};
		};

		const results = (body.web?.results ?? []).flatMap((result) =>
			result.url
				? [
						{
							title: plain(result.title ?? ""),
							url: result.url,
							snippet: plain(result.description ?? ""),
							published: result.page_age ?? null,
						},
					]
				: [],
		);

		return { ok: true, data: results };
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `Timed out after ${TIMEOUT_MS}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}
