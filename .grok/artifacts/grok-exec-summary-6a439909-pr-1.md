# PR 1 Execution Summary: MRU Agent Selection

**Plan ID:** `6a439909`  
**Branch scope:** MRU-only (`studio-agent-preference.ts`, `StudioWorkspaceV2.tsx`)  
**Status:** Complete

## What changed

### New: `src/lib/studio-agent-preference.ts`

- `KEY = "wireline:studio:last-agent-id"`
- `readStudioLastAgentId()` — reads MRU from `localStorage` (SSR-safe via `studioStorage()` helper)
- `writeStudioLastAgentId(id)` — persists MRU on agent activation
- `resolveStudioActiveAgentId(requestedId, agentIds)` — resolution order:
  1. `requestedId` if present in roster
  2. MRU if still in roster
  3. First roster id, or `null` when empty

### Updated: `src/components/StudioWorkspaceV2.tsx`

- Replaced `agents[0]` default with `resolveStudioActiveAgentId`
- URL `replace` effect now runs when `?agent` is missing **or** invalid (stale/deleted id)
- Added `useEffect` on `active.id` to write MRU whenever the active agent changes
- **Did not modify** `WorkspaceShell.tsx` (deferred to PR 2)

### New: `tests/studio-agent-preference.test.ts`

Six vitest unit tests covering:

- Read/write round-trip
- Valid requested id precedence over MRU
- Invalid requested id → MRU fallback
- Invalid MRU → first roster id fallback
- Both invalid → first roster id
- Empty roster → `null`

## Verification

```bash
npx vitest run tests/studio-agent-preference.test.ts  # 6/6 passed
npx tsc --noEmit                                     # clean
```

## Behavior notes

- MRU is client-only (`localStorage`); no server API changes
- Stale MRU ids are ignored and fall back to roster order (first agent)
- Invalid `?agent=` URLs are corrected via `replace` navigation to the resolved id
- Logout MRU purge is out of scope (optional hardening per design doc OQ2)

## Files touched

| File | Action |
|------|--------|
| `src/lib/studio-agent-preference.ts` | Created |
| `src/components/StudioWorkspaceV2.tsx` | Updated |
| `tests/studio-agent-preference.test.ts` | Created |

## Commit

```
feat(studio): MRU agent selection for canvas default
```