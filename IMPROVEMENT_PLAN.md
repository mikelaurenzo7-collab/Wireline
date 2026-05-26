# Wireline Next-Level Improvement Plan

**Status:** In Progress  
**Branch:** `cursor/expert-audit-973b`  
**Date:** May 26, 2026  
**Goal:** Transform Wireline into the most professional, trusted, and highest-performing voice AI agent platform in the industry.

---

## Executive Vision

Wireline's core differentiation is the **adaptive + quick** agent architecture powered by a two-tier LLM system:

- **Gemini 3.5 Flash** — Ultra-low latency voice runtime (sub-250ms perceived response)
- **Claude Opus 4.7** — Deep reasoning for pre-call briefs, post-call coaching, and integration orchestration

This split is **architecturally optimal** for 2026. The plan below ensures every layer of the system supports this moat.

---

## Phase 1: Foundation (COMPLETE)

### ✅ All TypeScript Errors Resolved
- Fixed 25+ type errors across 5 files
- Proper union type narrowing for all `readApiJson` responses
- Updated Toast API to correct shape (`type`/`message` vs `title`/`description`)
- All lint checks now pass: `npm run lint` ✓

### ✅ Database Settings Seeded
- Created `wireline_settings` rows for both existing users
- Configured `voice_llm_provider: "google"`, `voice_llm_model: "gemini-3.5-flash"`
- Verified: 2 settings rows, Gemini Flash as default

### ✅ LLM Architecture Verified
| Layer | Model | Status |
|-------|-------|--------|
| Voice Runtime | Gemini 3.5 Flash | ✅ Default in `claude-models.ts` |
| Pre-call Briefs | Claude Opus 4.7 | ✅ `CLAUDE_MODEL_DEFAULT = OPUS` |
| Post-call Coach | Claude Opus 4.7 | ✅ Used in `claude-routes.ts`, `vapi-handlers.ts`, `job-worker.ts` |
| Integration Manager | Claude Opus 4.7 | ✅ Tool orchestration via recipes |

---

## Phase 2: Architecture Hardening (NEXT)

### 2.1 Explicit Model Tiering Documentation

**Action:** Add a single source of truth comment block in `src/lib/claude-models.ts` documenting the two-tier architecture and why each model was chosen.

**Rationale:** Future developers (or future-you) must understand that voice = Gemini Flash (latency), reasoning = Claude Opus (adaptive depth). This is the moat.

**File:** `src/lib/claude-models.ts` (after line 226)

---

### 2.2 Add ARCHITECTURE.md at Repository Root

**Contents:**
- LLM tiering diagram (voice vs reasoning)
- Why Gemini Flash for voice (latency, price, streaming)
- Why Claude Opus for reasoning (adaptive reasoning depth, tool reliability)
- Data flow: Vapi → Gemini Flash → Wireline system prompt → Vapi response
- Non-voice flow: API route → Claude Opus (via `claude-recipes.ts`) → structured output
- Cost model: voice tokens vs reasoning tokens
- Upgrade path: Grok-4 as future Claude replacement (when available)

---

### 2.3 Runtime Health Check Enhancement

**Current:** `/api/health` returns model names but not tiering rationale.

**Enhancement:** Add a `llm_tiering` object:
```json
{
  "llm_tiering": {
    "voice_runtime": { "provider": "google", "model": "gemini-3.5-flash", "reason": "sub-250ms first-token latency" },
    "reasoning_layer": { "provider": "anthropic", "model": "claude-opus-4-7", "reason": "highest adaptive reasoning depth for briefs, coaching, orchestration" },
    "grounded_search": { "provider": "google", "model": "gemini-2.5-flash", "reason": "native googleSearchRetrieval tool" }
  }
}
```

**File:** `src/routes/health-routes.ts`

---

## Phase 3: Observability & Trust Signals

### 3.1 Add Per-Call LLM Attribution to Call Logs

**Current:** `callLogs` table has `summary`, `transcript`, `leadScore`, etc. but no record of which LLM handled the call.

**Enhancement:** Add columns:
- `voice_llm_provider` (text)
- `voice_llm_model` (text)
- `reasoning_llm_provider` (text) — for post-call analysis
- `reasoning_llm_model` (text)

**Migration:** Create `0020_add_llm_attribution_to_call_logs.sql`

**Rationale:** Trust signal for operators ("this call was handled by Gemini Flash + Claude Opus"). Also enables A/B testing when Grok-4 arrives.

---

### 3.2 Expose LLM Attribution in Insights UI

**Location:** `InsightsView.tsx` — call log detail drawer

**Display:**
```
Voice Runtime: Gemini 3.5 Flash (Google)
Post-Call Analysis: Claude Opus 4.7 (Anthropic)
```

**Rationale:** Reinforces the "smartest agents" positioning.

---

### 3.3 Add Model Version to Audit Log Events

**Current:** `auditLog` captures `provider`, `model` for AI spend tracking.

**Enhancement:** Ensure every `claudeBrain` and `geminiBrain` call writes the exact model version used.

**Files to verify:**
- `src/lib/claude-audit.ts` — `recordUsage()`
- `src/lib/gemini-brain.ts` — grounded search calls

---

## Phase 4: Performance & Cost Optimization

### 4.1 Implement `selectModelForTask` in Voice Paths (Optional Future)

**Current:** Voice always uses Gemini Flash (correct).

**Note:** Do NOT change this. The user explicitly confirmed Gemini Flash for voice.

**Keep as-is.**

---

### 4.2 Add Token Usage Logging to Post-Call Analysis

**Enhancement:** Log input/output tokens for every Claude Opus call in `postCallAnalysis`.

**Benefit:** Enables precise cost tracking per call, per agent, per tenant.

**File:** `src/lib/claude-recipes.ts` — `postCallAnalysis` function

---

### 4.3 Cache Pre-Call Briefs for Repeat Callers

**Current:** Every call generates a fresh `brief()` even if the customer called yesterday.

**Enhancement:** Add a lightweight cache key: `brief:{userId}:{customerNumber}:{last24h}`

**Store in:** Upstash Redis (already configured) or in-memory LRU for single-tenant.

**Rationale:** Reduces Opus spend on repeat callers; briefs are stable for 24h.

---

## Phase 5: Testing & Reliability

### 5.1 Add Unit Tests for `classifyCallOutcome`

**File:** `src/lib/post-call-digest.test.ts` (create if missing)

**Test cases:**
- Duration < 8s → "unreachable"
- "booked appointment" in summary → "booked"
- "do not call" in summary → "dnc"
- Edge: empty summary + short duration → "unreachable"

---

### 5.2 Add E2E Test for Voice LLM Attribution

**File:** `tests/e2e/voice-llm-attribution.spec.ts` (new)

**Flow:**
1. Seed a test agent with Gemini Flash settings
2. Simulate a Vapi webhook (end-of-call-report)
3. Assert `callLogs` row has `voice_llm_provider = "google"`, `voice_llm_model = "gemini-3.5-flash"`

---

### 5.3 Verify Claude Opus Availability at Startup

**Current:** `validateStartupEnv()` checks `ANTHROPIC_API_KEY` exists but not that it's valid.

**Enhancement:** Add a lightweight `claudeBrain.isClaudeAvailable()` check that pings the models endpoint.

**File:** `src/lib/startup.ts`

---

## Phase 6: Documentation & Onboarding

### 6.1 Update README.md — LLM Tiering Section

**Add after "Tech stack" table:**

```
## LLM Architecture (the moat)

Wireline uses a deliberate two-tier LLM system:

| Layer | Model | Why |
|-------|-------|-----|
| **Voice Runtime** | Gemini 3.5 Flash | Sub-250ms perceived latency, native streaming, lowest cost for real-time |
| **Pre-call Briefs** | Claude Opus 4.7 | Deep tactical reasoning, role-aware, structured output |
| **Post-call Coach** | Claude Opus 4.7 | Identifies subtle failure modes, suggests precise next words |
| **Integration Manager** | Claude Opus 4.7 | Reliable multi-step tool orchestration (CRM + email + calendar) |
| **Grounded Search** | Gemini 2.5 Flash | Native `googleSearchRetrieval` tool with citations |

This split is intentional. Voice needs speed; reasoning needs adaptive depth. No single model wins both in 2026.

See `src/lib/claude-models.ts` for the single source of truth.
```

---

### 6.2 Add AGENTS.md Section on Model Selection

**Content:**
- Never change voice model without benchmarking latency
- Never downgrade reasoning model below Opus without explicit approval
- When Grok-4 is available, benchmark against Opus 4.7 before switching
- Always log the exact model version in audit events

---

## Phase 7: Monitoring & Alerts

### 7.1 Add Sentry Tags for LLM Tier

**Enhancement:** Every `claudeBrain` and `geminiBrain` call should tag the Sentry event with:
- `llm.provider`
- `llm.model`
- `llm.tier` ("voice" | "reasoning" | "search")

**File:** `src/lib/claude-audit.ts` and `src/lib/gemini-brain.ts`

---

### 7.2 Add Cost Anomaly Alert

**Enhancement:** If daily Claude spend exceeds 3× the trailing 7-day average, fire a Slack alert (or email to founder).

**Rationale:** Catches runaway agent loops or prompt bloat before they burn budget.

**File:** `src/lib/claude-audit.ts` — aggregate daily spend check

---

## Execution Order (Priority)

| Phase | Item | Priority | Effort | Status |
|-------|------|----------|--------|--------|
| 1 | TypeScript fixes | P0 | Done | ✅ |
| 1 | Database seeding | P0 | Done | ✅ |
| 2.1 | Model tiering docs | P1 | 30 min | ⏳ |
| 2.2 | ARCHITECTURE.md | P1 | 1 hr | ⏳ |
| 2.3 | Health check enhancement | P2 | 30 min | ⏳ |
| 3.1 | LLM attribution columns | P1 | 2 hr (migration + code) | ⏳ |
| 3.2 | Insights UI attribution | P2 | 1 hr | ⏳ |
| 4.3 | Brief caching | P2 | 3 hr | ⏳ |
| 5.1 | classifyCallOutcome tests | P2 | 1 hr | ⏳ |
| 6.1 | README LLM section | P1 | 30 min | ⏳ |
| 7.1 | Sentry tags | P2 | 1 hr | ⏳ |

---

## Success Criteria (Definition of Done)

1. ✅ `npm run lint` passes with zero errors
2. ✅ Database has settings rows for all users with Gemini Flash defaults
3. ⏳ `ARCHITECTURE.md` exists and is referenced in README
4. ⏳ `/api/health` exposes `llm_tiering` object
5. ⏳ Every call log row records `voice_llm_provider` and `voice_llm_model`
6. ⏳ Insights UI shows LLM attribution in call detail
7. ⏳ README documents the two-tier LLM moat

---

## Notes on LLM Choices (May 2026)

**Gemini 3.5 Flash for Voice:**
- Lowest latency first-token (~200-300ms)
- Native streaming support in Vapi
- Price: $0.15–1.25 per 1M tokens
- No other model (including Grok-2, GPT-4o, Claude Haiku) matches this combination

**Claude Opus 4.7 for Reasoning:**
- Highest adaptive reasoning depth available
- Most reliable tool orchestration
- Best self-correction and backtracking
- Grok-2 is competitive with Sonnet 4 tier, not Opus 4.7
- Grok-4 (expected later 2026) is the first xAI model positioned to compete at Opus tier

**Never downgrade reasoning below Opus without explicit benchmark comparison.**

---

*Plan owned by mikelaurenzo7. Update as models evolve.*
