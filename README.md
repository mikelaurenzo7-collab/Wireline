# Wireline

**AI voice + email agents for every customer conversation.**

The horizontal AI agent platform for businesses that pick up the phone.
One fleet of agents handles inbound calls, outbound dialing, SMS, and
email — trained on your playbook, available 24/7, watched in a live
supervisor cockpit, and getting sharper with every conversation.

Built by [Michael Laurenzo](https://trywireline.com/about). Powered by
Claude.

---

## Why we exist

Voice AI in 2026 still ships flat, corporate, anodyne agent personas.
They're forgettable. They're afraid to be wrong, so they're afraid to
be sharp. And when their tools don't reach far enough, they fabricate
the action and hang up.

Wireline picks up the call like the sharpest, warmest receptionist in
town. Three personality vibes (warm · playful · authoritative), one
voice per agent, an always-on **adaptive + quick** core directive
that makes every agent read the caller's tone in real time, and a
hard rule that the agent **never claims an action it doesn't have a
tool for.** It's the brand line your competitors can't credibly copy.

## Live demo — call any of these numbers right now

| Agent | Vibe | Number | Plays |
|---|---|---|---|
| **Sarah** | warm | (630) 642-5661 | General Wireline support |
| **Liam** | playful | (630) 581-1834 | Sales & plan comparison |
| **Tyler** | warm | (564) 238-9455 | Technical support |
| **Maya** | playful | (630) 642-5927 | Onboarding & demos |
| **Devon** | warm | (207) 593-5155 | Billing |
| **Priya** | warm | (572) 726-9365 | Customer success |
| **Marcus** | authoritative | (617) 313-4469 | Medical intake (demo) |
| **Aisha** | playful | (973) 363-8874 | Real estate (demo) |
| **Elena** | authoritative | (904) 460-1596 | Insurance claims (demo) |
| **Jake** | playful | (469) 257-1581 | Outbound SDR (demo) |

Every agent runs **Claude Sonnet 4.6** on the live voice path —
the smartest model in the latency class voice can tolerate
(real-world TTFT ~300–500 ms against an 18 KB system prompt).
**Claude Opus 4.7** runs the *reasoning* layer behind every call:
pre-call briefs, post-call analysis, daily brief generation,
agent coaching — anywhere a few hundred milliseconds of think
time is invisible because the user isn't waiting on the wire.

Deepgram Nova-3 STT (~6.8% WER) at 40 ms endpointing handles
the inbound audio; ElevenLabs Flash v2.5 (pinned model — no
Vapi auto-swaps mid-call) handles synthesis. Gemini 3.5 Flash
sits behind the voice path as an availability fallback only.

End-to-end perceived dead air lands around 700–900 ms after
the caller stops talking — well under the "did they hang up?"
threshold, and the agent's reply itself is Sonnet-grade adaptive.

---

## Quick start

```bash
# Clone
git clone https://github.com/mikelaurenzo7-collab/wireline.git
cd wireline

# Install (Node 20+)
npm install

# Env — copy .env.example, fill in the secrets you have
cp .env.example .env

# Boot the dev server (Vite frontend + Express API)
npm run dev          # → http://localhost:3000

# Type-check + tests + production build
npm run verify

# Production preview
npm run build && npm run start
```

That's it. The dev server stubs missing integrations so you can run
the whole console without a Vapi account or a Stripe key — just don't
expect to actually place a call. To get end-to-end calls working
locally, fill in `VAPI_PRIVATE_KEY`, `ANTHROPIC_API_KEY`, and
`POSTGRES_URL` in `.env`.

---

## What's in here

```
.
├── src/
│   ├── pages/          # Lazy-loaded React routes (landing, pricing,
│   │                   # compare, vertical wedges, in-app pages)
│   ├── components/     # All reusable UI (~140 files)
│   ├── routes/         # Express API handlers (40+ routes)
│   ├── lib/            # Pure logic — agent runtime, personality
│   │                   # vibes, Vapi client, Claude brain, billing,
│   │                   # rate limiting, audit logging, integrations
│   ├── data/           # Static config — contact agents, wireline
│   │                   # knowledge, vertical wedge definitions
│   ├── middleware/     # Auth, CORS, timeouts, rate limits
│   └── db/             # Drizzle schema (single source of truth)
│
├── api/index.ts        # Vercel serverless entry point
├── server.ts           # Local dev Express boot
├── drizzle/migrations/ # Idempotent SQL migrations
├── scripts/            # Operator tooling — Vapi sync, OG image
│                       # rendering, visual QA, OAuth redirect printer
├── tests/e2e/          # Playwright E2E tests
└── public/             # Static assets — favicon, OG images,
                        # legal docs, sitemap, robots, manifest
```

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | React 19 + Vite + TypeScript | Fast HMR, tree-shaken bundles, every route lazy-loaded |
| **Styling** | Tailwind CSS 4 + Motion (Framer) | Atomic + a tight motion vocabulary |
| **API** | Express on Vercel serverless functions | One handler tree, deployed as one function |
| **Database** | Postgres on Supabase, Drizzle ORM | Type-safe queries, idempotent migrations |
| **Auth** | Custom JWT + OAuth (Google · Microsoft · Yahoo) | Bearer-in-Authorization-header; no cookie sessions |
| **Voice runtime** | Vapi + ElevenLabs Flash v2.5 | Live latency under 250 ms |
| **LLM** | Claude Sonnet 4.6 (voice) · Opus 4.7 (reasoning) · Haiku 4.5 (utility) · Gemini 3.5 Flash (voice fallback) · Gemini 2.5 Flash (grounded search) | Quality-first tiering. Sonnet on the live wire for smart + fast; Opus on briefs/coach/post-call where the user isn't waiting. |
| **Payments** | Stripe — checkout + portal + webhooks | Subscriptions + usage metering |
| **Background jobs** | Postgres-backed claim/fail/retry queue | No Redis dependency for job state |
| **Rate limits** | Upstash Redis (in-mem fallback w/ LRU) | Distributed buckets per route + per user |
| **Hosting** | Vercel (apex + functions + CDN) | One-click deploys, edge cache for static assets |

---

## Common workflows

### Run tests

```bash
npm run test            # Vitest in watch mode
npm run test:run        # Single-shot for CI
npm run e2e             # Playwright E2E suite
```

### Database

```bash
# Generate a new migration from schema changes
npm run db:generate

# Apply pending migrations
npm run db:migrate

# Visualize the schema
npm run db:studio
```

All migrations use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` so
they're safe to re-run. Owner-gated admin endpoints at
`/api/admin/migrate-*` mirror the same DDL for production rollouts.

### Deploy

`main` (or whichever branch is configured as the Vercel
`productionBranch`) auto-deploys on push. The build runs
`vercel-build` → `npm run assets && vite build && esbuild server.ts`
and outputs to `dist/`.

### Sync the 10 showcase Vapi assistants

After changing system prompts, vibes, or latency knobs:

```bash
VAPI_PRIVATE_KEY=… npx tsx scripts/sync-wireline-showcase.mts
```

That hits the Vapi API directly, fetches each assistant's existing
voiceId (so per-agent voices stay intact), and patches the system
prompt + latency knobs in one shot. Same logic the auth-gated
`/api/admin/sync-vapi-knowledge` endpoint runs — different
authentication path for ops use.

### Visual QA

```bash
# Public surface — landing, pricing, compare, etc.
npx tsx scripts/visual-qa.mts

# Signed-in product surface
QA_EMAIL=… QA_PASS=… npx tsx scripts/visual-qa-authed.mts
```

Drops PNG screenshots in `/tmp/qa/<viewport>/<slug>.png` for review.

---

## How the agent moat works

Every Wireline agent system prompt is assembled at runtime by
`src/lib/agent-runtime.ts`. Composition:

1. **Role + scope** — what this agent does (operator-configured)
2. **Adaptive + quick core** — always-on. Versatile handling of
   whatever the caller asks, locked personality/voice/cadence,
   no filler, no fabricated actions
3. **Personality vibe** — warm / playful / authoritative
4. **Compliance posture** — HIPAA / PCI / GDPR if enabled
5. **Operator guardrails** — disallowed topics, escalation triggers,
   KPI focus
6. **Business variables** — substituted from operator config
7. **Out-of-hours flow** — if outside business hours, runs the
   voicemail flow instead

The vibe directives live in `src/lib/personality-vibes.ts`. Three
short, opinionated paragraphs:

- **Warm** — Trustworthy receptionist default. Works for any vertical.
- **Playful** — Witty + memorable. The "quirky barista with technical
  chops" line. Capability earns the right to wit, never the other
  way around.
- **Authoritative** — Formal + crisp. For medical / legal / financial
  intake where gravity matters.

One voice per agent, three scripts. Operators pick the vibe in
FleetSettings → Voice; tenants on the showcase line have it set per
agent in `src/data/contact-agents.ts`.

### Best-in-class call quality

Every agent's Vapi assistant config (`src/lib/vapi-assistant-factory.ts`)
ships with the full latency + quality stack:

| Setting | Value | What it buys you |
|---|---|---|
| `responseDelaySeconds` | 0 | Agent starts speaking the instant the caller stops |
| `numWordsToInterruptAssistant` | 2 | Caller can barge in after 2 words — no steamrolling |
| `optimizeStreamingLatency` | 4 (max) | Fastest first-audio-out from ElevenLabs |
| `transcriber` | Deepgram Nova-2 + smartFormat | Best-in-class STT, numbers/times/money read back right |
| `voicemailDetection` | Twilio ML + 15s timeout | Skips dud LLM-talks-to-robot calls = real $$ saved |
| `analysisPlan` | Structured extraction | Post-call: `caller_intent`, `outcome`, `commitments`, `sentiment`, `success` |
| `voice.speed` | 0.7 – 1.2 per agent | Operator-tunable for elderly vs impatient callers |
| `voice.stability/style/...` | Per-agent fine-tuning | Cloned voices dialed in to operator preference |
| `pronunciationDictionaryLocators` | Per-tenant | HVAC → H-V-A-C, ACL → A-C-L (per vertical) |

### ElevenLabs feature surface

What we use from ElevenLabs's API today:

- **Voice library + custom voices** (`/voices`, `/voices/add`) — every premade voice + tenant clones
- **Voice Isolator** (`/audio-isolation`) — auto-cleans clone uploads (operators record on phones; isolator gets studio-quality input)
- **Pronunciation Dictionaries** (`/pronunciation-dictionaries`) — per-tenant jargon control synced into Vapi
- **Speech-to-Text** (`/speech-to-text`, Scribe model) — re-transcribe call recordings when Vapi STT is questionable
- **Text-to-Speech streaming** (via Vapi runtime) — Flash v2.5 model, max-latency-optimized
- **Webhooks** (`/api/webhooks/elevenlabs`) — HMAC-signed voice removal + transcription events

Not used (deliberately): ElevenLabs Agents platform (Vapi handles call
runtime better), Music API (requires paid plan), Voice Changer (no
product fit), Dubbing (we're phone-only).

### Marketing wedges — vertical landing pages

`/for/<slug>` routes pull from a single `WEDGES` config in
`src/pages/VerticalLanding.tsx`. Adding a vertical is a ~20-line entry
+ a route guard update.

Live wedges: **home-services**, **medical**, **legal**, **real-estate**,
**personal**, **insurance**, **restaurants**, **sales**. Each ships
its own meta tags, hero copy, 4 pain points, sample script, stat band,
FAQ, and CTA — but the product behind them is the horizontal platform.

### Pricing + billing

Plans live in `src/lib/plan-catalog.ts`. Each plan ships:
- Flat monthly price (Stripe `STRIPE_*_PRICE_ID`)
- Included voice minutes (pooled across all agents)
- Per-agent à-la-carte overage agent slot (Personal $49, Starter $45, Pro $40, Business $35)
- Per-minute overage rate (Personal $0.20, Starter $0.18, Pro $0.15, Business $0.14)
- Max agents + included phone numbers
- Per-tenant feature flags (HIPAA mode, white-label, dedicated number)

| Tier | Price / mo | Agents | Minutes | Overage / min | Included #s |
|---|---|---|---|---|---|
| **Personal** | $49 | 1 | 400 | $0.20 | 1 |
| **Starter** | $149 | 3 | 1,200 | $0.18 | 2 |
| **Pro** | $499 | 10 | 5,000 | $0.15 | 5 |
| **Business** | $1,499 | 25 | 12,000 | $0.14 | 10 |
| **Enterprise** | Custom | 100+ | 50,000+ | $0.11 | 25 |

Pricing math, gross-margin targets, and per-tier rationale live as
docstrings in `src/lib/plan-catalog.ts`. CI runs
`npm run docs:check` to fail any push where the table above drifts
from the catalog.

Stripe **metered billing** for voice-minute overage is wired but
inert until `STRIPE_VOICE_OVERAGE_METER_EVENT_NAME` is set in the
environment (lets us ship usage tracking + the UI ahead of operator
Stripe setup). See the docstring on `emitVoiceMinuteOverageEvent`
in `src/lib/stripe-helpers.ts` for the dashboard setup steps.

### Phone numbers

Vapi-managed by default (first 10 free, then $2/mo). Self-serve
claim via `/api/phone-numbers/provision` from the operator UI;
admin bulk-fill via `/api/admin/phone-numbers/fill-pool`. Trial
accounts get a number when the first agent is created. Twilio BYO porting works
for customers who want to keep their existing number.

---

## Contributing

This repo is the property of Wireline. External contributions aren't
open yet, but if you're interested in working on it,
[reach out](https://trywireline.com/about).

Internal contributors:

1. Branch off `main`
2. Run `npm run verify` before pushing — TypeScript clean, tests
   green, production build clean
3. Commit messages: imperative subject ≤72 chars, one blank line,
   body explaining the **why**
4. Keep features small and reversible. Big refactors get reviewed
   one phase at a time, not as one mega-PR.

## License

Proprietary. © 2026 Wireline. All rights reserved.

---

**Need help?** Call (630) 642-5661 and ask Sarah.
