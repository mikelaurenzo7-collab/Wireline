# CLAUDE.md

Guidance for AI assistants (Claude Code and others) working in this repository.
Read this first; it points at the deeper docs rather than duplicating them.

## What Wireline is

Wireline is a horizontal **AI voice + email agent platform** — one fleet of
agents that handles inbound calls, outbound dialing, SMS, and email for
businesses, with a live supervisor cockpit and a self-improvement loop.
Proprietary, single-tenant-per-account SaaS. © Wireline.

It is a single TypeScript codebase: a **React 19 + Vite** frontend and an
**Express** API that build into one Vercel serverless function. Data lives in
**Postgres (Supabase)** via **Drizzle ORM**. Voice runs on **Vapi +
ElevenLabs**; reasoning runs on **Claude**.

## Canonical docs (don't reinvent these)

| Topic | Read |
|---|---|
| System design, LLM tiering, data flows | `ARCHITECTURE.md` |
| New-engineer onboarding, patterns, "what NOT to do" | `CONTRIBUTING.md` |
| Design system (Lavender Noir + console, shadcn ratchet) | `DESIGN.md` |
| Database setup & migrations | `DATABASE_SETUP.md` |
| Deployment (Vercel) | `DEPLOY.md` |
| Doc index, SOC 2, SLA, incident response, authz matrix | `docs/` |

When a fact about pricing, models, or design lives in a source file, that file
is the **source of truth** — docs explain *why*, code is *what*. CI fails on
drift (see below).

## Commands

```bash
npm run dev            # Vite frontend + Express API on one process → http://localhost:3000
npm run verify         # full local gate: lint + docs:check + authz:check + test:run + security:audit + build
npm run build          # render assets → vite build → esbuild server → dist/server.cjs
npm run start          # run the production bundle

# Type & lint
npm run lint           # tsc --noEmit (uses 4GB heap — the codebase OOMs plain tsc)
npm run lint:strict    # strict typecheck over moat-adjacent files (tsconfig.strict.json)
npm run lint:eslint    # eslint --max-warnings 0 src/
npm run format         # prettier --write src

# Tests
npm run test           # vitest watch
npm run test:run       # vitest single-shot (CI mode)
npm run test:coverage  # with coverage; CI ratchets thresholds
npm run lint           # typecheck; required when DESIGN.md / director contract changes
npm run test:e2e       # Playwright chromium (needs dev server)

# Database (Drizzle)
npm run db:generate    # generate migration from src/db/schema.ts edits
npm run db:migrate     # apply migrations
npm run db:push        # push schema directly (dev)
npm run db:studio      # visual schema browser
npm run db:health      # verify RLS + connectivity per environment
```

Node **22+** is required (`.nvmrc` = 22; `engines.node >= 22`). Prefer running
the narrowest check while iterating, then `npm run verify` before declaring
done — it mirrors CI.

## Repository layout

```
server.ts              # Express boot + Vite dev middleware; security headers, CSP, route mounting
api/index.ts           # Vercel serverless entry (maxDuration 600s)
src/
├── pages/             # React route pages (lazy-loaded)
├── components/        # Reusable UI (~140 files); director/* for the Director workspace
├── routes/            # Express API handlers (50+ *-routes.ts, each with co-located *.test.ts)
├── lib/               # Pure logic — agent runtime, billing, integrations, Claude clients (260+ files)
├── middleware/        # auth, rate limits, validation, RBAC (require-role), same-origin
├── db/schema.ts       # Drizzle schema — single source of truth for 57 tables
├── data/              # Static config (contact agents, verticals)
├── services/          # Client-side API service layer
├── contexts/ hooks/   # React contexts & custom hooks
├── types/ constants/  # Shared types & app constants
drizzle/migrations/    # 43 idempotent SQL migrations (IF NOT EXISTS)
scripts/               # ops scripts (stripe/vapi/resend sync, db health, authz matrix, seeding)
tests/                 # e2e/ (Playwright), integration/, helpers/
contracts/             # api-types.ts shared client/server contract
```

## LLM tiering (the moat) — read before touching any Claude path

`src/lib/claude-models.ts` is the **single source of truth** for model IDs.
`ARCHITECTURE.md §1` explains the split. Summary:

- **Voice runtime** → Claude Sonnet 4.6 (latency-bound live calls)
- **Reasoning layer** → Claude Opus 4.7 (`brief`, `coach`, `postCallAnalysis`,
  `dailyBrief` in `claude-recipes.ts` — runs off the live wire)
- **Simple tasks** → Claude Haiku 4.5 via `selectModelForTask("simple")`
- **Fallback / grounded search** → Gemini Flash
- **Per-agent override** → operators can pick a per-agent voice model +
  temperature from `VOICE_MODEL_CATALOG` (anthropic / google / openai / xai /
  openrouter). Bounded by design: curated + env-gated catalog, latency badges,
  `resolveVapiVoiceModelSelection()` validation, and `clampVoiceTemperature()`
  to `[0,1]`. NULL columns inherit the tenant default. See `ARCHITECTURE.md §1.3`.

Rules:
- Never hardcode a model ID — import from `claude-models.ts`.
- Never change the **voice** layer without measuring TTFT on the real
  ~18 KB system prompt; never change the **reasoning** layer without a
  benchmark showing equal-or-better adaptive quality on Wireline workloads.
- Per-agent model options must stay in `VOICE_MODEL_CATALOG` (curated +
  env-gated + latency-flagged) — never expose an unbounded model field on the
  voice path.
- **Don't add a new `/api/claude/*` route without adding it to the spend-cap
  array** and the authz allowlist.

When you (the assistant) are asked which model you are, answer with the
configured model identifier from your harness — do not put any model
identifier into commits, PR titles/bodies, code, or comments.

## Conventions and required patterns

**Auth** — httpOnly `wireline_session` cookie (`SameSite=Lax`, `Secure` in
prod); client calls use `credentials: "include"`. Bearer tokens still accepted
for scripts. Protect routes with `authenticateUser` from `src/middleware/auth`.

**Default-deny authz** — every `/api/*` route must be protected or explicitly
allowlisted. `npm run authz:check` (`scripts/generate-authz-matrix.ts`)
enforces this and regenerates `docs/AUTHZ_MATRIX.md`. RBAC via
`requirePermission("…")` from `src/middleware/require-role`.

**Input validation** — Zod for all external input. Use `validateBody(schema)` /
`validateQuery(schema)` middleware on routes.

**Rate limiting** — `createRateLimiter({ windowMs, max })` from
`src/middleware/api-rate-limits`. New routes need a limiter (Upstash Redis in
prod, in-mem LRU locally).

**CSRF / same-origin** — `assertSameOrigin` rejects mutating `/api/*` with a
foreign `Origin`/`Referer`. Vendor webhooks and public intake are excluded.
Don't add `cookie-parser` without CSRF defenses.

**Webhooks** — always verify signatures (HMAC + `timingSafeEqual`): Vapi,
Stripe, Twilio, ElevenLabs.

**CSP** — one source: `src/lib/csp.ts`. Don't duplicate CSP logic.

**SSRF** — guard URL inputs with `isSsrfUrl()`.

**Logging** — use the structured `log.*` logger, never `console.log`.

**Styling** — Tailwind CSS 4 + shadcn primitives; no raw CSS outside
`src/index.css`. All viewports equal — design at 390px, but escalate layouts
into `lg:`/`xl:`/`2xl:` so 1440px+ screens never render like tablets. 44×44px
touch targets via invisible pseudo-elements/padding, NOT inflated visual sizes.
Use `clsx()` + `tailwind-merge`. Director/mission-control surfaces use
`WL_DIRECTOR_CLASSES`
and copy from `src/lib/wireline-director-design.ts`; run `npm run test:design`
when that contract changes.

**TypeScript** — strict on moat-adjacent files (`tsconfig.strict.json`). No
`as any` at assignments; use proper types or `as unknown as T`. Path alias
`@/*` → repo root.

**Formatting** — Prettier (`semi`, double quotes, `printWidth: 100`, 2-space).
Husky + lint-staged run prettier + eslint `--fix` on staged `*.{ts,tsx}`.

## Database changes

1. Edit `src/db/schema.ts` (source of truth for all 57 tables).
2. `npm run db:generate` → review the new migration in `drizzle/migrations/`.
3. Migrations must be **idempotent** (`IF NOT EXISTS` / `ADD COLUMN IF NOT
   EXISTS`) — they get re-run.
4. RLS is enforced on every Supabase table; service-role inserts must include
   `user_id` (guarded by `scripts/check-user-id-inserts.mjs` in CI).
5. Account deletion cascades manually via `src/lib/account-deletion.ts`.

## Testing conventions

- Unit tests live next to source: `foo.ts` → `foo.test.ts`. Routes co-locate
  `*-routes.test.ts`; some have `*.integration.test.ts` (run against live
  Postgres when `POSTGRES_URL` is set).
- E2E + accessibility in `tests/e2e/` (Playwright, chromium only in CI).
- Coverage ratchets — **don't remove or weaken existing tests**; CI fails if
  coverage drops below current thresholds.
- Notable safety nets: `agent-runtime.redteam.test.ts`, design-audit/ratchet
  tests, route manifest tests, `claude-models.test.ts`.

## CI gate (`.github/workflows/ci.yml`)

`verify` job runs: security audit → typecheck → user_id-insert guard →
authz default-deny guard → eslint → tests+coverage → tenant-isolation
integration (if secret present) → docs/pricing drift → strict typecheck →
build → server smoke. `e2e` job runs Playwright. Match `npm run verify`
locally before pushing. Also: `codeql.yml`, `delete-on-merge.yml`.

## Source-of-truth files & drift checks

| File | Owns | Drift check |
|---|---|---|
| `src/lib/claude-models.ts` | Model IDs & tiering | `ARCHITECTURE.md` review |
| `src/lib/plan-catalog.ts` | Pricing & plan unit economics | `npm run docs:check` (vs README table) |
| `src/db/schema.ts` | All 57 tables | `npm run db:check` |
| `src/lib/wireline-director-design.ts` | Director UI copy, CSS classes, capabilities | `npm run test:design` |
| route definitions | AuthZ posture | `npm run authz:check` → `docs/AUTHZ_MATRIX.md` |

## What NOT to do

- Don't hardcode model IDs or add Claude routes outside the spend-cap array.
- Don't add `cookie-parser` without CSRF defenses, or duplicate CSP logic.
- Don't weaken/remove tests, or drop coverage.
- Don't `console.log` — use `log.*`.
- Don't commit `.env` or any secrets (`.env.example` is the documented key list).
- Don't let pricing, models, schema, or design contracts drift from their
  source-of-truth files.

## Git & PR workflow

- Branch off `main`; never push directly to `main`. (If a session assigns a
  specific working branch, develop and push there.)
- Commit messages: imperative subject ≤72 chars, blank line, body explaining
  **why**.
- Run `npm run verify` before pushing. Open PRs against `main`, ready for
  review (not draft); CI must be green.

## App-running helper

A `run-wireline` skill (`.claude/skills/run-wireline/`) builds, launches, and
drives the app for smoke tests / visual QA. Prefer it when asked to run,
screenshot, or QA Wireline.
