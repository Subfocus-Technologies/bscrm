# Running the API and agent on Railway

Our install splits the deploy: the Next.js app (`apps/app`) stays on Vercel, and the API,
the agent and the scheduled jobs run in the Railway project `bscrm` beside its Postgres.
Upstream deploys all three to Vercel. Nothing outside this folder and the root
`.dockerignore` changes, so upstream merges stay clean.

| Railway service | Built from | What it does |
| --- | --- | --- |
| `api` | `api.Dockerfile` | `bun src/main.ts`. Pre-deploy runs `prisma migrate deploy`. Public at `crm-api.subfocustech.co.uk`. |
| `agent` | `agent.Dockerfile` | `eve start` on Node 24. Workflow state is on a volume at `apps/agent/.eve/.workflow-data`. |
| `cron` | `cron.Dockerfile` | Runs `cron.ts` every five minutes and exits. It replaces the crons in `apps/api/vercel.json`, which only Vercel reads. |

Service settings (Dockerfile path, pre-deploy, health checks, watch patterns, cron
schedule) are set on each Railway service, not in a config file: Railway has deprecated
`railway.json`.

## What differs from upstream's Vercel deploy

- **Sandbox.** Railway has no Docker, so eve's `defaultBackend()` falls back to its
  built-in shell instead of Vercel Sandbox. It still has no network.
- **Model access.** Off Vercel there is no OIDC, so the agent needs `AI_GATEWAY_API_KEY`.
- **Migrations** run on every `api` deploy (pre-deploy), not only in production.
- **Private networking.** The API reaches the agent, and the cron reaches the API,
  over `*.railway.internal`. The agent listens on `::` because that network is IPv6.

## Google sign-in

One OAuth client signs people in and reads their Gmail and Calendar. In the Google Cloud
console, signed in to the subfocustech.co.uk Workspace:

1. Create a project, `bscrm`.
2. **APIs & Services → Library**: enable the **Gmail API** and the **Google Calendar API**.
3. **OAuth consent screen**: user type **Internal**. Gmail's read scope is restricted, so an
   External app would need Google's verification and a yearly security assessment.
   Internal also keeps everyone outside the domain off the prompt.
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorised JavaScript origin: `https://crm.subfocustech.co.uk`
   - Authorised redirect URI: `https://crm-api.subfocustech.co.uk/api/auth/callback/google`
5. Put the client ID and secret on the Railway `api` service as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`. Set both or neither.

## DNS

subfocustech.co.uk's DNS is not on Vercel or Railway, so the records are added by hand:

| Name | Type | Value |
| --- | --- | --- |
| `crm` | CNAME | `cname.vercel-dns.com` (the Vercel app) |
| `crm-api` | CNAME | `g6pxf1g3.up.railway.app` (the Railway `api` service) |

## Variables

All three services share `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `AGENT_BRIDGE_SECRET`,
`APP_URL`, `API_URL`, `ALLOWED_SIGN_IN` and `CRM_TELEMETRY_DISABLED=1`. The `api` also has
`BETTER_AUTH_SECRET`, `AUTH_COOKIE_DOMAIN=.subfocustech.co.uk`, `CRON_SECRET`, the Google
pair and `AGENT_URL` (private). The `cron` has `API_INTERNAL_URL` and `CRON_SECRET`. The
Vercel app needs the same `BETTER_AUTH_SECRET` and `AGENT_BRIDGE_SECRET`, Postgres's
public URL, and the agent's public Railway domain as `AGENT_URL`.
