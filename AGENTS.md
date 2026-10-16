snt# Subfocus CRM — read this first

This repository is our fork of Comp AI's open-source CRM (`trycompai/crm`). It runs
the Subfocus team's CRM at https://crm.subfocustech.co.uk. Everything after this
section is upstream's guidance and still applies. Where the two disagree, this
section wins.

## The CRM is multi-user

- `luke@subfocustech.co.uk` and `sayu@subfocustech.co.uk` use it today. More
  colleagues join later. `ALLOWED_SIGN_IN=subfocustech.co.uk` admits the whole domain.
- All users share one workspace: the same contacts, companies, deals and agents.
  There are no organizations and no tenants. Do not add them.
- Each user connects their own mailbox and calendar. Sync is per user.
- Build every feature for several people at once. A change to a record records
  the user who made it. A personal preference belongs to that user, not to the
  workspace. Never assume there is one user.

## Who you are working with

Check `git config user.email` at the start of a session.

**Sayu (`sayu@subfocustech.co.uk`)** is rebuilding this CRM around how we work.
Sayu has the final say on how it looks, how it is laid out and what it does. Sayu
is not a developer. Sayu decides what the CRM is. You decide how it is built, and
you build it to the standard in "How to build it" below.

- Do what Sayu asks for the product. Do not argue with a visual, layout or
  functional choice, and do not water it down. A full redesign of a page is a
  normal request.
- Ask about outcomes, never implementation. Turn "make the button do X" into the
  correct change yourself.
- Never offer a choice between technical approaches. Pick the one this file and
  the area doc prescribe, and explain it in one plain sentence.
- Explain what changed and how to see it in the CRM, without jargon. Name a file
  only when Sayu needs to find it.
- Run every check yourself and fix what fails. Do not hand back errors or commands.
- When a request seems to need a different tool or provider, build it with the
  stack and providers below. Only when that is impossible, explain why in plain
  words and stop for Luke's go-ahead.

**Luke (`luke@subfocustech.co.uk`)** owns the stack, the providers and the platform.

## What Sayu can change

Anything in the product. That includes removing whole features (chat, the agent
tab, a page, a record type), rebuilding them differently, restructuring the code
behind them and changing how the CRM looks, is laid out and behaves. Removing a
feature means removing all of it: its pages, routes, API procedures, agent tools,
database tables (through a migration) and docs.

## How to build it

Sayu's requests are carried out cleanly, consistently and so they keep working as
the team and the data grow.

- **One design system.** A visual change goes into `packages/ui` and the theme
  tokens, so it applies everywhere. Never style one page by hand to look different
  from the rest. Read `docs/design.md` first.
- **Reuse, then extend.** Build from existing components, tRPC routers, custom
  fields and agent tools. When a new piece is needed, make it general enough for
  the next page that needs it, and then use it in both places.
- **Every state is designed.** Each screen handles loading, empty, error and
  "no permission" states, and works on a phone.
- **Built for growth.** Lists paginate and filter in the database, not in the
  browser. Queries that a page runs often have an index. Nothing loads every
  record at once. Nothing has a list of users, stages or options written into the
  code: those live in data or settings.
- **Built for several users.** Two people editing at once does not lose either
  change. Every change records who made it.
- **No one-off hacks.** No copied components, no special cases for one record, no
  hidden switches. If a request needs a shortcut, build the proper version instead.
- **Remove what you replace.** A rebuilt page leaves no old version, unused
  component or dead route behind.

## The stack and the providers are fixed

Build everything with what is already here. Do not replace any part of this list,
and do not add an alternative beside it. Changing it needs Luke's explicit go-ahead
in the conversation.

**Stack**

- TypeScript everywhere, in a Bun and Turborepo monorepo, linted by Biome.
- `apps/app`: Next.js App Router, with `packages/ui` (shadcn/ui and Tailwind) as
  the only UI kit.
- `apps/api`: NestJS with tRPC. The app reaches the API through tRPC only.
- `packages/db`: Prisma on PostgreSQL.
- `packages/auth`: Better Auth.
- `apps/agent`: eve, on the AI SDK.

**Providers**

- Vercel hosts the app. Railway hosts the API, the agent, the cron and Postgres.
- Google Workspace signs people in and supplies Gmail and Calendar.
- Alibaba Cloud (Qwen) runs every AI model call, through
  `apps/agent/agent/lib/model.ts`. Change the model with `QWEN_MODEL`.
- Brave Search runs web search. Context.dev supplies company and LinkedIn data.
- GitHub holds the code. A push deploys it.

A new library that works inside this stack is fine when it has a clear reason. A
new paid service, framework, database, auth library, host or AI provider is not.

**Keep these working, however much else changes**

- Sign-in: only `ALLOWED_SIGN_IN` addresses get in, and every user shares one
  workspace. See "The CRM is multi-user".
- Deployment: `railway/` and `railway/README.md`, the root `.dockerignore`, and
  the Railway and Vercel settings. A change that needs them changed updates them
  in the same commit.
- The database: change it only through a Prisma migration made locally
  (`bun run db:migrate`). Never edit a migration that is already applied. Never
  run `db push` against the live database. Never drop or rename a column that
  holds data in one step: add the new column, copy the data, and remove the old
  one in a later change.
- Secrets: never in code, chat, logs or commits. `.env.example` documents each
  variable by name.

## How a change goes live

- `main` is production, and Sayu pushes to it directly. Every push to `main`
  deploys the app (Vercel) and the API, agent and cron (Railway) within minutes,
  for the whole team. There is no review step, so the checks are the safety net.
- There is no staging. Migrations apply to the live database on the next API
  deploy.
- Before every push, run the checks and fix what fails: `bun run check-types`,
  `bun run lint`, `bun run lint:slop`, `bun run lint:dead` and `bun run test`. The
  pre-push hook runs most of them and refuses the push when one fails. Never skip
  it with `--no-verify` or `CRM_SKIP_HOOKS`.
- After a push, confirm the deploy finished and the change works on
  https://crm.subfocustech.co.uk. When it does not, fix it or revert it at once.
- Try UI changes locally with `bun run dev` against a local database, never the
  live one.
- Upstream's `release` branch, release pull requests and GitHub automations in
  `CONTRIBUTING.md` do not apply here. Those workflows are switched off in this
  fork. Only CI runs, on every push to `main`.

## Set up a new machine

Do this once per computer, before the first push. Without it, the pre-push hook
refuses every push.

1. Install Bun, Node 24 and a Docker runtime (OrbStack on a Mac), and start Docker.
2. `bun install`, then `cp .env.example .env` for local development values.
3. `docker compose up -d` starts the local Postgres on port 5432. Then
   `bun --env-file=.env run db:test` creates the test database that `bun run test`
   needs. The script does not read `.env` by itself, so keep `--env-file`. When
   another Postgres already uses port 5432, stop it first.
4. `bun run dev` runs the CRM locally on http://localhost:3000.

## Keep it clean

- Write code the way upstream does. Read the area doc before you touch an area,
  and follow every rule below this section.
- One concern per commit, with a plain message that says what changed and why.
- A new dependency needs a reason, and goes in its own commit.
- Pulling updates from `trycompai/crm` (the `upstream` remote) needs Luke's
  go-ahead. As the rebuild diverges, those merges get harder.

# Strict rules — review before starting any work

**Read the doc for the area you are touching before you touch it.** The table
below is the whole index. These are plain paths, not imports: they are not in your
context until you read them, and the rules in them are not optional.

| Working on | Read first |
| --- | --- |
| Anything in `apps/api` — tRPC, auth, logging, sync, deletes, caching | `docs/api.md` |
| `apps/agent` — the eve research agent, tools, tasks, dispatch | `docs/agent.md` |
| `.env`, configuration, which variables exist and why | `docs/environment.md` |
| UI in `apps/app` or `packages/ui` | `docs/design.md` (below) |
| Deal amounts, totals, charts, exchange rates | `docs/currency.md` |
| The record sheet's Agent tab | `docs/agent-panel.md` |
| `/settings/connections`, integrations, the intake endpoint | `docs/connections.md` |
| The tracking script, the collector, form submissions | `docs/tracking.md` |
| Running it locally, Google Cloud, DB commands, secrets | `docs/setup.md` |
| Anything that sends a telemetry event, or a new property on one | `docs/telemetry.md` |
| `.github/workflows`, versions, changelog (upstream only; see "How a change goes live") | `CONTRIBUTING.md` |

Also check `.agents/skills/` for a relevant skill before starting — better-auth,
prisma, nestjs-trpc, eve, shadcn, nuqs and others have one. Tell the user which
rules and skills you read.

## Always true

- **Never add code comments.** Not to new code, not to code you edit.
- **No coauthoring commits.** No `Co-Authored-By` trailer, ever.
- **Intelligence lives in `apps/agent`, never in the API.** No vendor client, no
  enrichment, no scoring, no identity matching in Nest — it writes an `AgentTask`
  row and lets the agent decide. See `docs/api.md`.
- **One `.env`, at the repo root.** `.env.example` is its documentation: add every
  new variable there with a note on what it does, and declare it in
  `apps/api/src/config/env.validation.ts` if the API reads it. Never add a
  per-package `.env`.
- **Anything a self-hoster might not have is optional and must never throw.** A
  missing key removes a capability. `apps/agent/agent/lib/capabilities.ts` is the
  pattern.
- **`/packages/ui` is the single source of truth for UI.** Shared shadcn
  components only; a new variant is implemented there, not overridden at the call
  site.
- **eve's own docs ship in `apps/agent/node_modules/eve/docs`** and match the
  installed version. Read the relevant guide before writing eve code rather than
  working from memory — guessing typechecks, builds, and then behaves differently.

## Report every issue. Use ASD-STE100

Do not bury a known problem inside a paragraph. A problem inside prose is a
problem nobody reads. Report **every** issue, including ones you caused, in a
list at the end of your reply.

Write every message, every report and every issue in **ASD-STE100**
(Simplified Technical English):

- One idea per sentence. Maximum 20 words.
- Active voice. Present tense. No conditionals.
- One word for one meaning. Do not use synonyms for variety.
- Say the effect, not only the cause.
- No hedging: never "may", "might", "possibly", "somewhat".

Use exactly this shape:

```
## Issues

1. BROKEN — Slack is not connected. Agents that post to Slack fail.
   Fix: connect Slack in Settings → Connections.
2. RISK — A run longer than 5 minutes is cancelled. Work is lost.
   Fix: not done. Needs a separate execution lease.
3. NOT DONE — The manual run button shows on event-only agents.
```

Rules for the list:

- One line for the problem. One line for the fix.
- Start each with **BROKEN**, **RISK**, **NOT DONE**, or **UNKNOWN**.
- **BROKEN** is failing now. **RISK** fails later. **NOT DONE** is unbuilt.
  **UNKNOWN** is not investigated.
- If you introduced it, write **I caused this** on the fix line.
- Zero issues? Write `## Issues` then `None.`

**Don't** — bury it in prose:

> The fix works well. One honest limit: abandoning a sweep unblocks the queue but
> doesn't cancel the underlying hung promise, so it leaks until restart.

**Do** — put it in the list:

> 1. RISK — An abandoned sweep leaks its promise. Memory grows until restart.
>    Fix: not done. Needs cancellation in `receive()`. I caused this.

## A server page computes. A client component renders.

A client component must never import a server package. `@crm/auth` and `@crm/db`
are server packages: their barrels reach Prisma, which reaches `pg`, which
reaches `dns`. The bundler follows that chain into the browser and the build
fails with `Module not found: Can't resolve 'dns'`.

The import trace is the whole error. Read it from the bottom: the last line is
the page, the line above is the client component that leaked, and the top is the
Node module that cannot exist in a browser.

**Don't** — a client component reaching for a server package:

```tsx
"use client";
import { describeSlackScopes, SLACK_SCOPE_GROUPS } from "@crm/auth";

export function SlackScopeGroups({ scopes }: { scopes: string[] }) {
  const groups = SLACK_SCOPE_GROUPS.map(...)
}
```

**Do** — the page does the work and hands over plain data:

```tsx
// page.tsx — server
import { describeSlackScopes, SLACK_SCOPE_GROUPS } from "@crm/auth";

const groups = groupScopes(status.scopes);
return <SlackScopeGroups groups={groups} />;
```

```tsx
// slack-scope-groups.tsx — client
"use client";

export type ScopeGroup = { id: string; label: string; scopes: ScopeLine[] };

export function SlackScopeGroups({ groups }: { groups: ScopeGroup[] }) { … }
```

Rules that follow:

- The client component owns its own prop types. It does not re-export a server
  type to get them.
- Anything interactive — an accordion, a dialog, a search field — is a client
  component that receives finished data. It never derives it.
- A `"use client"` file may import from `@crm/ui`, the tRPC client, and React.
  Anything else needs checking.
- The server page is where `await` and secrets live. The client file has neither.

## Constants belong in one file per area, not beside their first use

A number that someone will want to tune goes in a named config module for its
area. It does not go at the top of whichever file happened to need it first.
Somebody changing a timeout must not have to know which file to open.

**Don't** — one constant per file, found only by grep:

```ts
// dispatch.ts
const DRAIN_TIMEOUT_MS = 4 * 60_000;
// crm.ts
const STALE_QUEUE_MS = 5 * 60_000;
// tasks.ts
const LEASE_MS = 10 * 60_000;
```

**Do** — one object, grouped by concern, imported where used:

```ts
// dispatch-config.ts
export const DISPATCH = {
  sweep: { timeoutMs: 4 * MINUTE_MS, staleQueueMs: 5 * MINUTE_MS },
  task: { leaseMs: 10 * MINUTE_MS },
} as const;
```

`apps/agent/agent/lib/dispatch-config.ts` is the pattern. Rules:

- Group by concern, not by file that uses it.
- Derive units from one base (`MINUTE_MS`). Never write `4 * 60_000` twice.
- `as const`, so the values are literal types.
- No magic numbers inline. If it is tunable, it belongs in the config.
- One convention across the codebase. Do not invent a local style for one file.

## Parse at the boundary, never pass `Record<string, unknown>` around

Untyped data — a Prisma `Json` column, a webhook body, an API response — is
parsed into a **domain type at the moment it enters the process**, with Zod, in a
module that owns that shape. Every consumer downstream receives the parsed type
and nothing else. `Record<string, unknown>`, `unknown` casts and one-off
`recordOf()` helpers are how a shape becomes unknowable and a typo becomes a
runtime bug two files away.

**Don't** — reach into raw JSON, re-deriving the shape at each call site:

```ts
function manifestActions(value: unknown) {
  const actions = recordOf(value).actions;
  return Array.isArray(actions) ? actions.map(recordOf) : [];
}

const slack = manifestActions(version.manifest).find(
  (action) => action.type === "slack.message.post",
);
const id = (slack?.destination as Record<string, unknown>)?.id;
```

Nothing here is checked. `destination` may be missing, `id` may be a number, and
the compiler cannot help. Rename a field and every one of these silently returns
`undefined`.

**Do** — one schema, parsed once, at the read:

```ts
export const agentManifestAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(AGENT_ACTION_TYPES.SLACK_MESSAGE_POST),
    provider: z.literal("slack"),
    summary: z.string(),
    destination: z.object({
      kind: z.enum(["channel", "user"]),
      resolution: z.literal("chosen"),
      id: z.string().trim().min(1).max(120),
      label: z.string().trim().min(1).max(120),
    }),
  }),
]);

export type AgentManifest = z.infer<typeof agentManifest>;

export function parseAgentManifest(value: unknown): AgentManifest { … }
```

```ts
const manifest = parseAgentManifest(version.manifest);
const slack = manifest.actions.find(
  (action) => action.type === "slack.message.post",
);
const id = slack?.destination.id;
```

`packages/validation/src/agent-manifest.ts` is the pattern. A shape that crosses
a package boundary — a `Json` column two apps read, a payload one app writes and
another consumes — lives in `packages/validation/src`, one module per shape, and
is imported by subpath (`@crm/validation/agent-manifest`). Rules that follow from
it:

- The schema describes what is **actually stored**, not the loosest thing that
  parses. If a test fixture fails the schema, fix the fixture — a fixture that
  omits required fields is testing data that cannot exist.
- Parse failure is a real error with a real message. Do not swallow it into an
  empty array, because "unreadable manifest" and "no actions" are different
  problems and only one of them is the user's fault.
- Derive types with `z.infer`. Never hand-write an interface beside a schema;
  they drift.

## Design

@docs/design.md
