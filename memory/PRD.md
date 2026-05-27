# Wireline — PRD (memory file)

> Self-hosted PRD for the dev environment. The handoff narrative lives
> in the chat job summary; this file is the long-running source of truth
> for what's built, what's next, and where the moats are.

## Product

**Wireline** is the horizontal AI voice + email + SMS agent platform
for businesses that pick up the phone. Self-hosted JWT auth over
Supabase Postgres (Drizzle). React 19 + Vite + Tailwind 4 frontend.
Express on Vercel serverless functions for the API. Vapi runtime,
Deepgram Nova-3 STT, ElevenLabs Flash v2.5 TTS, Claude Sonnet 4.6 on
the voice path / Opus 4.7 on reasoning.

Voice + email is *one* product — same agent personality across both
channels, one fleet of personas, one operator cockpit. Pricing is
flat-monthly + voice-minute overage. Stripe drives billing.

## Architecture (mental model)

- `src/pages/` — lazy-loaded React routes
- `src/components/` — UI building blocks (~140 files; recipes/ + fleet/
  + insights/ + dialer/ are the major sub-folders as we slice the
  god-files)
- `src/routes/` — Express API handlers (40+)
- `src/lib/` — pure logic: agent runtime, personality vibes, claude
  brain, vapi client, billing, rate limiting, audit logging
- `src/data/` — static config (contact-agents, vertical wedges)
- `src/middleware/` — auth, cors, timeouts, rate limits
- `src/db/schema.ts` — single source of truth for Postgres schema
- `tests/e2e/` — Playwright E2E
- `tests/visual/` — Playwright visual-regression
- `src/**/*.test.ts` — Vitest unit tests (139 passing)

## Completed work

See `AUDIT_WINS.md` for the running ledger of structural wins. Most
recent (2026-02):

- ✅ Sliced **ClaudeRecipes.tsx** (2,862 LOC → 16-LOC barrel) into
  `src/components/recipes/{types,shared,RecipeModal,ClaudeRecipeButton}.tsx`
  plus 13 individual form components in `recipes/forms/*`. Verified
  via TS lint + 139/139 tests + production build green. Vite now
  code-splits the recipe modal into its own ~60 kB chunk.

Older context (from prior session, verified in repo):

- ✅ Voice + reasoning tiering split (Sonnet voice / Opus reasoning)
- ✅ `/api/health/models` live probe
- ✅ Test suite from 40 → 139 unit tests; 13 test files
- ✅ Aurora Rail sidebar (`src/components/layout/Sidebar.tsx`)
- ✅ Trust Signals + ROI Calculator
  (`src/components/marketing/{TrustSignals,RoiCalculator}.tsx`)
- ✅ Visual regression CI (`tests/visual/snapshots.spec.ts`,
  `.github/workflows/visual-regression.yml`)
- ✅ Strict-mode allowlist expanded to 16 files
- ✅ CI-enforced README pricing drift (`scripts/check-readme-pricing.mjs`)
- ✅ Custom JWT auth with 409 on duplicate signup
- ✅ Per-agent escalation: phone, email, warm-transfer (Vapi)

## Pending / backlog

### P1 — keep slicing the god-files
| File | LOC | Plan |
|---|---|---|
| `InsightsView.tsx` | 1,927 | Same playbook as ClaudeRecipes: barrel at original path; sub-modules under `src/components/insights/`. |
| `OutboundDialer.tsx` | 1,879 | Same — `src/components/dialer/`. |
| `FleetSettings.tsx` | 1,802 | Already started (helpers.tsx extracted). Continue: roster, editor, voice-tuning, schedule sections. |

### P1 — marketing
- Outcome / case-study cards on the landing page. **Blocked on real
  customer copy from the operator.**

### P2 — AUDIT_WINS backlog (verbatim)
1. Prompt caching on reasoning paths (`brief()`, `coach()`,
   `postCallAnalysis()`) — Anthropic `cache_control`, ~90% token
   savings on the 18 KB system frame.
2. Tenant backfill migration (flip stale `google`/`gemini-3.5-flash`
   settings rows → `anthropic`/`claude-sonnet-4-6`; gated + dry-run).
3. Ratchet `eslint --max-warnings 1100 → 700` over Q1 (100 per cycle).
4. Strict-mode allowlist → cover every `*.test.ts` peer (~20 more files).
5. Visual canary for live demo lines — nightly synthetic call, alert
   on TTFT or sentiment regression.
6. Resolve `src/lib/audit-routes.ts` ↔ `src/routes/audit-routes.ts`
   naming collision (rename the lib file).

### P2 — product
- Recipe marketplace: community-contributed agent templates.
- SOC 2 Type II audit documentation / compliance tracking.

## Key API endpoints

- `POST /api/auth/signup` — 409 on duplicate email (verified)
- `POST /api/vapi/webhook` — handles warm-transfer + escalation
- `GET  /api/health/public`
- `GET  /api/health/models` — live 1-token Anthropic probe (auth-gated)
- `PATCH /api/agents/:id` — per-agent escalation contacts
- `POST /api/claude/*` — every recipe endpoint (brief, coach,
  qualify, objection-drill, cold-email, persona-clone,
  summarize-thread, agent-review, knowledge-from-url,
  knowledge-from-document, forge, call-playbook, enrich-lead)

## Schema highlights

- `wireline_users(id, email, password_hash, role)`
- `wireline_agents(id, user_id, name, voice_id, escalation_phone,
   escalation_email, escalation_warm_transfer, escalation_keywords)`
- `wireline_settings(tenant_id, voice_llm_provider, voice_llm_model, …)`

## Critical reminders for the next agent

1. **Auth = self-hosted custom JWT.** Do not introduce Supabase Auth,
   Clerk, Auth0, etc. `src/lib/auth-service.ts` is the source of truth.
2. **`npm`, not yarn.** Project uses `package-lock.json`; do not run
   `yarn install` or commit `yarn.lock`.
3. **No behavioural drift on refactors.** When slicing a god-file,
   keep the original import path working via a barrel re-export.
   The 10 consumers of `ClaudeRecipes` all kept their `import …
   from "./ClaudeRecipes"` after the 2026-02 slice.
4. **Tests are the safety net.** 139/139 today. Run
   `npm run test:run` before declaring a refactor done. Run
   `npm run verify` for the full gate (lint + docs + tests + build).
5. **Git push is the user's job.** Use "Save to GitHub" — do not run
   `git commit` / `git push` directly.
