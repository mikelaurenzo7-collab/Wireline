<div align="center">
<img width="1200" height="475" alt="Wireline" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Wireline

**Carrier-grade omnichannel agent fleet for SMB and enterprise.**
Voice + email autonomous agents, powered by Claude Opus 4.7, with a
business-intelligence layer that surfaces what actually needs your attention.

---

## What it does

- **Voice agents** answer your phone (via Vapi), book appointments, escalate to humans, and follow up by email — autonomously.
- **Email agents** respond to inbound mail (via Gmail OAuth) using your knowledge base, with optional auto-respond.
- **Single-pass post-call enrichment** — every completed call is scored against BANT, lessons are extracted, follow-up tasks are queued, compliance flags are surfaced, and knowledge gaps are captured for promotion.
- **Daily Brief** — Claude reads yesterday's stats vs the 7-day baseline and writes you a morning summary (headline, mood, highlights, concerns, action items).
- **Triage Inbox** — five tabs of "what needs your attention right now": hot leads, compliance, knowledge gaps (with one-click promote), open tasks, escalations.
- **Insights** — funnel, topic clustering, hour×weekday heatmap, per-agent leaderboard, and Claude-clustered failure modes with fix recommendations.
- **Contact Profile** — unified per-customer history (calls + appointments + leads) on one page. Phone numbers across the app deep-link here.

## Claude recipes

Drop-in modal recipes wired into the surfaces where they belong. All gracefully no-op (503 + "add a key") when `ANTHROPIC_API_KEY` is unset.

| Recipe                  | Where it lives                       | What it does |
|-------------------------|--------------------------------------|--------------|
| **Enrich Lead**         | OutboundDialer rows, Triage Hot Leads, Recipes hub | Claude runs up to 5 web searches via Anthropic's `web_search` server tool. Returns identity hypothesis, employer + role + industry, recent signals (funding/press/hiring), 3–5 conversation hooks, 2–3 likely objections, and source URLs. Honest about confidence (high/medium/low). |
| **Pre-Call Brief**      | OutboundDialer rows, Triage Hot Leads | Tactical playbook before you dial — opening line, key questions, anticipated objections + rebuttals, value props, closing strategy, risk flags. Adaptive thinking. |
| **Lead Qualification**  | CallLogs detail, Triage              | BANT scoring with evidence — every score references a specific phrase from the transcript. |
| **Live Call Coach**     | CallLogs detail                      | Real-time take on a transcript — sentiment, engagement, escalation risk, what's working / at risk, missed opportunities, suggested next words verbatim (≤30 words). |
| **Objection Drills**    | AgentTraining                        | 3–10 realistic scenarios per topic, scripted rebuttal + coaching note per drill, mixed difficulties. |
| **Cold Email**          | ClaudeRecipes hub                    | Reply-worthy outreach in ≤120 words — subject + body + personalization notes. |
| **Persona Clone**       | AgentTraining                        | Distill a real person's voice from sample messages → personality block (optionally save direct to the agent). |
| **Thread Summary**      | EmailInbox                           | Email summary + sentiment, urgency, action items with explicit owners, recommended next step. |
| **Smart Email Draft**   | EmailInbox                           | Cached agent prefix; replaces the legacy Gemini draft path. Falls back to Gemini on failure. |
| **Performance Review**  | AgentTraining                        | Deep audit of an agent's last N calls. One-click apply for each suggested directive. Adaptive thinking. |
| **Ingest from URL**     | AgentTraining                        | Single page or **multi-page site crawl** (up to 25 pages, follows nav links). Multi-select extracted facts → one-click apply to the agent's knowledge base. |
| **Ingest from PDF**     | AgentTraining                        | Upload a brochure, menu, FAQ doc, policy sheet — Claude reads it natively (no external dep) and extracts atomic agent facts. Up to 32 MB. |
| **Agent Forge**         | FleetSettings                        | Synthesize a complete agent from a one-sentence goal — name, archetype, first message, personality, 5–8 directives, 5–10 seed knowledge entries. Atomic provisioning. |

## Architecture

```
┌──────────────────────────┐    ┌──────────────────────────────┐
│  React 19 + Vite + TS    │    │  Express + esbuild           │
│  (lazy-loaded routes)    │◀──▶│  (bundled CJS for Node)      │
│  motion · recharts       │    │  Anthropic SDK · @google/genai│
└──────────────────────────┘    │  @vapi-ai/web · googleapis    │
              │                  └──────────┬───────────────────┘
              ▼                             ▼
       Supabase (auth + RLS)       Vapi · Anthropic · Gemini · Gmail
```

- **Frontend:** React 19, Vite, TypeScript, Tailwind v4, motion/react, recharts, lucide-react. Aurora Obsidian design system (frosted glass + iridescent gradient borders + Instrument Serif italic display).
- **Backend:** Express bundled to a single CJS file via esbuild. Auth via Supabase JWT verification.
- **AI:** Default Claude Opus 4.7 with adaptive thinking on the deep paths. Single-pass post-call analysis (one tool-use call) replaces three Gemini calls. Gemini retained as a fallback path.
- **Data:** Supabase (Postgres + RLS). Schema in `supabase_schema.sql` is idempotent and safe to re-run.

## Run locally

**Prerequisites:** Node 20+, a Supabase project, and (optionally) Vapi + Gemini + Anthropic keys.

```bash
npm install
cp .env.example .env.local
# fill in keys (see below)
npm run dev
```

## Deploy to Vercel

1. **Import** the repo in the [Vercel dashboard](https://vercel.com/new).
2. **Set environment variables** — go to *Project → Settings → Environment Variables* and add every key from `.env.example` that you have. The minimum set to get the app running:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
3. **`APP_URL`** — leave unset for preview deployments (Wireline auto-derives it from Vercel's `VERCEL_URL`). For production with a custom domain, set it to `https://yourdomain.com`.
4. **Deploy.** The `vercel.json` is already configured:
   - `buildCommand` runs `npm run vercel-build` (Vite frontend only).
   - `api/index.ts` is the serverless entry point — Vercel compiles it automatically.
   - All `/api/*` requests route to the serverless function; everything else is served from the CDN.
5. **Google OAuth redirect URI** — if using Gmail integration, register `https://YOUR_APP_URL/api/oauth/google/callback` in your Google Cloud Console OAuth client.
6. **Stripe webhook endpoint** — register `https://YOUR_APP_URL/api/stripe-webhook` in the Stripe dashboard and paste the signing secret into `STRIPE_WEBHOOK_SECRET`.
7. **Vapi server URL** — set your Vapi assistant's server URL to `https://YOUR_APP_URL/api/vapi-webhook`.

## Environment

```bash
# Supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # backend service role (optional)

# AI
ANTHROPIC_API_KEY=                # unlocks every /api/claude/* path
GEMINI_API_KEY=                   # legacy + fallback paths

# Voice
VAPI_PRIVATE_KEY=
VITE_VAPI_PUBLIC_KEY=

# Gmail (email agent)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

APP_URL=http://localhost:3000     # used for OAuth callback
```

## Database

Run `supabase_schema.sql` in the Supabase SQL editor. It declares every table with RLS enabled and includes a section of idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` migrations safe to re-run on existing installs.

## Endpoints

### Operations
- `GET  /api/health` — liveness + capability flags
- `GET  /api/dashboard/stats`
- `GET  /api/triage`
- `GET  /api/contacts/:number` — unified per-customer history

### Insights
- `GET  /api/insights/funnel` · `/heatmap` · `/leaderboard`
- `GET  /api/insights/topics` (Claude · 1h cache)
- `GET  /api/insights/failure-modes` (Claude · 1h cache)
- `GET  /api/insights/daily-brief` (Claude · per-day cache)

### Claude recipes
All require `ANTHROPIC_API_KEY` and are rate-limited to 60 req/min/user.
- `POST /api/claude/brief` · `enrich-lead` · `qualify` · `objection-drill` · `cold-email`
- `POST /api/claude/persona-clone` · `summarize-thread` · `route-intent`
- `POST /api/claude/email-draft` · `agent-review`
- `POST /api/claude/coach` · `forge` · `forge/create`
- `POST /api/claude/knowledge-from-url` (single + crawl) · `knowledge-from-document` (PDF) · `knowledge-from-url/apply`
- `POST /api/knowledge-gaps/:id/promote`

### Spend & audit
- `GET  /api/audit/summary` — totals + per-day + per-recipe + per-model breakdowns
- `GET  /api/audit/recent`  — last N raw entries (debug + compliance)
- `GET  /api/spend/budget` · `PUT /api/spend/budget` — monthly Claude limit + hard-cap toggle
- `GET  /api/spend/status`  — month-to-date spend, % used, alerts fired, hard-cap state

When month-to-date spend crosses the warn threshold or the limit, Wireline fires `spend.warning` / `spend.exceeded` outbound webhook events (debounced to once per period). With **hard cap on**, Claude calls return HTTP 402 once the limit is reached — no surprise bills.

### Webhook delivery queue
Every dispatch persists a `wireline_webhook_deliveries` row. Failed attempts retry with exponential backoff (30s · 2m · 10m · 1h, max 5 attempts → status `dead`). A 30s background scheduler picks up due retries.
- `GET    /api/webhooks/:id/deliveries` — recent deliveries for a hook
- `POST   /api/webhooks/deliveries/:id/retry` — manually requeue a failed/dead delivery
- `DELETE /api/webhooks/deliveries/:id` — discard

Each request includes `X-Wireline-Attempt: <n>` so receivers can implement their own idempotency.

### Inbound lead intake API
- `POST /api/intake/lead` — public, authenticated by `X-Wireline-Key: wlk_…`. Body `{ customer_name?, customer_number, context?, metadata?, agent_id? }`. Inserts into the leads table with `source='inbound'` so the dialer + Triage surfaces pick it up automatically, then fires a `lead.received` webhook event.
- `POST /api/intake/leads` — bulk variant (up to 100 leads per request). Body `{ leads: [...] }`. Each lead can carry its own `idempotency_key`. Returns `{ count, success_count, failure_count, results: [...] }` so partial failures don't roll back the rest. Each lead counts as one rate-limit hit.
- `GET  /api/intake/keys` · `POST /api/intake/keys` · `PATCH/DELETE /api/intake/keys/:id` — manage per-user intake keys (plaintext returned only at create time; SHA-256 stored).

Per-key features:
- **Auto-dial** — when on, the lead is recorded *and* an outbound call from the default agent is dispatched in the background. Composes with the post-call enrichment + audit + webhooks pipeline. Response includes `auto_dial_initiated: true`; the lead row gets `call_id` + `status: "Dialing"` once Vapi accepts the call (or `status: "AutoDialFailed"` with the reason in `metadata.auto_dial_error`).
- **Idempotency** — pass an `Idempotency-Key` header (≤ 255 chars). Same key + same operator returns the original `lead_id` with `idempotent_replay: true`. Enforced by a partial unique index, so concurrent retries of a form submission can't create duplicates.
- **Rate limit** — 60 requests / minute per intake key. Excess returns HTTP 429 with `Retry-After`.

```bash
curl -X POST $WIRELINE_URL/api/intake/lead \
  -H "Content-Type: application/json" \
  -H "X-Wireline-Key: wlk_..." \
  -H "Idempotency-Key: form-submission-12345" \
  -d '{"customer_name":"Jane Doe","customer_number":"+15551234567","context":"Filled out demo form","metadata":{"utm_source":"newsletter"}}'
```

### Billing (Stripe)
- `GET    /api/billing/plans` · public — plan catalog with `configured: true|false` per tier.
- `GET    /api/billing/status` — current subscription (plan, status, period end, cancel-at-period-end).
- `POST   /api/billing/checkout` `{ plan_id }` — returns `{ url }` for a Stripe Checkout session.
- `POST   /api/billing/portal` — returns `{ url }` for the Stripe Customer Portal (manage / cancel / update card).
- `POST   /api/stripe-webhook` — signature-verified, raw-body. Subscribed events: `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_failed`. Mirrors into `wireline_subscriptions` AND keeps `wireline_settings.subscription_status` + `max_agents` in sync so all existing gates keep working. Fires `subscription.changed` outbound webhook.

Required env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID`. Plan tiers (price, agent cap, feature list) live in `server.ts` (`STRIPE_PLANS`); only the price IDs vary per environment.

### Knowledge base
- `GET    /api/knowledge` — every fact across every agent + agent metadata, for the cross-agent Knowledge Atlas view.
- `POST   /api/knowledge` — `{ agent_id, content }`. Adds a fact directly from the Atlas without going through Neural Atelier.
- `PATCH  /api/knowledge/:id` — edit content (RLS scoped to owner).
- `DELETE /api/knowledge/:id` — permanent delete.
- `POST   /api/claude/knowledge-dedupe` — Claude pass over the operator's whole knowledge base (≤ 400 facts). Returns clusters of duplicates / near-duplicates / contradictions with a `recommended_keep_id` per cluster. Auto-instrumented via `withAudit` so the cost shows up in AI Spend.

### Scheduled Daily Brief email
Claude's morning brief sent to your inbox at a chosen UTC time, via your connected Gmail account (no extra dependency).
- `GET  /api/daily-brief/settings` · `PUT /api/daily-brief/settings` — `{ enabled, send_at: "HH:MM", recipient }`
- `POST /api/daily-brief/send-now` — preview email; bypasses cache + doesn't update last-sent timestamp.

A 5-minute background scheduler picks up due users, computes the brief (sharing the per-day cache with the in-app view), renders an HTML+plaintext multipart email, and sends via the operator's existing Gmail OAuth. Per-send errors are persisted to `daily_brief_last_error` so silent failures are visible in the UI.

### Voice / Email / Fleet
See `server.ts` for the full list — voice webhook (`/api/vapi-webhook`), email sync, agent CRUD, outbound dialer, fleet tasks, etc.

## Keyboard

| Shortcut | Action |
|---|---|
| ⌘K / Ctrl+K | Open the command palette — jump anywhere, run any action |

## Build

```bash
npm run lint     # tsc --noEmit
npm run build    # vite build + esbuild server
npm start        # node dist/server.js
```

## License

Internal — see your org's license terms.
