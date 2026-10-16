import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { braveEnabled, search } from "../lib/brave";
import { spend } from "../lib/focus";

export default defineDynamic({
	events: {
		"session.started": () =>
			braveEnabled()
				? defineTool({
						description:
							"Search the open web. Returns titles, URLs and snippets, not page contents: read a result with web_fetch before you rely on it. Ask about public facts only, never with text somebody emailed us.",
						inputSchema: z.object({
							query: z
								.string()
								.min(1)
								.describe("What to search for, e.g. 'Acme Ltd funding 2026'."),
							count: z
								.number()
								.int()
								.min(1)
								.max(20)
								.default(8)
								.describe("How many results to return."),
						}),
						execute: async ({ query, count }) => {
							const charge = spend(1);
							if (!charge.ok)
								return { ok: false as const, reason: charge.reason };

							const results = await search(query, count);
							if (!results.ok)
								return { ok: false as const, reason: results.reason };

							return { ok: true as const, results: results.data };
						},
					})
				: null,
	},
});
