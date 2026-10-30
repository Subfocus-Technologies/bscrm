import { TASK_RUNS } from "@crm/validation/task-runs";

const API = "https://api.github.com";

type RepoFile = { path: string; content: string };

export function allowedRepos(): readonly string[] {
	return (process.env.AGENT_REPOS ?? "")
		.split(",")
		.map((repo) => repo.trim())
		.filter(Boolean);
}

function token(): string | null {
	return process.env.AGENT_REPO_TOKEN?.trim() || null;
}

export function reposEnabled(): boolean {
	return token() !== null && allowedRepos().length > 0;
}

export function repoIsAllowed(repo: string): boolean {
	return allowedRepos().some(
		(allowed) => allowed.toLowerCase() === repo.toLowerCase(),
	);
}

async function github<T>(
	path: string,
	init: { method?: string; body?: object } = {},
): Promise<T> {
	const response = await fetch(`${API}${path}`, {
		method: init.method ?? "GET",
		signal: AbortSignal.timeout(TASK_RUNS.repo.timeoutMs),
		headers: {
			accept: "application/vnd.github+json",
			authorization: `Bearer ${token()}`,
			"content-type": "application/json",
			"x-github-api-version": "2022-11-28",
		},
		body: init.body ? JSON.stringify(init.body) : undefined,
	});
	if (!response.ok) {
		throw new Error(`GitHub answered ${response.status} for ${path}.`);
	}
	return (await response.json()) as T;
}

export async function listRepoPath(repo: string, path: string) {
	const entries = await github<
		{ name: string; path: string; type: string; size: number }[]
	>(`/repos/${repo}/contents/${encodeURI(path)}`);

	return entries.slice(0, TASK_RUNS.repo.listMax).map((entry) => ({
		path: entry.path,
		type: entry.type,
		size: entry.size,
	}));
}

export async function readRepoFile(repo: string, path: string) {
	const found = await github<
		{ type: string; content?: string } | { type: string }[]
	>(`/repos/${repo}/contents/${encodeURI(path)}`);
	if (Array.isArray(found) || found.type !== "file" || !found.content) {
		return null;
	}

	return Buffer.from(found.content, "base64")
		.toString("utf8")
		.slice(0, TASK_RUNS.repo.readMaxChars);
}

export async function searchRepo(repo: string, query: string) {
	const found = await github<{
		items: { path: string; text_matches?: { fragment: string }[] }[];
	}>(
		`/search/code?per_page=${TASK_RUNS.repo.searchMax}&q=${encodeURIComponent(`${query} repo:${repo}`)}`,
	);

	return found.items.map((item) => ({ path: item.path }));
}

export async function openDraftPullRequest(input: {
	repo: string;
	title: string;
	body: string;
	branch: string;
	files: readonly RepoFile[];
}): Promise<string> {
	const { repo } = input;
	const details = await github<{ default_branch: string }>(`/repos/${repo}`);
	const base = await github<{ object: { sha: string } }>(
		`/repos/${repo}/git/ref/heads/${details.default_branch}`,
	);
	const parent = await github<{ tree: { sha: string } }>(
		`/repos/${repo}/git/commits/${base.object.sha}`,
	);
	const tree = await github<{ sha: string }>(`/repos/${repo}/git/trees`, {
		method: "POST",
		body: {
			base_tree: parent.tree.sha,
			tree: input.files.map((file) => ({
				path: file.path,
				mode: "100644",
				type: "blob",
				content: file.content,
			})),
		},
	});
	const commit = await github<{ sha: string }>(`/repos/${repo}/git/commits`, {
		method: "POST",
		body: {
			message: input.title,
			tree: tree.sha,
			parents: [base.object.sha],
		},
	});
	await github(`/repos/${repo}/git/refs`, {
		method: "POST",
		body: { ref: `refs/heads/${input.branch}`, sha: commit.sha },
	});
	const pull = await github<{ html_url: string }>(`/repos/${repo}/pulls`, {
		method: "POST",
		body: {
			title: input.title,
			body: input.body,
			head: input.branch,
			base: details.default_branch,
			draft: true,
		},
	});

	return pull.html_url;
}
