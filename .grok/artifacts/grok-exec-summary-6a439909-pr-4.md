# PR 4 Execution Summary: Workspace Panel Extraction & Real Config Wiring

**Plan ID:** `6a439909`  
**Branch scope:** Extract `StudioAgentWorkspacePanel`, slim orchestrator, real API wiring  
**Status:** Complete

## What changed

### `src/components/StudioAgentWorkspacePanel.tsx` (new)

- Extracted workspace depth from `StudioWorkspaceV2.tsx`:
  - Onboard & Customize (voice gallery, personality, greeting, knowledge)
  - World Connections (integrations + tool catalogs)
  - Brain / Record / Controls sections
- Moved all related state and handlers into the panel:
  - Voice gallery fetch, preview, search, selection
  - `applyVoice` → `PATCH /api/agent-config/:id/voice` with per-voice loading + error states
  - `applySetup` → real `authFetch` chain:
    - Voice PATCH (if selected)
    - `POST /api/agent-config/:id/manual` for personality + greeting directive
    - `POST /api/train/extract` for seed knowledge
  - Setup loading/error/success notice (removed `alert()` demo)
- Voice test bridge uses `onTestVoiceInChat` callback prop (no `document.querySelector`)

### `src/components/StudioWorkspaceV2.tsx` (slim orchestrator)

- Retains loading, empty, no-agent, and workroom orchestration only
- Conditionally renders `StudioAgentWorkspacePanel` when `view=workspace`
- Holds `workroomRef` and wires `onTestVoiceInChat` → `focusComposer("Introduce yourself using your new voice.")`
- Removed inline workspace UI, voice/setup state, and demo hacks

### `src/components/StudioWorkroom.tsx`

- Converted to `forwardRef` with exported `StudioWorkroomHandle`
- Added `focusComposer(text?)` via `useImperativeHandle` for parent-driven composer focus

### `tests/authenticated-agent-flow-contract.test.ts`

- Asserts `StudioAgentWorkspacePanel` extraction and API wiring
- Asserts orchestrator imports panel; no `document.querySelector` / `alert(` in studio files
- Asserts workroom `focusComposer` handle

### `scripts/check-wireline-clear-system.mjs`

- Updated studio workspace assertions to check orchestrator + extracted panel split

## Verification

```bash
node ./node_modules/vitest/vitest.mjs run tests/authenticated-agent-flow-contract.test.ts  # 3/3 passed
node scripts/check-wireline-clear-system.mjs                                              # passed
node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit                   # clean
```

## Behavior notes

- Chat-first canvas unchanged; workspace depth still behind `?view=workspace`
- Apply Setup persists voice, personality, greeting directive, and knowledge via existing API routes
- "Test this voice in the chat above" focuses the workroom composer with a prefilled prompt (no DOM query hack)

## Files touched

| File | Action |
|------|--------|
| `src/components/StudioAgentWorkspacePanel.tsx` | Created |
| `src/components/StudioWorkspaceV2.tsx` | Slimmed |
| `src/components/StudioWorkroom.tsx` | Updated (ref handle) |
| `tests/authenticated-agent-flow-contract.test.ts` | Updated |
| `scripts/check-wireline-clear-system.mjs` | Updated |

## Commit

```
refactor(studio): extract StudioAgentWorkspacePanel with real config wiring
```