# Wireline Architecture

This document is the canonical reference for Wireline's system design, LLM tiering, data flows, and the reasoning behind every architectural decision.

---

## 1. LLM Tiering (The Moat)

Wireline deliberately splits LLM usage across two providers and three models:

| Layer | Provider | Model | Purpose | Why This Model |
|-------|----------|-------|---------|----------------|
| **Voice Runtime** | Google | Gemini 3.5 Flash | Live call handling (inbound/outbound) | Sub-250 ms first-token latency, native streaming, lowest cost for real-time |
| **Reasoning Layer** | Anthropic | Claude Opus 4.7 | Pre-call briefs, post-call coaching, integration orchestration | Highest adaptive reasoning depth, most reliable tool orchestration, best self-correction |
| **Grounded Search** | Google | Gemini 2.5 Flash | `gemini_ground` tool (web lookup with citations) | Native `googleSearchRetrieval` tool with source grounding |

### 1.1 Why Gemini Flash for Voice

- Every 100 ms of latency is perceived as "sluggish" on a phone call
- Gemini 3.5 Flash delivers the best price/performance/latency combination available in 2026
- Vapi's streaming integration is mature for Gemini
- No other model (Grok-2, GPT-4o, Claude Haiku) matches the latency + price + streaming trifecta

**Voice is 80%+ of token spend.** This choice is non-negotiable for unit economics.

### 1.2 Why Claude Opus for Reasoning

- Pre-call briefs require tactical, role-aware, context-rich planning
- Post-call coaching requires identifying subtle failure modes and suggesting precise next words
- Integration Manager requires reliable multi-step tool orchestration with guardrails
- Claude Opus 4.7 is the strongest model at this class of adaptive, self-correcting reasoning

Grok-2 is competitive with Claude Sonnet 4 / GPT-4o tier — **not** Opus 4.7. Grok-4 (expected later 2026) is the first xAI model positioned to compete at the Opus tier.

**Until Grok-4 is available and benchmarked, Opus 4.7 remains the reasoning default.**

### 1.3 Enforcement Points

- `src/lib/claude-models.ts` — `VAPI_TENANT_DEFAULT_MODEL`, `CLAUDE_MODEL_DEFAULT`, `resolveVapiVoiceModelSelection`
- `src/lib/vapi-assistant-factory.ts` — reads `voice_llm_provider`/`voice_llm_model` from `wireline_settings`
- `src/lib/vapi-client.ts` — same, for outbound calls
- `src/lib/claude-recipes.ts` — `brief`, `coach`, `postCallAnalysis`, `dailyBrief`
- `src/routes/health-routes.ts` — exposes tiering via `/api/health`

---

## 2. Data Flow

### 2.1 Voice Call Flow (Inbound)

```
Caller dials number
  → Twilio/Vapi routes to Wireline assistant (Gemini Flash)
  → Vapi streams audio ↔ Gemini Flash (sub-250 ms)
  → Wireline system prompt (agent-runtime.ts) injected at call start
  → Agent uses tools (CRM, calendar, email, gemini_ground)
  → Call ends → Vapi fires end-of-call-report webhook
  → Post-call analysis (Claude Opus) enriches call log
  → Optional: CSAT SMS, CRM sync, daily brief
```

### 2.2 Voice Call Flow (Outbound)

```
Operator triggers dial (or cadence job)
  → vapi-client.ts builds assistant config with Gemini Flash
  → Vapi places call
  → Same runtime as inbound
  → Post-call analysis (Claude Opus or Gemini Flash fallback)
```

### 2.3 Non-Voice Reasoning Flow

```
API route (/api/claude/*, /api/jobs/*, etc.)
  → claudeBrain.brief() / coach() / postCallAnalysis() / dailyBrief()
  → runStructured() or runCompletion() with Opus 4.7
  → Structured JSON output
  → Response to client or side-effect (email, CRM, job enqueue)
```

---

## 3. Database Schema (Key Tables)

- `wireline_users` — identity
- `wireline_settings` — per-tenant config (voice LLM provider/model, trial status, branding)
- `wireline_agents` — fleet inventory (voice ID, role, personality vibe, tools)
- `wireline_call_logs` — every call (transcript, summary, outcome, LLM attribution)
- `wireline_email_threads` / `sms_threads` — omnichannel inbox
- `wireline_audit_log` — AI spend + compliance events
- `wireline_jobs` — background job queue (claim/fail/retry)

All tables use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` in migrations for safe re-runs.

---

## 4. Environment Variables (Required)

See `.env.example` for the canonical list. Key production requirements:

- `POSTGRES_URL` — Supabase pooler (transaction mode)
- `ANTHROPIC_API_KEY` — Claude Opus 4.7
- `GEMINI_API_KEY` — Gemini Flash (voice) + grounded search
- `VAPI_PRIVATE_KEY` + `VAPI_WEBHOOK_SECRET` — voice runtime
- `INTERNAL_JWT_SECRET` — session JWTs
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — billing
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — distributed rate limits

---

## 5. Deployment

- **Platform:** Vercel (Functions + Edge)
- **Cron:** `/api/jobs/sweep` (every 5 min), `/api/daily-brief/schedule` (daily 8 AM)
- **Domains:** `trywireline.com`, `wireline-chi.vercel.app`
- **Build:** `npm run assets && vite build && esbuild server.ts`

---

## 6. Upgrade Paths

| Future Model | When to Consider | What to Benchmark |
|--------------|------------------|-------------------|
| Grok-4 | When available (late 2026) | Adaptive reasoning depth vs Opus 4.7 on briefs, coaching, orchestration |
| Gemini 3.5 Pro / Ultra | If latency improves significantly | Voice runtime only — never replace Opus for reasoning |
| Claude Sonnet 4.5 / 5 | If Opus pricing drops or Sonnet closes the gap | Cost vs quality on production traffic |

**Rule:** Never change the reasoning layer without an explicit benchmark showing equivalent or better adaptive reasoning quality on Wireline's actual workloads.

---

## 7. Observability

- **Sentry** — error tracking + release tagging
- **Plausible** — privacy-first analytics (already in CSP)
- **Audit Log** — every AI call (provider, model, tokens, cost, latency)
- **Call Log Attribution** — every call records `voice_llm_provider`/`model` and `reasoning_llm_provider`/`model`

---

## 8. Security & Compliance

- Content-Security-Policy (strict, no `unsafe-eval`)
- HSTS, COOP, CORP, Referrer-Policy, Permissions-Policy
- JWT sessions (no cookies)
- RLS on all Supabase tables (verify in production)
- Webhook signature validation (Vapi, Stripe, Twilio, ElevenLabs)
- Rate limiting (Upstash Redis in production)

---

## 9. Files of Note

| File | Purpose |
|------|---------|
| `src/lib/claude-models.ts` | LLM constants, tiering, Vapi model selection |
| `src/lib/agent-runtime.ts` | Pure functions that build the system prompt from agent config |
| `src/lib/vapi-assistant-factory.ts` | Builds the Vapi assistant config (voice + system prompt) |
| `src/lib/claude-recipes.ts` | `brief`, `coach`, `postCallAnalysis`, `dailyBrief` |
| `src/lib/post-call-digest.ts` | Outcome classification + CRM + email + CSAT pipeline |
| `src/routes/health-routes.ts` | `/api/health` — model versions, tiering, SLOs |

---

## 10. Contact

Questions about architecture or model choices: ask mikelaurenzo7 or reference this document.

---

*Last updated: May 26, 2026 — Gemini 3.5 Flash + Claude Opus 4.7 tiering is the production contract.*