# Excluded surfaces audit — 2026-07-06

This is the source-of-truth triage for the remaining `tsconfig.exclude` cluster after PR #681 restored the sales contact path and hardened the audit sink.

## What this pass changed

- Removed two stale exclude entries for files that no longer exist:
  - `src/components/FastStartWizard.tsx`
  - `src/components/FleetSetupNudge.tsx`
- Added `npm run tsconfig:excludes:check` and wired it into `verify:full` so deleted explicit exclude paths fail CI instead of lingering silently.

## Remaining excluded surfaces

### 1. Legacy Insights / Daily Brief cluster

Files:

- `src/routes/insights-routes.ts`
- `src/routes/daily-brief-routes.ts`
- `src/lib/daily-brief.ts`

Status: **do not mount as-is**.

Why:

- These routes are not registered by `src/server/register-api-routes.ts`.
- `src/routes/insights-routes.ts` and `src/lib/daily-brief.ts` still import the retired `claude-brain` / `claude-response-helpers` modules.
- `src/components/DailyBrief.tsx` still fetches `/api/insights/daily-brief`, but the component is not currently imported by the app surface discovered in this pass.
- `src/lib/openapi-spec.ts` still documents Daily Brief, funnel, and leaderboard as stable partner-facing Insight endpoints. That is stale until the backend is rebuilt or the docs are pruned.

Recommended decision: either rebuild Daily Brief / Insights on `src/lib/ai-brains.ts`, or delete the routes/component and remove the stale OpenAPI claims. Do not partially mount them.

### 2. Admin Vapi showcase sync

File:

- `src/routes/admin-vapi-sync-routes.ts`

Status: **potentially useful ops endpoint, but unmounted and excluded**.

Why:

- The route is owner/migration-token guarded and is designed to sync showcase Vapi assistants.
- It has one stale runtime import from the retired `claude-brain` barrel for `VAPI_OPENAI_FALLBACK_MODEL`; the constant now lives in `src/lib/ai-models.ts`.

Recommended decision: fix the import, add a narrow server typecheck or route smoke test, then mount only if the endpoint is still part of ops workflow. Otherwise delete it and rely on `scripts/sync-wireline-showcase.mts`.

### 3. Google Drive ingest

Files:

- `src/routes/drive-routes.ts`
- `src/services/google-drive-sync.ts`

Status: **product decision required**.

Why:

- The route is unmounted.
- The service is conceptually useful: it ingests recent Google Docs / text files into agent lessons/directives.
- It uses a direct Gemini SDK path and existing Google OAuth tokens, so it should be reviewed against the current managed-runtime and OAuth-scope policy before it is mounted.

Recommended decision: either rebuild it as a first-class Knowledge ingestion feature with tests and visible UI entry points, or delete it until the feature is intentionally scheduled.

### 4. Legacy Vapi v1 folder and helpers

Files:

- `src/routes/vapi/**`
- `src/lib/agent-tool-dispatch.ts`
- `src/lib/showcase-assistant.ts`
- `src/lib/vapi-assistant-factory.ts`

Status: **do not mount as-is**.

Why:

- Production currently registers `src/routes/vapi-v2.ts`.
- The legacy v1 route still imports retired runtime names and overlaps the live Vapi webhook path.
- Some v1 behavior appears richer than v2 around showcase/demo paths, queued webhook handling, presence, and detailed tool-call reliability capture. That does not make v1 safe to mount; it means any missing behavior should be ported deliberately into v2, covered, and then the v1 folder should be deleted.

Recommended decision: diff v1 against v2, port only proven live behavior into v2, then delete the legacy folder and helpers.

### 5. Showcase sync script

File:

- `scripts/sync-wireline-showcase.mts`

Status: **ops script; excluded separately**.

Recommended decision: keep only if it is the canonical showcase-sync path. If `admin-vapi-sync-routes.ts` is rebuilt and mounted, decide which one owns the workflow and delete the other.

## Next PR sequence

1. Resolve Daily Brief truthfulness: rebuild on `ai-brains` or remove UI/OpenAPI/docs claims.
2. Diff Vapi v1 versus v2; port missing live behavior into v2; delete v1.
3. Decide Drive ingest and Admin Vapi sync: mount with tests or delete.
4. Collapse `tsconfig.exclude` to tests/generated patterns only.

Rule going forward: every explicit exclude path needs an owner, a reason, and a deletion/rebuild target. Deleted explicit paths now fail `verify:full` via `npm run tsconfig:excludes:check`.
