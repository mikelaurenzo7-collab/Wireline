# Excluded surfaces audit - 2026-07-06

This is the source-of-truth triage for the `tsconfig.exclude` cluster after the July 2026 hardening passes.

## What this pass changed

- Removed explicit excludes for deleted or resolved files:
  - `src/components/FastStartWizard.tsx`
  - `src/components/FleetSetupNudge.tsx`
  - `src/routes/admin-vapi-sync-routes.ts`
  - `src/lib/vapi-assistant-factory.ts`
  - `scripts/sync-wireline-showcase.mts`
- Kept `npm run tsconfig:excludes:check` in `verify:full` so deleted explicit exclude paths fail CI instead of lingering silently.
- Chose `scripts/sync-wireline-showcase.mts` as the canonical Vapi showcase sync path and pointed it at `src/lib/ai-models.ts`.

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

Files:

- ~~`src/routes/admin-vapi-sync-routes.ts`~~ (deleted)
- `scripts/sync-wireline-showcase.mts` (canonical ops path)

Status: **resolved**. The unmounted admin route was removed. Showcase syncing now has one owner: the ops script.

### 3. Google Drive ingest

Files:

- ~~`src/routes/drive-routes.ts`~~ (deleted)
- ~~`src/services/google-drive-sync.ts`~~ (deleted)
- `src/services/google-drive-sync-v2.ts` (used by workspace knowledge routes)

Status: **deferred product feature** — legacy v1 ingest removed; v2 service retained for future first-class Knowledge UI. **Decision (2026-07-07):** keep `google-drive-sync-v2.ts` as plumbing; ship Drive in Knowledge UI in Horizon 1, not Horizon 0.

### 4. Legacy Vapi v1 folder and helpers

Files:

- `src/routes/vapi/index.ts` - **deleted** (July 2026); behavior ported to `src/routes/vapi-v2.ts`
- `src/routes/vapi/tool-handlers-*.ts`, `showcase-handlers.ts` - **active** (used by vapi-v2)
- `src/lib/agent-tool-dispatch.ts`, `src/lib/showcase-assistant.ts` - **active** (removed from tsconfig exclude)
- ~~`src/lib/vapi-assistant-factory.ts`~~ (deleted; superseded by `vapi-assistant-factory-v2.ts`)

Status: **v2 is production-complete** for billing, tools, showcase, presence, and async end-of-call.

## Next PR sequence

1. Decide Drive ingest: keep v2 as future Knowledge UI plumbing or remove if roadmap changes.
2. Keep `tsconfig.exclude` limited to tests/generated patterns only.

Rule going forward: every explicit exclude path needs an owner, a reason, and a deletion/rebuild target. Deleted explicit paths now fail `verify:full` via `npm run tsconfig:excludes:check`.
