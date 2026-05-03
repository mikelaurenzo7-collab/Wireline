# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # tsx server.ts — runs Express on :3000; no separate Vite step
npm run lint       # tsc --noEmit  (the only "lint" — there is no eslint config)
npm run build      # vite build  +  esbuild server.ts → dist/server.js (CJS)
npm run vercel-build  # frontend-only build used by Vercel (api/index.ts is compiled by Vercel)
npm start          # node dist/server.js — production
npm run clean      # rm -rf dist
```

There is no test framework wired up. CI (`.github/workflows/ci.yml`) runs **only** `npx tsc --noEmit` and `npm run build`. Both must exit 0 before any change is considered done — the Copilot instructions file enforces this as the verification gate (".github/copilot-instructions.md").

Bootstrap scripts (one-off, require `WIRELINE_BOOTSTRAP_EMAIL` + `WIRELINE_BOOTSTRAP_PASSWORD` in env, never in source):
```bash
npx tsx setup-account.ts   # create/upgrade founder account in Supabase
npx tsx check-env.ts       # smoke-test Supabase creds + create user
```

## Architecture

**Single-server, single-page app.** `server.ts` (~6,500 lines) is the whole backend — every route is registered at module load. `src/App.tsx` is the SPA shell; every page route is lazy-loaded via `React.lazy`. Vite builds the frontend to `dist/`, esbuild bundles `server.ts` to a single CJS file. On Vercel, `api/index.ts` re-exports `server.ts`'s `app` as the serverless handler; the SPA is served from CDN.

```
Vite dev (HMR) ──proxy /api──► Express :3000 ──► Supabase / Vapi / Anthropic / Gemini / Gmail / Stripe
```

Locally, `vite.config.ts` proxies `/api/*` → `http://localhost:3000`, so you don't run two dev servers — only `npm run dev` (tsx server.ts) is needed; the Vite dev server is rarely used standalone.

### Two LLM providers by design

Wireline runs Anthropic Claude (Opus 4.7) **and** Google Gemini simultaneously. **Both are required.** Removing either breaks production:
- **Claude** powers every `/api/claude/*` endpoint, post-call enrichment, Daily Brief, Triage, Insights, Contact Profile, and every recipe in `src/components/ClaudeRecipes.tsx`.
- **Gemini** is the fallback when `ANTHROPIC_API_KEY` is unset and the legacy voice-model provider for Vapi.

All Claude calls **must** go through `src/lib/claude-brain.ts` — never import `@anthropic-ai/sdk` from a component or directly from `server.ts`. The brain centralizes prompt caching, adaptive thinking, audit capture (AsyncLocalStorage), and the `TOOLS` registry of structured-output schemas. New Claude-powered logic = new function in `claude-brain.ts` + new endpoint in `server.ts` calling it.

### Cost / budget pipeline

Every Claude round trip pushes a `ClaudeCallMeta` record into an AsyncLocalStorage context (`withAuditCapture` / `runInAuditContext`). Endpoints flush these into `wireline_audit_log`. A monthly per-user budget (`/api/spend/budget`) gates Claude calls: when `hard_cap` is on and the limit is hit, Claude endpoints return **HTTP 402** and `spend.exceeded` fires as an outbound webhook. Per-user rate limit on `/api/claude/*` is 60 req/min (in-memory; swap to Redis for multi-region).

### Lazy-loaded routes — do not "clean up" based on grep

Every page in `src/components/` is imported via `React.lazy(() => import("./components/X"))` in `src/App.tsx`. Static analyzers and grep will report many components and helpers as "unused". They are not. `AGENTS.md` lists the load-bearing files that **must not be deleted**:

`claude-brain.ts`, `ClaudeRecipes.tsx`, `ContactProfile.tsx`, `InsightsView.tsx`, `TriageInbox.tsx`, `DailyBrief.tsx`, `OnboardingQuickstart.tsx`, `ErrorBoundary.tsx`, `CsvExportButton.tsx`, `WebhooksManager.tsx`, `IntakeKeysManager.tsx`, `KnowledgeBaseManager.tsx`, `StripeBillingCard.tsx`.

Same applies to deps: `@anthropic-ai/sdk`, `@google/genai`, `@google/generative-ai`, `@vapi-ai/web`, `@supabase/supabase-js` are all required even if a static check flags them — usage crosses module boundaries.

### Database

Supabase Postgres with RLS on every `wireline_*` table. `supabase_schema.sql` is **idempotent** — the bottom contains `ALTER TABLE … ADD COLUMN IF NOT EXISTS` migrations safe to re-run on existing installs. Do not delete that section. Schema changes go in this file as new idempotent ALTERs, not as rewrites.

### Stripe billing — source of truth

`wireline_subscriptions` mirrors the Stripe sub. The `/api/stripe-webhook` handler keeps it in sync **and** writes through to `wireline_settings.subscription_status` + `max_agents` so legacy gates (`/api/outbound/dial`, `/api/vapi-webhook`) keep working unchanged. Plan catalog (price/agent-cap/features) lives in `STRIPE_PLANS` inside `server.ts`; only price IDs are env-driven, so test/live mode swap by changing env. Webhook verification needs raw bytes — `app.use("/api/stripe-webhook", express.raw(...))` is registered **before** the global `express.json()`; preserve that ordering.

### Vapi webhook signature

`POST /api/vapi-webhook` verifies `X-Vapi-Signature` HMAC-SHA256 against `VAPI_WEBHOOK_SECRET` using `timingSafeEq`. When the secret is unset, signature checks are skipped (acceptable for dev only).

### Inbound intake API

`POST /api/intake/lead` and `/api/intake/leads` are public, authenticated by `X-Wireline-Key: wlk_…` (SHA-256 stored, plaintext shown only once at creation). Per-key auto-dial composes with the post-call enrichment + audit pipeline. `Idempotency-Key` is enforced via a partial unique index — concurrent retries return the original `lead_id` with `idempotent_replay: true`.

### Webhook delivery queue

Outbound webhooks persist a `wireline_webhook_deliveries` row. Retries use exponential backoff (30s · 2m · 10m · 1h, max 5 attempts → `dead`). A 30-second background scheduler (`setInterval`, `.unref()`'d) picks up due retries. Each request carries `X-Wireline-Attempt: <n>`.

### Adaptive thinking + cache invariants

Deep paths (`agent-review`, `forge`, multi-page crawl, post-call analysis) use Claude's adaptive thinking. The cached prefix is always `agent persona + knowledge` — keep it stable across calls or you lose cache hits. New tools go in the `TOOLS` constant in `claude-brain.ts`; new recipes go in `RECIPE_META` + the `RecipeModal` switch in `ClaudeRecipes.tsx`.

## Conventions

| Concern | Where it goes |
|---|---|
| New API endpoint | `server.ts` — search for an existing analogue first; reuse `authenticateUser` middleware |
| New frontend page | `src/components/X.tsx` + lazy import in `src/App.tsx` + entry in `NAV_ITEMS` and `PAGE_TITLES` |
| Claude-powered logic | `src/lib/claude-brain.ts` (never call `@anthropic-ai/sdk` directly elsewhere) |
| New Claude tool schema | `TOOLS` constant in `claude-brain.ts` |
| New recipe modal | `RECIPE_META` + `RecipeModal` switch in `src/components/ClaudeRecipes.tsx` |
| DB schema change | `supabase_schema.sql` — append idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` |
| New env var | document in `.env.example` |
| Path alias | `@/*` → repo root (configured in `tsconfig.json` + `vite.config.ts`) |

Auth: `authenticateUser` middleware verifies the Supabase JWT from `Authorization: Bearer …`. Frontend uses `authFetch` from `src/lib/api.ts`, which attaches the token and a 120s default timeout.

Logging: use the `log.{debug,info,warn,error}` helper at the top of `server.ts` (single-line JSON in prod, pretty in dev) — don't add bare `console.*` calls.

Security headers + CSP are set in `server.ts` (no `helmet` dep). `CORS_ORIGINS` (comma-separated) is required in production; dev allows all origins when unset.

`VERCEL_URL` auto-derives `APP_URL` on preview deploys, so OAuth callbacks and absolute links work without manual config — only set `APP_URL` explicitly for a custom production domain.

## Verification gate (from `.github/copilot-instructions.md`)

Before claiming any change is "done", "fixed", or "working":

```bash
npx tsc --noEmit    # zero errors
npm run build       # vite + esbuild, both succeed
```

The systematic-debugging instructions at `.github/instructions/systematic-debugging.instructions.md` and the writing-plans skill at `.github/instructions/writing-plans.instructions.md` are part of the contract — read them before tackling cross-layer bugs or multi-file features.
