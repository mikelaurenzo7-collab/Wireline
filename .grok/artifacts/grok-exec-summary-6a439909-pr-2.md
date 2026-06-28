# PR 2 Execution Summary: Accessibility, 44px targets, scroll-into-view

**Plan ID:** `6a439909`  
**Branch scope:** Agent switcher accessibility in `WorkspaceShell.tsx`  
**Status:** Complete

## What changed

### New: `src/hooks/useRovingTabIndex.ts`

- Generic roving-tabindex hook for horizontal tablists
- Active item receives `tabIndex={0}`; siblings get `-1`
- `ArrowLeft` / `ArrowRight`, `Home`, and `End` activate the next/previous/first/last item and move focus
- Exposes `listRef`, `getTabIndex`, `handleKeyDown`, and `focusItem`

### Updated: `src/components/WorkspaceShell.tsx`

- **`AgentSwitcherPill`**: `role="tab"`, `aria-selected`, `data-roving-tab`, `min-h-[44px] min-w-[44px]`, focus-visible ring
- **`StudioAgentBar`**: `role="tablist"` on agent scroll container; keyboard nav via `useRovingTabIndex`; `scrollIntoView({ inline: "center" })` on active pill
- **`MobileStudioAgentBar`**: same tablist semantics, keyboard nav, and scroll-into-view
- **`+` button** (desktop + mobile): `min-h-[44px] min-w-[44px]` with focus-visible ring
- **Settings** links (desktop bar + mobile header): `min-h-[44px] min-w-[44px]`
- Shared `useAgentSwitcherA11y` helper wires navigate-on-arrow, roving tabindex, and scroll centering

### Updated: `tests/authenticated-agent-flow-contract.test.ts`

- Asserts `role="tablist"`, `useRovingTabIndex`, `min-h-[44px]` on `AgentSwitcherPill`, and `scrollIntoView`

### Updated: `scripts/check-wireline-clear-system.mjs`

- Enforces tablist semantics, 44px pill targets, roving tabindex hook usage, scroll-into-view, and `minTouchTargetPx: 44` in design vision

### Design vision

- `studioCanvas.minTouchTargetPx: 44` already present in `src/lib/wireline-design-vision.ts`; check script now enforces it

## Verification

```bash
npx vitest run tests/authenticated-agent-flow-contract.test.ts  # 3/3 passed
node scripts/check-wireline-clear-system.mjs                     # passed
npx tsc --noEmit                                                 # clean
```

## Behavior notes

- Keyboard navigation navigates to `/studio?agent=<id>` and focuses the target pill
- `Enter` on a focused tab still works via native `<Link>` behavior
- Active pill scrolls to horizontal center on both desktop `StudioAgentBar` and mobile `MobileStudioAgentBar`
- `+` create button sits outside the tablist (not a tab)
- Native app shell unchanged (agent strip deferred to PR 5 per design doc)

## Files touched

| File | Action |
|------|--------|
| `src/hooks/useRovingTabIndex.ts` | Created |
| `src/components/WorkspaceShell.tsx` | Updated |
| `tests/authenticated-agent-flow-contract.test.ts` | Updated |
| `scripts/check-wireline-clear-system.mjs` | Updated |

## Commit

```
feat(studio): 44px agent switcher with keyboard nav and scroll-into-view
```