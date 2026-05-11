# Instructions for coding agents

This file is read by every coding agent that opens this repo (Claude Code,
Codex, Jules, Cursor agents, etc.). Read it before doing anything destructive.

## Architecture (do not break)

Wireline runs on **two LLM providers simultaneously by design**:

- **Anthropic Claude (Opus 4.7)** is the primary brain. It powers every
  `/api/claude/*` endpoint, the post-call enrichment pipeline, the Daily
  Brief, the Triage Inbox, the Insights view, the Contact Profile, and
  every recipe in `src/components/ClaudeRecipes.tsx`.
- **Google Gemini** is retained as a fallback for paths where the
  operator hasn't configured `ANTHROPIC_API_KEY` yet, and as the legacy
  voice provider for Vapi.

**Both providers are required.** Removing either one breaks production.

## Files that MUST NOT be deleted

These are load-bearing — touching them without operator approval will
break the deployment:

- `src/lib/claude-brain.ts` — server-side Anthropic SDK wrapper. Every
  Claude endpoint goes through this.
- `src/components/ClaudeRecipes.tsx` — modal recipe UI. Wired into
  AgentTraining, OutboundDialer, EmailInbox, CallLogs, FleetSettings.
- `src/components/ContactProfile.tsx` — unified per-customer history
  view. Phone numbers across the app deep-link here.
- `src/components/InsightsView.tsx` — funnel + topic clusters + heatmap
  + leaderboard + failure modes.
- `src/components/TriageInbox.tsx` — operator's daily-attention surface.
- `src/components/DailyBrief.tsx` — Claude-authored morning summary on
  the dashboard.
- `src/components/OnboardingQuickstart.tsx` — first-run flow for new
  operators (auto-hides once they're set up).
- `src/components/ErrorBoundary.tsx` — app-level render-error recovery.
- `src/components/CsvExportButton.tsx` — used by CallLogs / Outbound /
  Insights / Triage for operator data export.
- `src/components/WebhooksManager.tsx` — outbound webhook CRUD UI in
  Admin. Handles HMAC-SHA256-signed deliveries to Slack/CRM/Zapier/etc.
- `src/components/IntakeKeysManager.tsx` — inbound lead-intake API
  key CRUD UI in Admin. Plaintext shown only once at create time;
  SHA-256 hash stored. Powers `POST /api/intake/lead`.
- `src/components/KnowledgeBaseManager.tsx` — cross-agent fact
  manager at `/knowledge`. Lists every row in `wireline_knowledge`,
  filterable by agent, searchable, with inline edit + bulk delete.
- `src/components/StripeBillingCard.tsx` — real billing UI in
  AdminSettings → BILLING_STATE tab. Renders plan picker, current
  subscription card, and "Manage subscription" button (Stripe
  Customer Portal). Falls back to a configuration-needed notice
  when STRIPE_SECRET_KEY is unset.
- `src/lib/tcpa-consent.ts` — TCPA + state recording-consent compliance
  gate. Powers `/api/tcpa/consent-check`, the consent ledger insert in
  the Vapi webhook, and the pre-dial guard in `/api/outbound/dial`.
  Do not remove — removing it disables consent enforcement.
- `src/lib/tenant-quotas.ts` — per-tenant daily/monthly hard caps on
  Claude tokens, voice minutes, concurrent dials, knowledge rows, and
  intake RPM. Powers `/api/quotas/*` and the quota guard in the dial
  endpoint. Plan defaults are in `PLAN_DEFAULTS`; per-tenant overrides
  are stored in `wireline_quota_limits`.
- `src/lib/job-queue.ts` — Postgres-backed async job queue. Replaces
  inline blocking Claude calls with durable, retryable jobs. Worker runs
  in long-lived processes; Vercel uses `POST /api/jobs/sweep` via cron.
- `src/lib/soc2-controls.ts` — SOC 2 CC6/CC7/CC8 evidence helpers:
  RBAC role hierarchy, access review, change log, incident response helpers.
- `Dockerfile` — multi-stage production image (node:22-alpine, non-root
  user, healthcheck). Required for single-tenant / self-hosted deploys.
- `docker-compose.yml` — single-tenant compose stack (app + Valkey Redis
  for rate-limit counters).

## Stripe — billing source of truth

`wireline_subscriptions` mirrors the Stripe sub. The Stripe webhook
(`/api/stripe-webhook`) keeps it in sync AND updates
`wireline_settings.subscription_status` + `max_agents` so all the
existing legacy gates (`/api/outbound/dial`, vapi-webhook) keep
working without modification. Plan catalog lives in `server.ts`
(`STRIPE_PLANS`); only price IDs are env-driven so test/live mode
swap cleanly.

## Dependencies that MUST stay in package.json

- `@anthropic-ai/sdk` — used by `src/lib/claude-brain.ts` and every
  Claude endpoint in `server.ts`. **Do not remove this even if a static
  analyzer reports it as unused — usage crosses module boundaries
  (server.ts imports from src/lib/claude-brain.ts).**
- `@google/genai` and `@google/generative-ai` — Gemini fallback paths.
- `@vapi-ai/web` — voice integration.
- `@supabase/supabase-js` — database / auth.

### Optional integrations (do not strip even if unconfigured)

The following services are wired through the Action Engine and run as
no-ops when their env vars are unset — they MUST stay wired so operators
can opt in at any time without a code change:

- **Apollo.io** — autonomous lead prospecting. Powers the
  `prospect_leads` action type via `src/lib/apollo-service.ts`. Gated
  by `APOLLO_API_KEY`; absent key → `searchLeads()` returns `[]`.
- **DocuSign** — e-signature for the `send_contract` action type via
  `src/lib/docusign-service.ts`. Gated by `DOCUSIGN_ACCOUNT_ID` plus
  one of `DOCUSIGN_JWT_TOKEN` (preferred) or `DOCUSIGN_ACCESS_TOKEN`
  (fallback). Absent creds → `sendContract()` logs a warning and
  returns `null`; the operator-approval draft path in
  `action-engine.ts` still runs.
- **Salesforce CRM** — bi-directional contact + opportunity sync via
  `src/lib/salesforce-service.ts`. Gated by `SALESFORCE_CLIENT_ID` +
  `SALESFORCE_CLIENT_SECRET` + `SALESFORCE_INSTANCE_URL`; absent creds
  → `searchContacts()` returns `[]`, `logCall()` and
  `createOpportunity()` return `null`. Claude tool schemas
  (`crm_search_contacts`, `crm_log_call`, `crm_create_opportunity`)
  reference these functions.
- **HubSpot CRM** — bi-directional contact + deal sync via
  `src/lib/hubspot-service.ts`. Gated by `HUBSPOT_ACCESS_TOKEN`;
  absent token → `searchContacts()` returns `[]`, `logCall()` and
  `createDeal()` return `null`.

## Env vars that MUST stay documented in `.env.example`

These appear in the canonical group order used everywhere in the app
(Core → AI → Voice → OAuth → Billing → Action Engine → Infrastructure →
Security). See `src/lib/integrations-registry.ts` for the runtime mirror.

**Core**
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — db + auth.
- `SUPABASE_SERVICE_ROLE_KEY` — backend service role for privileged DB ops.

**AI**
- `ANTHROPIC_API_KEY` — unlocks every `/api/claude/*` endpoint and the
  Daily Brief + Insights Claude paths. Do not remove.
- `GEMINI_API_KEY` — fallback for legacy paths.

**Voice**
- `VAPI_PRIVATE_KEY` / `VITE_VAPI_PUBLIC_KEY` — voice.
- `VAPI_WEBHOOK_SECRET` — webhook signature verification (required in prod).

**OAuth**
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Gmail OAuth.
- `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` — Outlook OAuth.

**Billing**
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — billing + webhook sig.
- `STRIPE_STARTER_PRICE_ID` / `STRIPE_PRO_PRICE_ID` / `STRIPE_ENTERPRISE_PRICE_ID` — per-plan price IDs.

**Action Engine (optional)**
- `APOLLO_API_KEY` — optional. Required for the `prospect_leads` Action
  Engine path (autonomous Apollo.io prospecting).
- `DOCUSIGN_BASE_URI` / `DOCUSIGN_ACCOUNT_ID` / `DOCUSIGN_JWT_TOKEN` /
  `DOCUSIGN_ACCESS_TOKEN` — optional. Required for the `send_contract`
  Action Engine path (DocuSign e-signature).
- `SALESFORCE_CLIENT_ID` / `SALESFORCE_CLIENT_SECRET` /
  `SALESFORCE_INSTANCE_URL` — optional. Required for CRM sync actions
  (contact search, call logging, opportunity creation).
- `HUBSPOT_ACCESS_TOKEN` — optional. Required for HubSpot CRM sync
  actions (contact search, call logging, deal creation).

**Infrastructure**
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — distributed rate
  limits + spend cap counters. Strongly recommended in production.
- `SENTRY_DSN` / `VITE_SENTRY_DSN` — backend + frontend error tracking.

**Security**
- `OAUTH_STATE_SECRET` — HMAC for OAuth state tokens (CSRF protection).
- `WIRELINE_DATA_KEY` — AES-256-GCM key for the Secret Vault (webhook secrets).
- `CRON_SECRET` — bearer token for `POST /api/jobs/sweep` from cron.

## Database schema

`supabase_schema.sql` is **idempotent** — the bottom contains
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` migrations safe to re-run.
Do not delete those — existing installs depend on them to upgrade.

## Integration registry

`src/lib/integrations-registry.ts` is the single source of truth for
every external service this deployment talks to. The order of entries
in `INTEGRATIONS` is the canonical order surfaced in:

- `.env.example` section headers
- `README.md` integration table
- `GET /api/health/integrations` API response
- AdminSettings → System → Platform Health panel

When you add a new external service, append it there in the matching
group (core / ai / voice / oauth / billing / actions / infra / security)
and mirror the env var into `.env.example` in the same section.

## Build verification

Before pushing any change, run:

```bash
npx tsc --noEmit    # must be clean
npm run build       # must succeed (vite + esbuild server)
```

## If you think you should remove something

You probably shouldn't. Ask the operator first by leaving a PR comment
or a TODO. **Never delete a file just because grep says it has no
local references — server.ts and Vite's lazy-loaded routes resolve
imports dynamically.**
