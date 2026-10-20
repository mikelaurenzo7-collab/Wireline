# BotBound Navigation System

## Current design decision

`src/constants/navigation.ts` owns route names, parent destinations, rail and dock placement, and keyboard shortcuts. `WorkspaceShell` renders that registry. Preserve stable routes and compatibility redirects when changing visible labels.

Desktop uses a compact icon rail by default, with labels on hover and keyboard focus and an explicit expand control. Mobile uses a dock with Bot, Inbox, Calls, Insights, and More. More opens a sheet containing Calendar, Connections, and Settings. It is not a second sidebar.

Workspace is home for the selected Bot. Its sections are Set Up, Knowledge, and Computer. Explicit Computer navigation gives the task the available workspace; the setup conversation stays mounted behind the focused desktop panel. The owner can restore the side panel. Narrow screens use the Computer page. Navigation between these sections and through the command palette preserves the selected Bot.

The public story remains voice Bots with a computer, phone number, and email address. Navigation does not promote SMS or outbound campaigns. Existing saved history and allowed reviewed calling retain their current access rules.

## Component roles

| Need                            | Canonical primitive                           | BotBound presentation                          |
| ------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| Mobile marketing navigation     | `Dialog`                                      | `navigation`                                   |
| Mobile page and toolbar actions | `Dialog`                                      | `drawer`                                       |
| Mobile workspace navigation     | `WorkspaceShell` and `MobileNavMoreSheet`     | Persistent dock and More sheet                 |
| Destructive confirmation        | `AlertDialog`                                 | Explicit confirmation                          |
| Compact application commands    | `DropdownMenu`                                | menu                                           |
| Persistent workspace routing    | `WorkspaceShell`                              | Desktop rail with active route and Bot context |
| Workspace sections              | `WorkspaceSectionNav` and `WorkspaceTabStrip` | Links with current destination state           |
| Command search                  | `CommandBar`                                  | Searchable destinations and creation action    |

## Destination ownership

| Destination | Owns                                                                                   |
| ----------- | -------------------------------------------------------------------------------------- |
| Workspace   | Bot selection, creation, instructions, rehearsal, setup details, and summary           |
| Knowledge   | Saved sources, facts, rules, and reports for the selected Bot                          |
| Computer    | The current task, browser viewport, owner control, task activity, results, and history |
| Inbox       | Email conversations and Approvals; preserved SMS history follows existing access rules |
| Calls       | Call history, permitted reviewed calls, and Lines                                      |
| Calendar    | Appointments and availability                                                          |
| Insights    | Performance, reliability, quality, and revenue views                                   |
| Connections | Mailbox connections and optional connected tools                                       |
| Settings    | Account, billing, team, appearance, apps, and compliance                               |

## Interaction requirements

- Portal render every blocking surface above route layout and sticky chrome.
- Use the existing Radix primitives for new blocking surfaces. The existing command palette uses the shared `useModalFocusTrap` and `useBodyScrollLock` lifecycle.
- Use `dvh` and safe area insets for mobile geometry.
- Preserve desktop actions in place; progressively disclose them on narrow viewports.
- Every mobile overlay requires a visible close action, an accessible name, focus containment, and focus restoration.
- Route links use `aria-current`. True in place tab panels use tab roles and arrow, Home, and End keyboard handling. Do not add tab roles to ordinary destination links.
- Compact rail controls keep accessible names. Tooltips supplement those names and work on both hover and focus.
- An active Bot filter must never silently turn into an unfiltered request while loading or after a failure.
- Full width and side panel changes must preserve drafts and active task identity. Back and forward navigation must keep the visible section and selected Bot consistent.

## Implemented Foundation

1. Public header recovery uses the `navigation` presentation.
2. `ClientToolbar` uses the `drawer` presentation. `WorkspacePageIntro` owns page intros.
3. `WorkspaceShell` derives desktop and mobile destinations from the canonical registry.
4. `CommandBar` supports command search, arrow selection, Enter, Escape, and the registered `g` shortcuts. Its search is a destination catalog, not conversation or task history search.
5. Workspace panels expose keyboard resize controls, explicit collapse state, and a full width control.

## Verification and Future Work

1. Inspect the current build at phone, tablet, short laptop, and desktop sizes in both appearances. Include 200% text, long Bot names, and keyboard navigation.
2. Check palette selection, Bot preservation, focused Computer entry, side panel restoration, and narrow screen transitions using the existing relevant checks. Do not rerun unrelated successful suites without a reason.
3. Verify More sheet focus return, selected route visibility, reduced motion, and safe area clearance. Source contracts alone do not certify rendered behavior or accessibility conformance.
4. Keep any future history search or universal context drawer separate from the implemented catalog and task drawers until there is a supported data and permission contract. Do not add placeholder navigation for unavailable features.
