# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Wireline is a multi-tenant AI voice-agent SaaS: React 19 + Vite frontend, Express + TypeScript backend, Postgres (Supabase-hosted) via Drizzle ORM, deployed on Vercel. Product loop is **Create -> Train -> Wire -> Run** (build an agent, configure it deeply, connect numbers/integrations/billing, run it in Studio). See `README.md` for the product pitch and `ARCHITECTURE.md` for the runtime contract — this file only covers what those don't: commands and non-obvious cross-file structure.

## Commands

Single dev service — `npm run dev` runs one Node process (`tsx server.ts`) that serves Express + the API and embeds Vite HMR in middleware mode, all on `http://localhost:3000`. There is no separate frontend dev server to run.

```bash
npm install
npm run dev                          # http://localhost:3000
```

Type checking / lint (four separate `tsc` configs — see below for why):

```bash
npm run lint                 # full app tsc --noEmit (memory-heavy: don't run alongside build+test+dev)
npm run lint:server          # tsc against tsconfig.server.json (server-only slice)
npm run lint:strict          # tsc against tsconfig.strict.json
npm run lint:audit-modules   # tsc against tsconfig.audit-modules.json (modules held to a stricter bar)
npm run lint:eslint          # eslint --max-warnings 0 .
npm run format                # prettier --write
npm run format:check
```

Tests (Vitest, `vmThreads` pool; Playwright for e2e):

```bash
npm run test                          # watch mode, excludes tests/e2e/**
npm run test:run                      # single run, same exclusion
npx vitest run tests/<file>.test.ts   # a single test file
npx vitest run -t "<test name>"       # filter by test name
npm run test:e2e                      # Playwright (homepage, a11y, audience-tab smoke)
npm run test:coverage
```

Build / smoke:

```bash
npm run build          # assets + vite build + esbuild server bundle -> dist/server.cjs
npm run smoke:server   # requires the built bundle actually boots
```

Verification gates — run the narrowest one while iterating, the full one before merge:

```bash
npm run verify         # design + source-control + routes + docs + openapi + token-parity + Stripe catalog + build + smoke
npm run verify:full    # verify, plus: 3x tsc, eslint, authz, server-bootstrap, tsconfig-excludes, CSP, runtime-policy,
                        # api-error shape, npm audit, full test suite, and the browser-extension packaging check
npm run verify:contracts   # narrow: product-voice / marketing / metadata / event-taxonomy / billing / sales contract tests only
node apps/browser-extension/scripts/build.mjs --check
```

Individual check scripts (each is also a `verify:full` component; run standalone when iterating on that one concern): `design:check`, `authz:check` (regenerates `docs/AUTHZ_MATRIX.md`), `docs:check`, `route-registry:check`, `csp:check`, `runtime:policy:check`, `stripe:catalog:check`, `design:tokens:check`, `tenant-insert:check`, `server:bootstrap:check`. Full list in `package.json` `scripts`.

Database — **the dev Postgres instance is a shared, already-migrated, live Supabase database, not a disposable local one.** Do not run `db:push` or `db:migrate` against it without checking state first:

```bash
npm run db:health      # read-only state check — run this before anything else DB-related
npm run db:generate    # drizzle-kit generate (new migration from schema.ts diff)
npm run db:studio
```

## Architecture — things that span multiple files

### Tenant isolation is Postgres-role-based, not Supabase Auth

Every tenant-scoped query runs as Postgres role `wireline_server` with a per-request `app.current_user_id` GUC, not `auth.uid()` / Supabase Auth (Wireline has its own scrypt-based auth — see `src/lib/auth-service.ts`). The mechanism: `src/lib/server-context.ts` monkey-patches `pool.connect()` to run `SET LOCAL ROLE wireline_server` + `SELECT set_config('app.current_user_id', $1, true)` on every checkout, reading the current user id out of an `AsyncLocalStorage`-based `tenantStore`. RLS policies on each table then key off that GUC. Practical consequence: **every new table needs an explicit `GRANT ... TO wireline_server`** — migration `0069` granted it only on tables that existed at that time, there's no `ALTER DEFAULT PRIVILEGES` covering tables created afterward, and forgetting the grant means RLS silently blocks the app's own queries (this has bitten the codebase more than once — see `docs/LAUNCH_READINESS_FINETUNE_2026-07-19.md`).

### Schema/migrations: the committed migrations are necessary but not sufficient

`drizzle/migrations/*.sql` (numbered, sequential) is the source of truth Claude can read, but **the live schema is also managed out-of-band directly against Supabase** (MCP or manual), so the physical database can be ahead of what's committed. The Drizzle migration journal (`drizzle/migrations/meta/_journal.json`) is *not* authoritative — it records only a subset of applied migrations. Known drift: `0082_phone_voice_routing.sql` targets `agents` but the real table is `wireline_agents`, making it a no-op; the columns it was meant to add were applied directly. When a migration needs to actually reach the live database, it has to be applied there explicitly (Supabase MCP `apply_migration` or equivalent) — merging the `.sql` file is not the same as running it. Write migrations idempotently (`IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`) since they may need to be re-run. Full detail in `AGENTS.md` and `DATABASE_SETUP.md`.

### Server: one entrypoint, one route registry

`server.ts` is the single canonical entrypoint for local dev, the Vercel bundled function, and the production build alike. It wires global middleware (CSP, CORS, same-origin, webhook body parsers, error formatting) and then calls `registerApiRoutes(app)` from `src/server/register-api-routes.ts` — every route file is mounted there explicitly, in an order that matters in a few documented places (e.g. `spendControlRouter` before `auditRouter` because of an intentionally-shadowed legacy endpoint). A route file that exists under `src/routes/` but isn't mounted there simply 404s silently in production; `route-registry:check` and `authz:check` both operate on the actually-mounted set, not the filesystem, so an orphaned route file passes neither check by omission — check `register-api-routes.ts` directly when a route "exists" but doesn't respond. `src/routes/` holds the HTTP handlers; `src/lib/` holds the business-logic/service layer routes call into; `src/middleware/auth.ts` (`authenticateUser`) is the standard per-route auth gate; `src/db/schema.ts` is the single Drizzle schema file for the whole app.

### AI/voice provider chain

Structured reasoning (`src/lib/ai-models.ts` is the central policy/catalog): direct OpenAI Responses API primary (GPT-5.6 Terra default) -> Gemini -> Vercel AI Gateway as the governed last-resort multi-model route. Direct xAI is opt-in only via `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK=true` when `XAI_API_KEY` is present; `WIRELINE_OPENAI_STRUCTURED_MODEL` overrides the OpenAI model id.

Voice is a separate, easy-to-conflate set of paths (`src/lib/voice/`, `docs/GROK_LIVE_VOICE.md`): production PSTN calls run through Twilio (numbers, signed inbound SMS, opt-out, delivery callbacks) with Vapi orchestrating the call itself using OpenAI GPT-4o as the managed call model (Gemini fallback). Separately, OpenAI Realtime powers *all* customer-facing live-voice test/simulation sessions (Studio sandbox, ChatGPT account simulation, and the unauthenticated guest voice demo) via server-minted ephemeral secrets. The xAI Grok realtime contract remains an explicit internal experiment only. Neither realtime test path is failover for real customer calls — conflating "realtime voice" with "the production call path" is a common category error when reading this code.

Outbound marketing dials (calls and SMS) must pass `evaluateOutboundDialGate()` in `src/lib/outbound-dial-gate.ts` — the single shared TCPA/tenant-DNC/federal-DNC/quiet-hours gate. Any new outbound-dial code path needs to call this, not a partial/local check.

### Design system

Wireline Letterpress (Aurora palette) is the only active design system — source of truth is `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/styles/design-system.css`, `src/lib/wireline-design-vision.ts`. Electric violet is the sole action color, silver is the wire accent (not a broad palette), obsidian (dark) / near-white (light) canvases, Inter Tight for display, Inter for body, IBM Plex Mono for labels/metadata. Do not reintroduce the retired forest-green/copper palette or add a second design system — `scripts/check-wireline-clear-system.mjs` (`npm run design:check`) contract-tests exact hex values and forbidden patterns.

### The dominant test pattern: source-reading contract tests

Beyond ordinary unit/integration tests, a large fraction of `tests/*-contract.test.ts` (and the `scripts/check-*.mjs` gate scripts) work by reading a source file as text with `readFileSync` and asserting specific strings/patterns are present or absent (`mustInclude`/`mustExclude`-style helpers, e.g. `scripts/clear-system/billing-integrity.mjs`), rather than executing the code. This is the idiomatic way to lock in a fix or a copy/compliance rule in this repo — when asked to "make sure X never says Y again," the expected shape is a contract test reading the relevant file(s) and asserting the string is gone, not (only) a runtime test.

### Documentation hierarchy

`README.md` (entry point + repo map), `CODEBASE_HEALTH.md` (cleanup/deletion policy, source-control boundaries — read this before deleting or adding any doc), `ARCHITECTURE.md` (runtime contract, security invariants), `docs/README.md` (full index of everything under `docs/`, with an Active/Historical/Planned status per document). **Every new durable Markdown doc must be linked from `docs/README.md`** (or explicitly marked historical) — `npm run docs:check` enforces this. `docs/` also contains many dated point-in-time audit/pass snapshots (`*_2026-MM-DD.md`); check `docs/README.md`'s status tag before treating one as current guidance.

## Repository hygiene (enforced by `verify`/`verify:full`, not just convention)

- Never commit generated output: visual QA artifacts, screenshots, `.grok/artifacts`, coverage, Playwright reports, `dist/`, browser-extension packages, local patches.
- No parallel design systems, no duplicate source-of-truth files, no `*-v2` migration-wrapper files kept around after the migration is done.
- Provider credentials, tenant reads/writes, webhook verification, and billing logic stay server-owned — never in browser/mobile client state.
- Browser extension (`apps/browser-extension/`) is explicit-user-action only: no broad host permissions, no silent browsing/page harvesting, no token storage.
