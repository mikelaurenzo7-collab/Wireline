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

Status: **mounted** (July 2026 forward pass).

Notes:

- Routes register in `src/server/register-api-routes.ts`.
- Daily brief uses `src/lib/insights-ai.ts` (not retired `claude-brain`).
- Removed from `tsconfig.json` exclude list.

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

- ~~`src/routes/drive-routes.ts`~~ (deleted)
- ~~`src/services/google-drive-sync.ts`~~ (deleted)
- `src/services/google-drive-sync-v2.ts` (used by workspace knowledge routes)

Status: **deferred product feature** — legacy v1 ingest removed; v2 service retained for future first-class Knowledge UI.

### 4. Legacy Vapi v1 folder and helpers

Files:

- `src/routes/vapi/index.ts` — **deleted** (July 2026); behavior ported to `src/routes/vapi-v2.ts`
- `src/routes/vapi/tool-handlers-*.ts`, `showcase-handlers.ts` — **active** (used by vapi-v2)
- `src/lib/agent-tool-dispatch.ts`, `src/lib/showcase-assistant.ts` — **active** (removed from tsconfig exclude)
- `src/lib/vapi-assistant-factory.ts` — **excluded** (superseded by `vapi-assistant-factory-v2.ts`)

Status: **v2 is production-complete** for billing, tools, showcase, presence, and async end-of-call.

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
