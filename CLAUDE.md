# CLAUDE.md

Guidance for assistants working in this repository.

## What Wireline is

Wireline is a horizontal **AI voice + email agent platform** — one fleet of agents that handles inbound calls, outbound dialing, SMS, and email for businesses and personal workflows.

It is a single TypeScript codebase: a **React 19 + Vite** frontend and an **Express** API that build into one Vercel serverless function. Data lives in **Postgres (Supabase)** via **Drizzle ORM**. Voice runs on **Vapi + ElevenLabs**.

## Current product pass

Wireline is moving to the Stitch-inspired dark studio direction. The previous design notes were retired so the product can be migrated cleanly before stricter checks are restored.

Use the implemented Studio/Training screens as the current visual reference. Keep changes buildable and focused on the product surface.

## Useful docs

| Topic | Read |
|---|---|
| System design, LLM tiering, data flows | `ARCHITECTURE.md` |
| Engineering patterns | `CONTRIBUTING.md` |
| Database setup & migrations | `DATABASE_SETUP.md` |
| Deployment (Vercel) | `DEPLOY.md` |
| Doc index, SOC 2, SLA, incident response, authz matrix | `docs/` |

## Commands

```bash
npm run dev            # Vite frontend + Express API on one process
npm run verify         # migration gate: build + bundled-server smoke test
npm run verify:full    # legacy full gate, kept available for later hardening
npm run build          # render assets, Vite build, server bundle
npm run start          # run the production bundle
npm run lint           # tsc --noEmit
npm run lint:eslint    # eslint --max-warnings 0 src/
npm run format         # prettier --write src
npm run test           # vitest watch
npm run test:run       # vitest single-shot
npm run db:generate    # generate migration from src/db/schema.ts edits
npm run db:migrate     # apply migrations
npm run db:push        # push schema directly in dev
npm run db:studio      # visual schema browser
npm run db:health      # verify RLS + connectivity per environment
```
