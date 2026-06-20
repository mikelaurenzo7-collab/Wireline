# Wireline

**Your personal AI call concierge.**

Wireline lets regular people delegate phone work: call the pharmacy, doctor, school, airline, landlord, restaurant, or support line and get a clear result back. If you run a business, use the same agent studio and console to configure business hours, routing, scripts, handoffs, and follow-up workflows.

Built by [Michael Laurenzo](https://trywireline.com/about). Model-flexible by design: each agent can use the runtime that best fits its call, latency, and cost profile.

---

## Plans & pricing

| Plan         | Price/mo | Included minutes/mo | Overage rate | Included voice agents | Extra agent |
| ------------ | -------- | ------------------- | ------------ | --------------------- | ----------- |
| **Everyday** | $7       | 60                  | $0.20        | 1                     | +$7/mo      |
| **Plus**     | $15      | 180                 | $0.18        | 2                     | +$7/mo      |
| **Studio**   | $29      | 500                 | $0.16        | 4                     | +$9/mo      |
| **Operator** | $59      | 1,200               | $0.14        | 8                     | +$12/mo     |
| **Custom**   | Custom   | 5,000               | $0.12        | 25                    | Custom      |

Plan metadata is defined in `src/lib/plan-catalog.ts`. Keep this README table in sync with the catalog; `npm run docs:check` fails when pricing or runtime-model copy drifts.

## Launch posture

Wireline is built around a simple consumer promise: delegate the call, preserve context, and get a clear outcome. The product is structured to make each high-cost external dependency explicit rather than silently pretending a call, integration, or action completed.

- **Clear public product surface:** The landing page leads with a single job-to-be-done, direct pricing, an audible demo, and a restrained monochrome presentation.
- **Configurable agents:** The Agent Studio supports individual personal agents and business workflows without requiring separate products or disconnected setup flows.
- **Cost-aware model routing:** Claude Sonnet 4.6 handles the realtime voice default; Claude Opus 4.7 handles deeper, non-realtime reasoning. Operators can choose from the supported runtime catalog when a different latency, quality, or cost trade-off is appropriate.
- **Tenant safety:** Server-side authorization, database RLS, encryption for stored tenant secrets, CSP controls, and per-route cost guards protect the multi-tenant product boundary.
- **Operational transparency:** Missing integrations return actionable failure states. Agents are instructed not to claim an action they do not have the tools to complete.

---

## Why we exist

Phone work is still fragmented: hold queues, repeated calls, and answers that never make it back to the right person. Wireline makes that work delegable while retaining context, control, and a clear record of what happened.

Agents can be tuned for warm, playful, or authoritative conversations, but the product rule is constant: an agent never claims an action it does not have a tool for.

## Live demo — call any of these numbers right now

| Agent     | Vibe    | Number         | Plays                    |
| --------- | ------- | -------------- | ------------------------ |
| **Sarah** | warm    | (630) 642-5661 | General Wireline support |
| **Liam**  | playful | (630) 581-1834 | Sales & plan comparison  |
| **Tyler** | warm    | (564) 238-9455 | Technical support        |
| **Maya**  | playful | (630) 642-5927 | Onboarding & demos       |

Every agent runs **Claude Sonnet 4.6** on the live voice path — the smartest model in the latency class voice can tolerate. **Claude Opus 4.7** runs the _reasoning_ layer behind every call: pre-call briefs, post-call analysis, daily brief generation, and agent coaching. Deepgram Nova-3 STT handles inbound audio; ElevenLabs Flash v2.5 handles synthesis.

---

## Quick start

```bash
# Clone
git clone https://github.com/mikelaurenzo7-collab/wireline.git
cd wireline

# Install (Node 22+)
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

## Tech stack

| Layer             | Choice                                 | Why                                                                            |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| **Frontend**      | React 19 + Vite + TypeScript           | Fast HMR, tree-shaken bundles, every route lazy-loaded                         |
| **Styling**       | Tailwind CSS 4 + Shadcn UI             | Atomic utility classes combined with accessible, unstyled component primitives |
| **API**           | Express on Vercel serverless functions | One handler tree, deployed as one function                                     |
| **Database**      | Postgres on Supabase, Drizzle ORM      | Type-safe queries, idempotent migrations, B-tree indexed hot paths             |
| **Voice runtime** | Vapi + ElevenLabs Flash v2.5           | Live latency under 250 ms                                                      |
| **LLM**           | Per-agent runtime catalog              | Choose a voice-quality, latency, and cost trade-off intentionally              |

## Contributing

This repo is the property of Wireline. External contributions aren't open yet, but if you're interested in working on it, [reach out](https://trywireline.com/about).

Engineering docs: [docs/README.md](./docs/README.md) (architecture, design system, deploy, SOC 2). New engineers start with [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Proprietary. © 2026 Wireline. All rights reserved.
