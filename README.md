# Wireline

**AI voice + email agents for every customer conversation.**

The horizontal AI agent platform for businesses that pick up the phone.
One fleet of agents handles inbound calls, outbound dialing, SMS, and
email — trained on your playbook, available 24/7, watched in a live
supervisor cockpit, and getting sharper with every conversation.

Built by [Mike Laurenzo](https://trywireline.com/about). Powered by
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

Each agent runs Claude Sonnet 4.6 with a ~200 ms perceived reply
delay, deepgram-nova-3 transcription at 50 ms endpointing, and
ElevenLabs Flash v2.5 voice synthesis.

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
npm run dev          # → http://localhost:5173

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
├── e2e/                # Playwright E2E tests
└── public/             # Static assets — favicon, OG images,
                        # legal docs, sitemap, robots, manifest
```

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | React 18 + Vite + TypeScript | Fast HMR, tree-shaken bundles, every route lazy-loaded |
| **Styling** | Tailwind CSS 4 + Motion (Framer) | Atomic + a tight motion vocabulary |
| **API** | Express on Vercel serverless functions | One handler tree, deployed as one function |
| **Database** | Postgres on Supabase, Drizzle ORM | Type-safe queries, idempotent migrations |
| **Auth** | Custom JWT + OAuth (Google · Microsoft · Yahoo) | Bearer-in-Authorization-header; no cookie sessions |
| **Voice runtime** | Vapi + ElevenLabs Flash v2.5 | Live latency under 250 ms |
| **LLM** | Claude Sonnet 4.6 (showcase) · Opus 4.6 (premium tenant) · Gemini 2.5 (fallback) | Smart-enough-where-it-matters tiering |
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
2. **Adaptive + quick core** — always-on. Listen, match cadence,
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

---

## Contributing

This repo is the property of Wireline. External contributions aren't
open yet, but if you're interested in working on it,
[reach out](https://trywireline.com/about).

Internal contributors:

1. Branch off the current production branch (currently
   `claude/audit-vercel-env-3jCjd`)
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
