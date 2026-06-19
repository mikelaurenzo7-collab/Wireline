# Wireline Architecture

This document is the canonical reference for Wireline's system design, LLM
tiering, data flows, and the reasoning behind every architectural decision.

> **Source of truth:** the constants in `src/lib/claude-models.ts`. This
> document explains *why*; that file is *what*. CI fails any push where the
> two drift via `npm run docs:check`.

---

## 1. LLM Tiering (The Moat)

Wireline runs a **quality-first, latency-aware** model split — different
Claude tiers for different jobs, picked by where the user is waiting:

| Layer | Provider | Model | Purpose | Why This Model |
|-------|----------|-------|---------|----------------|
| **Voice Runtime** | Anthropic | **Claude Sonnet 4.6** | Live inbound + outbound calls | Smartest model in the latency class voice can tolerate. TTFT ~300–500 ms against an 18 KB system prompt; perceived dead air after STT + TTS lands at ~700–900 ms — under the "did they hang up?" threshold. |
| **Voice Fallback** | Google | Gemini 3.5 Flash | Availability backup when Anthropic is degraded | Sub-250 ms latency; speed-only, not depth. |
| **Last-Resort Fallback** | OpenRouter | DeepSeek Chat | Tertiary backup when both Anthropic and Gemini fail or are unconfigured (`claude-client.ts` proxy) | Keeps reasoning paths alive during multi-provider outages; quality floor, not a steady-state tier. |
| **Reasoning Layer** | Anthropic | **Claude Opus 4.7** | Pre-call briefs, post-call coaching + analysis, daily brief, structured intent extraction, integration orchestration | Deepest adaptive reasoning Wireline ships against today. These paths run *before* or *after* the call — the user never waits on Opus, so its 800–1500 ms TTFT is invisible and its depth pays off on every artefact. |
| **Simple Tasks** | Anthropic | Claude Haiku 4.5 | Sentiment, classification, extraction stubs, label fan-out | Cheap + fast; selected via `selectModelForTask("simple")`. |
| **Grounded Search** | Google | Gemini 2.5 Flash | `gemini_ground` tool (web lookup with citations) | Native `googleSearchRetrieval` tool with source grounding. |

### 1.1 Why Sonnet 4.6 for Voice (not Opus)

Voice calls live or die on the gap between *caller stops talking* and
*agent first audio*. Two numbers govern this:

- **TTFT (time to first LLM token):** dominates the gap. With an 18 KB
  Wireline system prompt, Sonnet 4.6 ships first tokens in ~300–500 ms;
  Opus 4.7 on the reasoning path routinely takes 1.5–2.5 s on the same prompt — fine off the live wire, fatal on it.
- **TTS first-audio-out:** ElevenLabs Flash v2.5 with
  `optimizeStreamingLatency: 4` adds ~200 ms after the first chunk of LLM
  tokens.

Stack them: Sonnet voice → ~700–900 ms perceived gap. Opus voice → ~2 s
gap, with visible silence the caller interprets as a dropped call.

Sonnet 4.6 is also the model the rest of the voice-AI market
underestimates. It handles tool calls reliably, reads caller tone, stays
conversational across long sessions, and renders dense content (pricing,
phone numbers, confirmations) with even cadence — the failure mode that
plagues Flash-only stacks.

### 1.2 Why Opus 4.7 for Reasoning

The reasoning layer runs *off* the live wire. Operators kick a brief
generation and Slack themselves; the daily brief job emails them at
8 AM; post-call analysis enriches the call log after the caller has hung
up. None of these have a "did they hang up?" threshold — they have a
"is this insight worth reading?" threshold, and that's where Opus 4.7's
adaptive reasoning depth, tool orchestration, and self-correction earn
their cost.

Concretely Opus drives:

- `claude-recipes.ts` → `brief()`, `coach()`, `postCallAnalysis()`, `dailyBrief()`
- `daily-brief.ts` → operator's morning intelligence summary
- `post-call-digest.ts` → outcome classification + CRM + email + CSAT pipeline
- Integration Manager → multi-step tool orchestration with guardrails

### 1.3 Per-agent model override (Agent Studio)

The customization-first Agent Studio lets operators pick a **per-agent**
reasoning model and temperature for the live voice runtime, instead of being
locked to the tenant default + archetype temperature. This is a deliberate
relaxation of the moat — **bounded so it can't be used to break the moat**:

- **Curated catalog, not a free-text field.** `VOICE_MODEL_CATALOG` in
  `claude-models.ts` is the source of truth for the picker — only Vapi-native
  providers (Anthropic, Google, OpenAI, **xAI/Grok**, and **OpenRouter** as an
  opt-in proxy). Each entry carries a `speed` badge and a `latencyWarning`
  flag, so heavy options (Opus, OpenRouter) tell the operator the TTFT
  trade-off up front rather than silently degrading their calls.
- **Provider gating.** An option only appears if its `envKey` is configured,
  so the picker never offers a provider the deployment can't actually reach.
- **Validation can't reach Vapi dirty.** Per-agent `llm_provider` / `llm_model`
  flow through `resolveVapiVoiceModelSelection()`, which normalizes/validates
  against the native provider set; an unknown value falls back to the tenant
  default. `llm_temperature` is clamped to `[0, 1]` via
  `clampVoiceTemperature()` so an override can't make a live agent erratic.
- **Inheritance preserved.** All three columns are nullable; NULL → inherit the
  tenant default + archetype temperature, identical to pre-Studio behaviour.

OpenRouter is allowed on voice but flagged: the extra proxy hop adds latency
and variance, so it's ideal for the reasoning side and a labelled escape hatch
on the live wire.

### 1.4 Enforcement Points

| File | Role |
|------|------|
| `src/lib/claude-models.ts` | Constants: `VAPI_TENANT_DEFAULT_MODEL`, `VAPI_SHOWCASE_MODEL`, `VAPI_PREMIUM_MODEL`, `CLAUDE_REASONING_MODEL_DEFAULT`, `selectModelForTask()` |
| `src/lib/vapi-assistant-factory.ts` | Per-agent `llmProvider`/`llmModel`/`llmTemperature` override tenant `voice_llm_*`; resolved via `resolveVapiVoiceModelSelection()` + `clampVoiceTemperature()` |
| `src/lib/claude-models.ts` | `VOICE_MODEL_CATALOG` — curated, env-gated per-agent model picker (anthropic / google / openai / xai / openrouter) |
| `src/lib/vapi-client.ts` | Same resolution path, for outbound calls |
| `src/lib/claude-recipes.ts` | `brief`, `coach`, `postCallAnalysis`, `dailyBrief` all use `CLAUDE_REASONING_MODEL_DEFAULT` (Opus 4.7) |
| `src/db/schema.ts` | `wireline_settings.voiceLlmProvider` / `voiceLlmModel` defaults — set to anthropic / claude-sonnet-4-6 so every new tenant lands on the right voice runtime out of the box |
| `src/routes/health-routes.ts` | `/api/health/internal` reports configured tiering; `/api/health/models` live-probes each tier |

---

## 2. Data Flow

### 2.1 Voice Call Flow (Inbound)

```
Caller dials number
  → Twilio/Vapi routes to Wireline assistant (Sonnet 4.6)
  → Vapi streams audio ↔ Sonnet 4.6 (TTFT 300–500 ms)
  → Wireline system prompt (agent-runtime.ts) injected at call start
  → Personality vibe + adaptive-core + voice-consistency rule layered in
  → Agent uses tools (CRM, calendar, email, gemini_ground, etc.)
  → Caller hangs up → Vapi fires end-of-call-report webhook
  → Post-call analysis (Opus 4.7) enriches call log with structured
    intent / outcome / commitments / sentiment
  → Optional: CSAT SMS, CRM sync, daily brief
```

### 2.2 Voice Call Flow (Outbound)

```
Operator triggers dial (or cadence job)
  → vapi-client.ts builds assistant config with Sonnet 4.6
  → Vapi places call (Twilio voicemail ML detection skips dud calls)
  → Same runtime as inbound, with outbound archetype rules
  → Post-call analysis (Opus 4.7, or Gemini Flash fallback)
```

### 2.3 Non-Voice Reasoning Flow

```
API route (/api/claude/*, /api/jobs/*, /api/daily-brief/*)
  → claudeBrain.brief() / coach() / postCallAnalysis() / dailyBrief()
  → runStructured() or runCompletion() with Opus 4.7
  → Structured JSON output (Zod-validated)
  → Response to client or side-effect (email, CRM, job enqueue)
```

---

## 3. Database Schema (Key Tables)

57 tables managed by Drizzle; 43 SQL migrations under `drizzle/migrations/`, all
idempotent (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).

| Table | Purpose |
|------|---------|
| `wireline_users` | Identity, email-verification timestamps |
| `wireline_password_reset_tokens` | Hashed single-use reset tokens (1 h TTL) |
| `wireline_email_verification_tokens` | Hashed single-use verification tokens (24 h TTL) |
| `wireline_settings` | Per-tenant config (voice LLM, trial state, branding) |
| `wireline_agents` | Fleet inventory (voice ID, role, personality vibe, tools) |
| `wireline_directives` / `wireline_knowledge` / `wireline_personality` | Per-agent operator-authored prompt segments |
| `wireline_agent_lessons` | Self-improvement loop — lessons mined from high-QA calls |
| `wireline_call_logs` | Every call (transcript, summary, outcome, LLM attribution) |
| `wireline_email_threads` / `wireline_email_messages` / `wireline_sms_threads` / `wireline_sms_messages` | Omnichannel inbox |
| `wireline_audit_log` | AI spend + compliance events (provider, model, tokens, cost, latency) |
| `wireline_jobs` | Background job queue (claim / fail / retry, no Redis dep) |
| `wireline_pronunciation_dictionaries` | Per-tenant ElevenLabs pronunciation overrides |
| `wireline_outbound_campaigns` / `wireline_outbound_leads` | Outbound dialer + lead state machine |
| `wireline_director_conversation_messages` | Account-level Director chat thread (operator ↔ director) |
| `wireline_director_artifacts` / `wireline_director_artifact_objects` | Persisted Director deliverables (metadata + blob storage) |

Account deletion is handled by `src/lib/account-deletion.ts`, which
manually cascades through all 57 tables in dependency order. FKs exist from
`wireline_settings`, `wireline_user_preferences`, and `wireline_spend_budgets`
to `wireline_users` with cascade-delete; the remaining tables are cleaned
up by the deletion module to give precise control over sequencing and
logging.

---

## 3.1 Director (account-level AI workspace)

The **Director** is the authenticated operator's mission-control chat — one
thread per account (not per voice agent). It orchestrates fleet planning,
approvals, integrations, research, and document deliverables.

| Layer | Location | Role |
|-------|----------|------|
| **UI shell** | `src/components/DirectorWorkspace.tsx` | Layout, streaming chat, artifacts rail |
| **Subcomponents** | `src/components/director/*` | Live session, composer, capability catalog, proposals |
| **Design contract** | `src/lib/wireline-director-design.ts` | Copy, `WL_DIRECTOR_CLASSES`, capability categories — tested in `wireline-director-design.test.ts` |
| **Visual system** | `DESIGN.md` + `src/index.css` | Rich Cream + Purple utilities (`.wl-director-*`, composer dock, proposal cards) |
| **Persistence** | `directorConversationMessages`, `directorArtifacts` | Thread history + generated files |

Primary route: `/director` (also embedded in `FounderDashboard` and `AgentChat` with optional agent focus). See `DESIGN.md` §3c for component map.

---

## 4. Environment Variables (Required)

See `.env.example` for the canonical list (66 documented keys). Key
production requirements:

- `POSTGRES_URL` — Supabase pooler (transaction mode)
- `ANTHROPIC_API_KEY` — Sonnet 4.6 + Opus 4.7
- `GEMINI_API_KEY` — Gemini Flash (voice fallback) + grounded search
- `OPENROUTER_API_KEY` — optional last-resort LLM fallback (DeepSeek Chat)
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
- **Function:** `api/index.ts`, `maxDuration: 600s` (long-running brief/coach paths)

---

## 6. Upgrade Paths

| Future Model | When to Consider | What to Benchmark |
|--------------|------------------|-------------------|
| Opus tier with Sonnet-class latency | When TTFT drops below ~600 ms on 18 KB prompts | Sonnet's adaptive-tone benchmark on actual call transcripts; cost per call |
| Gemini Pro / Ultra | If TTFT improves materially | Voice runtime only — never replaces Opus for reasoning |
| Future Sonnet (4.7+) | On release | A/B test on 10% of voice traffic with sentiment + tool-call success as the success metric |

**Rule:** Never change the reasoning layer without an explicit benchmark
showing equivalent or better adaptive reasoning quality on Wireline's
actual workloads. Never change the voice layer without measuring TTFT
on the production system-prompt size.

---

## 7. Observability

- **Sentry** — error tracking + release tagging
- **Plausible** — privacy-first analytics (already in CSP)
- **Audit Log** — every AI call records `(provider, model, input_tokens, output_tokens, cost_usd, latency_ms)`
- **Call Log Attribution** — every call records both `voice_llm_provider/model` *and* `reasoning_llm_provider/model`, so per-tier cost & quality questions are answerable from one table
- **`/api/health/internal`** — exposes configured tiering (auth-gated)
- **`/api/health/models`** — live 1-token probe of every configured tier with latency report; canary for outages

---

## 8. Security & Compliance

- Content-Security-Policy (strict, no `unsafe-eval`; allowlisted vendors only)
- HSTS, COOP, CORP, Referrer-Policy, Permissions-Policy
- httpOnly `wireline_session` cookie (`SameSite=Lax`, `Secure` in prod) plus optional `Authorization: Bearer` for scripts
- Origin/Referer checks on mutating `/api/*` routes (defense in depth with SameSite cookies)
- RLS on all Supabase tables (verify per environment via `npm run db:health`)
- Webhook signature validation (Vapi, Stripe, Twilio, ElevenLabs — all HMAC + `timingSafeEqual`)
- Rate limiting (Upstash Redis in production, in-mem LRU fallback for local dev)
- Hashed password-reset + email-verification tokens (sha256 in DB; plaintext only in the email link)

---

## 9. Files of Note

| File | Purpose |
|------|---------|
| `src/lib/claude-models.ts` | LLM constants, tiering, Vapi model selection |
| `src/lib/agent-runtime.ts` | Pure helpers that build the system prompt from agent config |
| `src/lib/personality-vibes.ts` | The "agent moat" — adaptive-core + warm/playful/authoritative directives |
| `src/lib/vapi-assistant-factory.ts` | Builds the Vapi assistant config (voice + system prompt + tools + analysis plan) |
| `src/lib/claude-recipes.ts` | `brief`, `coach`, `postCallAnalysis`, `dailyBrief` |
| `src/lib/post-call-digest.ts` | Outcome classification + CRM + email + CSAT pipeline |
| `src/lib/plan-catalog.ts` | Single source of truth for tiered pricing + unit economics |
| `src/lib/wireline-director-design.ts` | Director UI contract (copy, CSS class names, capability catalog) |
| `src/components/DirectorWorkspace.tsx` | Director mission-control shell |
| `src/routes/health-routes.ts` | `/api/health` minimal probe + `/api/health/internal` + `/api/health/models` |
| `DESIGN.md` | Rich Cream + Purple design system + shadcn ratchet rules |

---

## 10. Contact

Questions about architecture or model choices: ask Mike or reference this
document. The single source of truth for model IDs is
`src/lib/claude-models.ts`; this file explains the *why*.

---

*Last reviewed: see `git log -1 -- ARCHITECTURE.md` for the most recent commit. The Sonnet voice + Opus reasoning split is the production contract.*
