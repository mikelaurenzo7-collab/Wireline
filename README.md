# Wireline

**AI voice + email agents for every customer conversation.**

The horizontal AI agent platform for businesses that pick up the phone. One fleet of agents handles inbound calls, outbound dialing, SMS, and email — trained on your playbook, available 24/7, watched in a live supervisor cockpit, and getting sharper with every conversation.

Built by [Michael Laurenzo](https://trywireline.com/about). Powered by Claude.

---

## Plans & pricing

| Plan | Price/mo | Included operators | Included minutes/mo | Overage rate | Included voice agents |
| --- | --- | --- | --- | --- | --- |
| **Personal** | $49 | 1 | 400 | $0.20 | 1 |
| **Starter** | $149 | 3 | 1,200 | $0.18 | 2 |
| **Pro** | $499 | 10 | 5,000 | $0.15 | 5 |
| **Business** | $1,499 | 25 | 12,000 | $0.14 | 10 |
| **Enterprise** | Custom | Custom | Custom | Custom | Custom |

Plan metadata is defined in `src/lib/plan-catalog.ts`. Keep this README table in sync with the catalog; `npm run docs:check` fails when pricing drifts.

## 🚀 Production-Ready & Feature Complete

Wireline has been rigorously audited and hardened for production deployment. From serverless infrastructure to aesthetic UI consistency, the platform is ready for prime-time.

- **Shadcn UI & Design System:** A complete visual pivot to Shadcn UI ensures a premium, cohesive aesthetic across all client-facing and authenticated pages. The signature "Cream & Purple" aesthetic is standardized with full Dark Mode support.
- **Agent Extensibility & Integrations:** The autonomous Action Engine seamlessly orchestrates CRM, calendar, and email syncs with strict data isolation. Extensibility is baked in for any custom agent logic.
- **Optimized Performance:** Skeleton app shells, PWA caching (`sw.js`), and Vite's per-route code-splitting + tree-shaking keep load times fast and the main bundle lean.
- **Ironclad Security:** AES-256-GCM envelope encryption protects all tenant secrets at rest. Complete with CSP hardening and Postgres Row Level Security (RLS) — tenant isolation enforced at the database via a per-request `app.current_user_id` GUC, audited against the Supabase security advisor.
- **Scalability:** Composite B-tree indexes on the hot `(user_id, created_at)` query paths, backed by Supabase transaction-pooled connections for serverless edge scaling.
- **Marketing & SEO:** Fully populated semantic meta tags and OpenGraph integration ready the site for search indexers and social sharing.

---

## Why we exist

Voice AI in 2026 still ships flat, corporate, anodyne agent personas. They're forgettable. They're afraid to be wrong, so they're afraid to be sharp. And when their tools don't reach far enough, they fabricate the action and hang up.

Wireline picks up the call like the sharpest, warmest receptionist in town. Three personality vibes (warm · playful · authoritative), one voice per agent, an always-on **adaptive + quick** core directive that makes every agent read the caller's tone in real time, and a hard rule that the agent **never claims an action it doesn't have a tool for.**

## Live demo — call any of these numbers right now

| Agent | Vibe | Number | Plays |
|---|---|---|---|
| **Sarah** | warm | (630) 642-5661 | General Wireline support |
| **Liam** | playful | (630) 581-1834 | Sales & plan comparison |
| **Tyler** | warm | (564) 238-9455 | Technical support |
| **Maya** | playful | (630) 642-5927 | Onboarding & demos |

Every agent runs **Claude Sonnet 4.6** on the live voice path — the smartest model in the latency class voice can tolerate. **Claude Opus 4.7** runs the *reasoning* layer behind every call: pre-call briefs, post-call analysis, daily brief generation, and agent coaching. Deepgram Nova-3 STT handles inbound audio; ElevenLabs Flash v2.5 handles synthesis.

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

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | React 19 + Vite + TypeScript | Fast HMR, tree-shaken bundles, every route lazy-loaded |
| **Styling** | Tailwind CSS 4 + Shadcn UI | Atomic utility classes combined with accessible, unstyled component primitives |
| **API** | Express on Vercel serverless functions | One handler tree, deployed as one function |
| **Database** | Postgres on Supabase, Drizzle ORM | Type-safe queries, idempotent migrations, B-tree indexed hot paths |
| **Voice runtime** | Vapi + ElevenLabs Flash v2.5 | Live latency under 250 ms |
| **LLM** | Claude Sonnet 4.6 & Opus 4.7 | Quality-first tiering |

## Contributing
This repo is the property of Wireline. External contributions aren't open yet, but if you're interested in working on it, [reach out](https://trywireline.com/about).

Engineering docs: [docs/README.md](./docs/README.md) (architecture, design system, deploy, SOC 2). New engineers start with [CONTRIBUTING.md](./CONTRIBUTING.md).

## License
Proprietary. © 2026 Wireline. All rights reserved.
