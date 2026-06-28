# Wireline Studio Canvas UX Overhaul — Summary

**Design doc:** `.grok/artifacts/grok-design-doc-21c18e8e.md`

## TL;DR

The Studio canvas overhaul is **~70% implemented** in the working tree. `/studio` is already chat-first with horizontal agent switcher bars, a minimal 56px rail, and deep workspace behind `?view=workspace`. **Five incremental PRs** remain for MRU selection, a11y/scale, composer design-system alignment, workspace panel extraction, and native shell + legacy cleanup.

## Paths written

| File |
|------|
| `C:\Users\MichaelLaurenzo\Downloads\Wireline\.grok\artifacts\grok-design-doc-21c18e8e.md` |
| `C:\Users\MichaelLaurenzo\Downloads\Wireline\.grok\artifacts\grok-design-summary-21c18e8e.md` |

## PR count

**5 PRs** (remaining polish — not greenfield):

1. MRU agent selection & switcher scroll
2. A11y, 44px targets, 20+ scale
3. Composer `wl-composer-dock` + empty-state wiring
4. Workspace panel extraction + real API wiring
5. Native shell switcher + `mode=workroom` cleanup + visual QA

## What's already done

- ✅ Agent card grid removed (`StudioWorkspaceV2.tsx`)
- ✅ Auto-select first agent so composer always shows
- ✅ `StudioAgentBar` (desktop top) + `MobileStudioAgentBar` (mobile bottom)
- ✅ Minimal `DesktopRail`: logo + settings only (`WorkspaceShell.tsx`)
- ✅ `StudioWorkroom` with `canvas` / `split` / `standalone` layouts
- ✅ `?view=workspace` toggle for onboarding, World Connections, Brain
- ✅ Contracts in `authenticated-agent-flow-contract.test.ts` + `check-wireline-clear-system.mjs`

## Key gaps

| Gap | Severity |
|-----|----------|
| MRU defaults to `agents[0]` — no `localStorage` | High |
| Pills are 32px, not 44px; no keyboard Arrow nav | High |
| Native shell: no agent switcher (`NativeDock` only) | Medium |
| Legacy `mode=workroom` links still in Overview/StudioOverview | Medium |
| Workspace panel ~500 LOC inline; `applySetup` uses `alert()` | Medium |
| `StudioWorkroom` doesn't use `wl-composer-dock` | Low |
| No search/filter for 15+ agents | Low (post-ship) |

## Blockers

- **No hard blockers** — merged architecture is sound and contracts pass.
- **Soft:** Native agent switcher UX needs a default (mirror mobile bottom bar).
- **Verify:** CI green after `6662c28d` voice import fix before PR 4 API work.