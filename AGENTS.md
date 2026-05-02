# Instructions for coding agents

This file is read by every coding agent that opens this repo (Claude Code,
Codex, Jules, Cursor agents, etc.). Read it before doing anything destructive.

## Architecture (do not break)

Wireline runs on **two LLM providers simultaneously by design**:

- **Anthropic Claude (Opus 4.7)** is the primary brain. It powers every
  `/api/claude/*` endpoint, the post-call enrichment pipeline, the Daily
  Brief, the Triage Inbox, the Insights view, the Contact Profile, and
  every recipe in `src/components/ClaudeRecipes.tsx`.
- **Google Gemini** is retained as a fallback for paths where the
  operator hasn't configured `ANTHROPIC_API_KEY` yet, and as the legacy
  voice provider for Vapi.

**Both providers are required.** Removing either one breaks production.

## Files that MUST NOT be deleted

These are load-bearing — touching them without operator approval will
break the deployment:

- `src/lib/claude-brain.ts` — server-side Anthropic SDK wrapper. Every
  Claude endpoint goes through this.
- `src/components/ClaudeRecipes.tsx` — modal recipe UI. Wired into
  AgentTraining, OutboundDialer, EmailInbox, CallLogs, FleetSettings.
- `src/components/ContactProfile.tsx` — unified per-customer history
  view. Phone numbers across the app deep-link here.
- `src/components/InsightsView.tsx` — funnel + topic clusters + heatmap
  + leaderboard + failure modes.
- `src/components/TriageInbox.tsx` — operator's daily-attention surface.
- `src/components/DailyBrief.tsx` — Claude-authored morning summary on
  the dashboard.
- `src/components/OnboardingQuickstart.tsx` — first-run flow for new
  operators (auto-hides once they're set up).
- `src/components/ErrorBoundary.tsx` — app-level render-error recovery.
- `src/components/CsvExportButton.tsx` — used by CallLogs / Outbound /
  Insights / Triage for operator data export.

## Dependencies that MUST stay in package.json

- `@anthropic-ai/sdk` — used by `src/lib/claude-brain.ts` and every
  Claude endpoint in `server.ts`. **Do not remove this even if a static
  analyzer reports it as unused — usage crosses module boundaries
  (server.ts imports from src/lib/claude-brain.ts).**
- `@google/genai` and `@google/generative-ai` — Gemini fallback paths.
- `@vapi-ai/web` — voice integration.
- `@supabase/supabase-js` — database / auth.

## Env vars that MUST stay documented in `.env.example`

- `ANTHROPIC_API_KEY` — unlocks every `/api/claude/*` endpoint and the
  Daily Brief + Insights Claude paths. Do not remove.
- `GEMINI_API_KEY` — fallback for legacy paths.
- `VAPI_PRIVATE_KEY` / `VITE_VAPI_PUBLIC_KEY` — voice.
- `VAPI_WEBHOOK_SECRET` — webhook signature verification.
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — db + auth.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Gmail OAuth.

## Database schema

`supabase_schema.sql` is **idempotent** — the bottom contains
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` migrations safe to re-run.
Do not delete those — existing installs depend on them to upgrade.

## Build verification

Before pushing any change, run:

```bash
npx tsc --noEmit    # must be clean
npm run build       # must succeed (vite + esbuild server)
```

## If you think you should remove something

You probably shouldn't. Ask the operator first by leaving a PR comment
or a TODO. **Never delete a file just because grep says it has no
local references — server.ts and Vite's lazy-loaded routes resolve
imports dynamically.**
