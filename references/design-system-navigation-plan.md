# Wireline navigation system plan

## Current design decision

Wireline uses one headless modal foundation for any mobile surface that blocks interaction with the route beneath it. A public site navigation is a full-height disclosure surface. Workspace page actions use a bottom drawer. A true action menu remains a menu only when it contains a compact list of commands rather than a full mobile destination surface.

## Component roles

| Need | Canonical primitive | Wireline presentation |
| --- | --- | --- |
| Mobile marketing navigation | `Dialog` | `navigation` |
| Mobile workspace actions | `Dialog` | `drawer` |
| Destructive confirmation | `AlertDialog` when introduced | confirmation |
| Compact application commands | `DropdownMenu` | menu |
| Persistent workspace routing | `Sidebar` pattern when the next app-shell consolidation begins | desktop rail + mobile off-canvas |

## Interaction requirements

- Portal render every blocking surface above route layout and sticky chrome.
- Delegate Escape, focus trapping, focus restoration, and body scroll locking to Radix.
- Use `dvh`/safe-area-aware mobile geometry.
- Preserve desktop actions in place; progressively disclose them on narrow viewports.
- Every mobile overlay requires a visible close action, a screen-reader label, and a regression contract.

## Delivery order

1. Public header recovery (completed).
2. ClientToolbar drawer migration (this change).
3. Consolidate authenticated sidebar/mobile navigation into one provider-backed organism.
4. Add visual regression coverage for 375px, 390px, 768px, 1024px, and 1440px.
5. Adopt shared navigation telemetry for open/close, route selection, and action outcomes without collecting sensitive content.
