import { defineTool } from "eve/tools";
import { z } from "zod";
import { taskRunFocus } from "../lib/focus";
import {
	listRepoPath,
	readRepoFile,
	repoIsAllowed,
	reposEnabled,
	searchRepo,
} from "../lib/github";

export default defineTool({
	description:
		"Read one of our code repositories in a task run. Give `search` to find files, a directory `path` to list it, or a file `path` to read it. Leave both empty to list the top of the repository. Read-only.",
	inputSchema: z.object({
		repo: z.string().describe("owner/name, from the allowed list."),
		path: z.string().nullable().describe("A file or directory, or null."),
		search: z.string().nullable().describe("Code to search for, or null."),
	}),
	async execute({ repo, path, search }) {
		if (!taskRunFocus()) {
			return { ok: false as const, reason: "This session is not a task run." };
		}
		if (!reposEnabled() || !repoIsAllowed(repo)) {
			return {
				ok: false as const,
				reason: "That repository is not available in this session.",
			};
		}

		try {
			if (search) {
				return { ok: true as const, files: await searchRepo(repo, search) };
			}
			if (path) {
				const content = await readRepoFile(repo, path);
				if (content !== null) return { ok: true as const, content };
			}
			return {
				ok: true as const,
				entries: await listRepoPath(repo, path ?? ""),
			};
		} catch (error) {
			return {
				ok: false as const,
				reason: error instanceof Error ? error.message : String(error),
			};
		}
	},
});
