# Audit Wins — 2026-Q1 Pass

What changed in the deep-audit follow-up, why, and where to look. This
file is reference material — not a checklist to maintain. After 60 days,
the items here should be obvious from the codebase and this file can
roll into `docs/` or be deleted.

---

## 1. Voice + Reasoning Tiering, Finalised

**Previous state:** `claude-opus-4-7` on the live voice path AND the
reasoning path. Brand promise was "smartest agent." Real-world TTFT against
an 18 KB system prompt was 1.5–2.5 s — long enough that callers said
"hello? are you there?"

**New state:**

| Layer | Model | TTFT (real-world) |
|---|---|---|
| Voice runtime (live) | **Claude Sonnet 4.6** | 300–500 ms |
| Voice fallback | Gemini 3.5 Flash | ~200 ms |
| Reasoning (briefs, coaching, post-call, daily-brief) | **Claude Opus 4.7** | 800–1500 ms (invisible — runs off the live wire) |
| Simple utility (sentiment, extraction) | Claude Haiku 4.5 | ~150 ms |

End-to-end caller-perceived dead air dropped from ~2 s → ~700–900 ms while
keeping Opus's depth on every artefact the operator reads.

**Files touched:**
- `src/lib/claude-models.ts` — `VAPI_TENANT_DEFAULT_MODEL`, `VAPI_SHOWCASE_MODEL`, `VAPI_PREMIUM_MODEL` all now point to `CLAUDE_MODELS.SONNET`. Tiering docstring rewritten with the rationale.
- `src/db/schema.ts` — `wireline_settings.voiceLlmProvider/voiceLlmModel` default → `anthropic` / `claude-sonnet-4-6` (was `google` / `gemini-3.5-flash`).
- `src/components/AdminSettings.tsx` — UI default state and fallback both updated.
- `src/routes/health-routes.ts` — `/api/health/internal` now reports the correct tiering rationale per layer.
- `ARCHITECTURE.md` — full rewrite of section 1 (LLM Tiering) explaining the Sonnet-voice + Opus-reasoning split.
- `README.md` — voice-runtime paragraph + tech-stack row updated.

> **Migration note for existing tenants:** the schema default change only
> affects *new* signups. Existing tenants whose `wireline_settings` rows
> still hold `google` / `gemini-3.5-flash` will continue running Gemini
> on the voice path until an operator updates them via Fleet Settings.
> If a wholesale migration is desired, add a one-shot SQL admin endpoint
> under `/api/admin/migrate-*` that flips rows older than the cutoff.

---

## 2. Live Model-Resolution Probe

**`GET /api/health/models`** (auth-gated) now ships a real 1-token probe
against every configured Anthropic tier and reports `{ok, latency_ms,
error}` per layer.

This catches the silent failure mode where a model id in our constants
drifts away from what the provider actually serves — e.g. a versioned
alias gets retired or you upgrade the SDK and the next-gen model isn't
GA yet. Uptime monitors and the in-app admin Health panel can both hit
this endpoint.

Cost per probe: <$0.001 (5-token prompt, 1-token reply). Rate-limited
like every other health endpoint.

**File:** `src/routes/health-routes.ts`

---

## 3. Tests Added (the moat now has a safety net)

Test files grew from **6 → 10**; unit test count from ~40 → **115**.

| New file | Covers |
|---|---|
| `src/lib/agent-runtime.test.ts` | All pure helpers: business-hours gate (timezones, overnight windows, malformed input), compliance presets, disallowed-topics + escalation blocks, business-variable substitution, KPI focus, full `buildAgentRuntimeContext` composition. The docstring on `agent-runtime.ts` had long promised this file; now it exists. |
| `src/lib/personality-vibes.test.ts` | All three vibes have the right tone-anchor phrases. `buildVibeBlock()` always emits the adaptive-core + the "never fabricate an action" rule. The moat is now guarded against silent edits. |
| `src/lib/claude-models.test.ts` | Constants are stable (voice = Sonnet, reasoning = Opus). `resolveVapiVoiceModelSelection` covers Anthropic / Google / OpenAI normalisation, fallback-list contract (no cross-provider list on Anthropic), unknown-provider fall-through. |
| `src/lib/plan-catalog.test.ts` | Catalog shape, overage rates strictly decrease as tier rises, minute allowances at least 2x per tier, `planById` / `planByPriceId` resolution, `plansForClient` never exposes Enterprise as configured (the contact-sales sentinel). |

Run with `npm run test:run` — currently 115 passing in ~2.3 s.

---

## 4. CI-Enforced Doc Freshness

`scripts/check-readme-pricing.mjs` diffs the README pricing table against
`src/lib/plan-catalog.ts`. Wired into `npm run verify` via the new
`npm run docs:check` script.

Any push where the README pricing or plan-catalog tier rates drift fails
the verify step, before the tree even builds. This locks down the entire
class of "marketing page says one number, billing system charges
another" bugs the audit surfaced.

---

## 5. TypeScript Strictness — 16-File Allowlist (was 8)

Added to `tsconfig.strict.json`:
- `src/lib/agent-runtime.ts`
- `src/lib/personality-vibes.ts`
- `src/lib/claude-models.ts`
- `src/lib/plan-catalog.ts`
- `src/lib/password-policy.ts`
- `src/lib/form-validators.ts`
- `src/lib/signup-intent.ts`
- `src/lib/csp.ts`

All pass `npm run lint:strict` clean. These are the highest-traffic,
moat-adjacent modules — getting them under strict-mode means a regression
fails the build instead of shipping silently.

Goal for next pass: get every file with `*.test.ts` coverage under strict.

---

## 6. Documentation Reconciliation

| Doc | Before | After |
|---|---|---|
| `README.md` | Sonnet 4.6 with 200 ms latency; pricing $0.20/0.18/0.16 | Sonnet voice + Opus reasoning split documented; pricing table mirrors `plan-catalog.ts` exactly ($0.20/0.18/0.15/0.14) |
| `ARCHITECTURE.md` | Dated "May 26, 2026"; all-Opus tiering | Date-anchor moved to git log; tiering rewritten with rationale; references `/api/health/models` |

---

## 7. God-file slicing — ClaudeRecipes (2026-02 pass)

**Before:** `src/components/ClaudeRecipes.tsx` — **2,862 LOC** in a single
file: type, metadata, button, modal, 13 form components, form primitives,
and ResultCard all jammed together.

**After:** **16 LOC barrel** that re-exports `ClaudeRecipeButton`,
`RecipeModal`, and the `Recipe` type from a new folder:

```
src/components/recipes/
├── types.ts                          (146 LOC — Recipe enum + RECIPE_META + AgentLite)
├── shared.tsx                        (180 LOC — FormShell, Field, TextInput, TextArea, Select,
│                                                RunButton, ResultCard, ErrCard, Stat, NoKeyInline)
├── ClaudeRecipeButton.tsx            ( 71 LOC)
├── RecipeModal.tsx                   (224 LOC — modal shell + recipe → form routing)
└── forms/
    ├── BriefForm.tsx                 (160 LOC)
    ├── EnrichLeadForm.tsx            (192 LOC)
    ├── QualifyForm.tsx               (136 LOC)
    ├── ObjectionDrillForm.tsx        (134 LOC)
    ├── ColdEmailForm.tsx             (177 LOC)
    ├── PersonaCloneForm.tsx          (175 LOC)
    ├── ThreadSummaryForm.tsx         (142 LOC)
    ├── AgentReviewForm.tsx           (205 LOC)
    ├── CoachForm.tsx                 (174 LOC)
    ├── KnowledgeFromUrlForm.tsx      (269 LOC)
    ├── KnowledgeFromDocumentForm.tsx (313 LOC)
    ├── AgentForgeForm.tsx            (187 LOC)
    └── CallPlaybookForm.tsx          (171 LOC)
```

Largest module now is **313 LOC** (10× smaller than the original).
Zero behavioural change — every consumer still imports
`{ ClaudeRecipeButton }` from `"./ClaudeRecipes"`; the barrel forwards.
Vite also code-splits the new modal chunk separately
(`RecipeModal-*.js` at 60 kB gz 14 kB), which means the recipe surface
no longer loads on routes that never open it.

**Verified by:** `npm run lint` (TS clean), `npm run test:run`
(139/139 green), `npm run build` (production bundle clean),
`npm run docs:check` (pricing table consistent).

**Files touched:**
- `src/components/ClaudeRecipes.tsx` (rewrote to barrel)
- `src/components/recipes/**/*` (16 new files)

---

## Backlog (deferred — captured for the next pass)

1. **Slice the remaining god-files.** `InsightsView.tsx` (1927 LOC),
   `OutboundDialer.tsx` (1879), `FleetSettings.tsx` (1802 — small
   helper extract already done). Same playbook as ClaudeRecipes:
   sub-folder, barrel at the original path, no consumer changes.
2. **Prompt caching on reasoning paths.** ✅ Shipped (2026-Q2). `cacheSystem`
   on `runStructured` / `runCompletion` wraps the system block in
   `cache_control: ephemeral` across the reasoning recipes in
   `claude-recipes.ts`, and `recordUsage` logs `cache_read`/`cache_create`
   tokens so hits are observable. Locked against regression by
   `claude-recipes.cache.test.ts` (source guard — every cached recipe carries
   the flag) and `claude-structured.cache.test.ts` (behavioural guard — the
   helper actually emits `cache_control`). Reality-check on the original note:
   `brief()`, `coach()`, and `postCallAnalysis()` do **not** share one 18 KB
   frame — each builds its own short, task-specific system prompt (a few hundred
   tokens). Caching only meaningfully fires for recipes whose system block
   carries a large per-agent knowledge/persona payload (e.g. `smartEmailReply`,
   or `brief` with a full knowledge base) and clears the Opus ~4096-token
   minimum cacheable prefix; on the short prompts the marker is a harmless
   no-op. The genuine 18 KB system frame is on the **voice** path
   (`agent-runtime.ts` → Vapi), which Vapi/ElevenLabs runs — not these
   first-party SDK calls.
3. **Tenant backfill migration.** One-shot SQL endpoint that flips existing `google` / `gemini-3.5-flash` settings rows to `anthropic` / `claude-sonnet-4-6` — gated, dry-run-first, audited.
4. **Tighten `--max-warnings 1100` → 700 over Q1.** Ratchet down 100 warnings per cycle via `eslint --max-warnings` in CI.
5. **Strict-mode allowlist → cover every `*.test.ts` peer.** ~20 more files.
6. **Visual canary for the live demo lines.** Cron a synthetic call to each showcase number nightly; alert on TTFT or sentiment regressions. Today this is detected by users; should be detected by us first.
7. **Resolve `src/lib/audit-routes.ts` ↔ `src/routes/audit-routes.ts` naming collision** (one is helpers, one is the router — rename the lib file).
