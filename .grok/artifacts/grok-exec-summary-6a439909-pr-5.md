# PR 5 Execution Summary: Native shell agent switcher, legacy URL cleanup & visual QA

**Plan ID:** `6a439909`  
**Branch scope:** Native agent switcher + `mode=workroom` deprecation  
**Status:** Complete

## What changed

### Updated: `src/components/WorkspaceShell.tsx`

- Extracted shared `BottomStudioAgentBar` from mobile/native switcher markup
- Added **`NativeStudioAgentBar`** — horizontal agent pills fixed above `NativeDock` on studio routes when `nativeAppShell` is true
- Mirrors `MobileStudioAgentBar` tablist semantics, roving tabindex, and 44px touch targets
- Increased native studio main padding to `pb-[calc(8.75rem+env(safe-area-inset-bottom))]` to clear both agent bar + dock

### Updated: `src/components/StudioWorkspaceV2.tsx`

- `useEffect` strips legacy `mode=workroom` from URL via `replace` (`next.delete("mode")`)

### Legacy link cleanup (no `mode=workroom`)

- `src/pages/OverviewPage.tsx` — quick brief + fleet workroom links → `/studio?agent=<id>`
- `src/components/StudioOverview.tsx` — ledger flywheel link
- `src/components/StudioAgentWorkspacePanel.tsx` — deep-dive + full chat links

### Updated: `scripts/capture-prod-visual-qa.mjs`

- Documented multi-agent `/studio` capture scenarios
- Added `studioMultiAgentCaptureRoutes()` stub; optional deep links when `WIRELINE_VISUAL_STUDIO_AGENT` is set
- Manifest includes `studioDeepLinkRoutes`

### Updated: `tests/authenticated-agent-flow-contract.test.ts`

- Asserts `NativeStudioAgentBar` on native studio routes
- Asserts legacy `mode` strip effect in `StudioWorkspaceV2`
- Asserts no `mode=workroom` in studio link sources

### Updated: `scripts/check-wireline-clear-system.mjs`

- Enforces `NativeStudioAgentBar` on native studio routes
- Enforces `next.delete("mode")` in `StudioWorkspaceV2`
- `mustExclude` `mode=workroom` from Overview, StudioOverview, and workspace panel links

## Verification

```bash
npx vitest run tests/authenticated-agent-flow-contract.test.ts  # 3/3 passed
node scripts/check-wireline-clear-system.mjs                     # passed
npx tsc --noEmit                                                 # clean
```

## Behavior notes

- Native app users on `/studio` now get the same horizontal agent switcher as mobile browser users, stacked above Studio/Settings dock
- Bookmarked `/studio?agent=X&mode=workroom` URLs normalize to `/studio?agent=X` without reload
- Chat-first canvas unchanged; `view=workspace` remains the workspace depth param

## Files touched

| File | Action |
|------|--------|
| `src/components/WorkspaceShell.tsx` | Updated |
| `src/components/StudioWorkspaceV2.tsx` | Updated |
| `src/pages/OverviewPage.tsx` | Updated |
| `src/components/StudioOverview.tsx` | Updated |
| `src/components/StudioAgentWorkspacePanel.tsx` | Updated |
| `scripts/capture-prod-visual-qa.mjs` | Updated |
| `tests/authenticated-agent-flow-contract.test.ts` | Updated |
| `scripts/check-wireline-clear-system.mjs` | Updated |

## Commit

```
feat(studio): native agent switcher and legacy workroom URL cleanup
```