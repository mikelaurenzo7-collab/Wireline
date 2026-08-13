# Wireline navigation system plan

## Current design decision

Wireline uses one headless modal foundation for any mobile surface that blocks interaction with the route beneath it. A public site navigation is a full-height disclosure surface. Workspace page actions use a bottom drawer. Workspace navigation uses an off-canvas sidebar. A true action menu remains a menu only when it contains a compact list of commands rather than a full mobile destination surface.

## Component roles

| Need | Canonical primitive | Wireline presentation |
| --- | --- | --- |
| Mobile marketing navigation | `Dialog` | `navigation` |
| Mobile page and toolbar actions | `Dialog` | `drawer` |
| Mobile workspace navigation | `Dialog` | `sidebar` |
| Destructive confirmation | `AlertDialog` when introduced | confirmation |
| Compact application commands | `DropdownMenu` | menu |
| Persistent workspace routing | `WorkspaceShell` navigation content | desktop rail + mobile off-canvas |

## Interaction requirements

- Portal render every blocking surface above route layout and sticky chrome.
- Delegate Escape, focus trapping, focus restoration, and body scroll locking to Radix.
- Use `dvh`/safe-area-aware mobile geometry.
- Preserve desktop actions in place; progressively disclose them on narrow viewports.
- Every mobile overlay requires a visible close action, a screen-reader label, and a regression contract.
- New blocking surfaces select a named Dialog presentation rather than recreating overlay, focus, or scroll behavior locally.

## Completed in this foundation

1. Public header recovery uses the `navigation` presentation.
2. ClientToolbar uses the `drawer` presentation (AppPageIntro was retired 2026-08-13; WorkspacePageIntro owns page intros).
3. WorkspaceShell uses one shared navigation-content composition for the desktop rail and mobile `sidebar` presentation.
4. The design-system contract and dedicated mobile-overlay test prevent the active surfaces from reverting to manual overlays.

## Next delivery phases

1. Add interaction-level visual regression coverage at 375px, 390px, 768px, 1024px, and 1440px.
2. Audit workflow-specific dialogs, confirmations, and command surfaces for the same portal/focus contract.
3. Consider a provider-backed multi-sidebar abstraction only when multiple live workspace rails require shared collapse state; do not introduce it preemptively.
4. Add shared navigation telemetry for open/close, route selection, and action outcomes without collecting sensitive content.
