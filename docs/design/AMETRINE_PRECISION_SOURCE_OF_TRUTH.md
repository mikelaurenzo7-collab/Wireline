# Ametrine Precision — Wireline Design Authority

## Status
This is the canonical design system for Wireline web, iOS, Android, widgets, and CarPlay companion surfaces.

The visual reference is the uploaded Google Stitch project:
`stitch_wireline_ai_communications_operating_system`.

Do not introduce a competing “Professional Heritage”, “Signal Blue”, forest/cream, mesh, glass-heavy, or generic dashboard system into active product surfaces.

## Product character
Wireline is a premium AI communications workspace for building, training, running, and reviewing voice, SMS, and email assistants.

The visual language is precise, light, high-density, and technically calm:
- structured workspace chrome rather than decorative product art;
- violet reserved for actions, selection, and active intelligence;
- thin dividers and low-contrast elevation;
- 4px base grid with intentional 8px and 12px component geometry;
- dense operational information that remains immediately scannable.

## Canonical web tokens
| Token | Value |
| --- | --- |
| Root surface | `#F8F9FF` |
| Surface low | `#EFF4FF` |
| Surface container | `#E5EEFF` |
| Surface high | `#DCE9FF` |
| Root text | `#0B1C30` |
| Text variant | `#484554` |
| Divider | `#C9C4D7` |
| Primary action | `#5D3FD3` |
| Primary pressed | `#4B32B3` |
| Primary dark | `#451EBB` |
| Success | `#2E7D32` |
| Warning | `#ED6C02` |
| Error | `#BA1A1A` |

## Typography
- **Display / high hierarchy:** Hanken Grotesk
- **Body / dense content:** Inter
- **Metadata / labels:** JetBrains Mono

Use title hierarchy sparingly. Body text must remain high-contrast and readable at operational density. Metadata is compact, uppercase only when it materially improves scanning.

## Geometry and interaction
- Base spacing: `4px`
- Compact control spacing: `8px`
- Card padding: `12px`
- Desktop outer rhythm: `24–48px`, based on surface
- Standard component radius: `4px`
- Larger container radius: `8px`
- Modals / major surfaces: `12px`
- Press feedback: `scale(0.98)`
- Focus indicator: `2px` Ametrine purple outline

Pills are reserved for status, short readiness labels, and compact filters—not general UI decoration.

## Desktop workspace composition
- Fixed **256px** workspace sidebar
- **64px** top app bar
- Full-width desktop shell; do not cap the primary application chrome at a narrow centered frame
- Workspace identity and New Agent action live in the left rail
- Global Wireline identity, notifications, help, workspace switcher, and profile utilities live in the top bar
- Page content uses a compact section header below the app bar

Primary navigation order:
1. Overview
2. Assistants
3. Agent Studio
4. Knowledge
5. Connections
6. Inbox
7. Settings

## Screen-specific non-negotiables
- **Overview:** priority handoffs, operational outcomes, and active assistant state are visible without a maze of navigation.
- **Agent Studio:** a focused three-pane configuration and Test & Simulation workflow. The assistant’s identity, context, channels, knowledge, actions, and safety controls remain progressive rather than sprawling.
- **Knowledge:** includes current source awareness and freshness status; do not reduce this to a static notes page.
- **Connections:** shows connected systems and clearly scoped actions.
- **Settings / business profile:** dense but calm editable cards, operational context, escalation ownership, and visible save state.
- **Auth:** split, confidence-building entry surface. It must feel like a real workspace access point, not a generic modal.

## Implementation boundaries
1. `src/styles/foundation.css` owns global Ametrine tokens.
2. `src/index.css` owns typography imports and universal accessibility behavior.
3. `src/styles/design-system.css` owns reusable component contracts.
4. `src/styles/stitch-patterns.css` owns Stitch-derived reusable visual patterns.
5. Product components must consume semantic tokens instead of introducing hard-coded alternate palettes.
6. Shared workspace chrome belongs in `src/components/WorkspaceShell.tsx`.

## Verification
Run `npm run check:active-surface` after changes to shared shells, tokens, navigation, or mobile themes. Visual work must be reviewed at desktop width before merge, with special attention to:
- 256px sidebar alignment;
- 64px top-bar rhythm;
- 4px control geometry;
- real token use;
- no accidental Signal Blue, forest/cream, mesh, or glass regressions.
