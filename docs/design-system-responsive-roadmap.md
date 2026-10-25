# BotBound Responsive Design System Roadmap

## Objective

Make BotBound feel restrained, precise, and easy to operate across phones, tablets, laptops, and large desktops. The product must be responsive by composition, not by shrinking a desktop interface.

## Design Position

Retain the BotBound Design System: dark or light semantic surfaces, fine borders, editorial typography, violet actions, and restrained status colors. Evolve the existing tokens and component contracts. Do not introduce another theme, spacing namespace, or set of controls.

The canonical design doctrine is [the design system](../.superdesign/design-system.md), with its executable manifest in `src/lib/wireline-design-vision.ts`. This document owns responsive behavior and the evidence needed to assess it. Historical `wireline` identifiers remain compatibility names.

## Source Ownership

| Concern                                                       | Canonical owner                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Base semantic tokens                                          | `design-tokens/wireline.tokens.json`                                                                 |
| Generated CSS, TypeScript, extension and native token outputs | `scripts/build-design-tokens.mjs`; never edit generated outputs by hand                              |
| Web light appearance                                          | `src/styles/theme-light.css`                                                                         |
| CSS entry and cascade order                                   | `src/index.css`                                                                                      |
| Neutral page canvases                                         | `src/styles/botbound-master-polish.css`; homepage composition in `src/styles/landing-prestige.css`   |
| Supporting public page composition                            | `src/styles/public-design-system.css`                                                                |
| Shared controls                                               | `src/components/atoms/` and `src/components/molecules/`                                              |
| Workspace navigation and shell                                | `src/constants/navigation.ts`, `src/components/WorkspaceShell.tsx`, `src/styles/workspace-shell.css` |
| Public navigation                                             | `src/components/marketing/PrecisionPublicHeader.tsx`                                                 |
| Layout, focus and safe areas                                  | `src/styles/foundation.css`, `src/styles/system-hardening.css`, `src/styles/safe-area-ownership.css` |

Refine a component in its owner. Remove a competing override only after comparing the rendered states it serves. Do not append a new global correction layer to resolve an isolated component defect.

## Responsive Principles

1. **Controls need a containment contract.** Long labels and action rows must stay within their available width, especially in narrow workspace headers.
2. **Mobile density must fit the task.** Headings, cards, and public sections should leave the primary task visible without suppressing useful information.
3. **Titles use Title Case.** Author heroes, headings, card titles, dialog titles, and empty state titles consistently. Preserve authored casing in CSS; reserve uppercase for compact labels and deliberately cased actions.
4. **The public and authenticated surfaces need different density modes.** Marketing can use larger display hierarchy; workspaces should favor efficient scanning and visibility of the primary task.
5. **Mobile should be its own layout.** It needs intentional action collapse, compact navigation, and full width primary actions.

## Responsive Contract

### Breakpoints

| Viewport         | Mode          | Primary behavior                                                                                            |
| ---------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| 320 to 479px     | Compact phone | Single column, compact utility actions with accessible names, 44px touch targets                            |
| 480 to 767px     | Phone         | Single column, full width primary actions where useful; public navigation uses its menu                     |
| 768 to 1023px    | Tablet        | Public navigation shows its links; workspace keeps its dock and More sheet; columns only where content fits |
| 1024 to 1279px   | Laptop        | Persistent workspace rail with labels, optional collapse and a saved width; restrained page rails           |
| 1280px and wider | Desktop       | More working space within the same content rails; no additional navigation hierarchy                        |

### Spacing Tokens

Use the generated `--wireline-space-*` properties. The base rhythm is 4px with 8px groupings; the existing 2px, 6px and 10px steps support compact control details.

| Token suffix               | Value                  | Typical use                          |
| -------------------------- | ---------------------- | ------------------------------------ |
| `025`, `050`, `075`        | 2px, 4px, 6px          | Compact details and related controls |
| `100`, `125`, `150`        | 8px, 10px, 12px        | Control gaps and compact padding     |
| `200`, `300`               | 16px, 24px             | Card padding and content groups      |
| `400`, `500`, `600`, `800` | 32px, 40px, 48px, 64px | Section separation                   |

For example, use `var(--wireline-space-200)` for the existing 16px step. Reuse the current responsive section and content rail contracts rather than creating a second scale. Account for nested padding before reducing text or hiding content.

### Type Roles

- Display: marketing hero only, authored in Title Case.
- Page title: route hierarchy, authored in Title Case.
- Section, card, dialog, and empty state titles: short Title Case headings with proper names and acronyms preserved.
- Title styling: no CSS uppercase or automatic case conversion; preserve customer names exactly as authored.
- Body: natural case. The current input rule uses at least 16px below 768px; larger layouts may use the existing compact control type. Check focus zoom directly on touch tablets.
- Overline: compact uppercase label only.
- Button label: normal case by default; uppercase only for deliberate marketing calls to action.

## Component Rules

### Buttons and Action Groups

All button primitives must provide:

- `max-width: 100%`
- `min-width: 0`
- Contained labels through wrapping or an intentional compact label
- A full accessible name when the visible label is shortened
- A 44px effective touch target; preserve the existing 40px desktop floor and 48px primary action tier
- icon shrink prevention

For narrow mobile headers:

- Back controls may show an icon with a complete accessible name.
- Secondary labels hide before action groups wrap.
- Long primary actions use concise labels, wrapping, or a menu; no text may escape the control boundary. Do not rely on clipping alone to conceal an unusable action.

### Navigation

- Public pages expose Product, Pricing and account entry. Below 768px, the canonical menu button exposes the secondary links.
- Workspace: the desktop rail appears from 1024px, starts expanded, and preserves the customer's collapsed state and width. Collapsed items retain accessible names and labels on hover and keyboard focus.
- Below 1024px, the workspace uses its task dock and grouped More sheet. Keep one active destination for every route; do not add a duplicate drawer or navigation array.
- Knowledge and Computer are direct desktop rail destinations and grouped More links on compact screens. Do not repeat a Workspace/Knowledge section strip above the content. Reports and call files belong to Calls, with old Knowledge report URLs redirected without losing Bot scope.
- Dialogs, menus and sheets manage focus, close with Escape where appropriate, and return focus to their trigger. Switching layout must preserve the current Bot, route, pending drafts and selected tab.

### Cards

- Mobile cards: existing product radius, restrained elevation, 12 to 16px padding unless content requires more.
- Tablet: two columns only when cards remain readable at 320px minimum.
- Desktop: cards should add decision clarity, not become decoration.

### Forms

- Input type must be at least 16px on phone layouts to prevent iOS zoom; verify focus behavior on touch tablets as well.
- Inputs and selects must be at least 44px tall.
- Labels remain available; use visible labels for settings and forms. A composer with an intentional visually hidden label still needs a clear purpose and accessible name.
- Error copy uses text plus status, never color alone.
- Keep the attempted value after a rejected save. Show a useful retry action without claiming that an unsuccessful request was saved.

## Acceptance Criteria

### Layout

- No unintended horizontal scroll at 320px, 360px, 390px, 430px, 768px, 834px, 1024px, 1366px, and 1440px. Inspect nested containers, not just the document width. Deliberate tab strips and data tables must remain discoverable and keyboard reachable.
- No button, badge, tab, or back action can render text outside its bounds.
- No public page begins with more than one screen of decorative content before its primary action.
- Workspace headers aim for 56 to 72px at normal text size. They may grow when text is enlarged; never enforce that height by clipping labels or actions.
- Check 320px with 200% text as a distinct state, plus real browser zoom where available. Do not shrink the user's text to achieve containment.
- Test short windows and an open mobile keyboard. The composer, dialog actions and focused control must stay reachable above the navigation dock and safe area.

### Accessibility

- Touch controls have 44px effective hit areas without overlapping adjacent targets. Record actual hit regions for compact switches rather than judging only the visible thumb.
- Keyboard focus remains visible, follows a logical order and is not hidden behind fixed chrome. Test skip links, menus, dialogs, tabs, tables and error recovery.
- All controls use semantic buttons/links.
- Tabs expose selected state and keyboard navigation; the selected content remains identifiable. Button state must not rely only on color.
- Normal text reaches 4.5:1 contrast, large text 3:1, and required control indicators 3:1 in their actual rendered context. Check light and dark appearances, hover, selected, error and focus states. Decorative borders are not automatically control indicators.
- `prefers-reduced-motion` removes nonessential animation while preserving readable progress and status. Verify both CSS motion and JavaScript driven motion; keep the existing `MotionConfig reducedMotion="user"` contract.
- Check forced colors for selected states, switches, focus and dialogs. Do not claim full assistive technology coverage from automated scans.
- Critical pages pass the repository's automated accessibility gate. The design target remains WCAG 2.2 AA; an individual passing scan is not a conformance certificate.

### Device QA

Use these viewports for visual regression:

- 360×800
- 320×800, with normal and 200% text
- 390×844
- 430×932
- 768×1024
- 834×1194
- 1024×768
- 1366×768
- 1440×900

Capture both appearances for changed shared controls, plus keyboard focus and reduced motion for relevant interactions. Native apps and browser extensions need their own runtime evidence; generated token parity does not certify their visual or interaction behavior.

## Review Scorecard

Record one row for each exercised route or component state. Include commit, environment, date, viewport, appearance, data state and screenshot or interaction evidence.

| Dimension               | Passing evidence                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Hierarchy and copy      | The current task and primary action are clear; titles and supporting text follow the canonical brand rules without repeated explanations |
| Layout and type         | Long names, empty states and enlarged text remain readable; nested content and primary actions are contained                             |
| Controls and states     | Hover, focus, selected, disabled, busy, empty, error and retry states are truthful and usable where applicable                           |
| Navigation and keyboard | The active destination is clear; focus order, tab navigation, modal dismissal and focus return work                                      |
| Tokens and contrast     | Shared roles use the existing semantic values; text and required indicators meet the contrast target in both appearances                 |
| Motion and resilience   | Reduced motion preserves meaning; unavailable providers and rejected requests retain useful recovery without false success               |

Use **Pass**, **Needs Fix**, **Not Executed**, or **Blocked**, with the reason. A source inspection or historic screenshot cannot become a current visual pass. Do not average a blocking accessibility or task failure into a favorable overall score. Distinguish synthetic fixtures, authenticated inspection and a completed live provider action.

Release claims must name the states actually exercised. Preserve failed evidence and link a subsequent passing capture to the fix. Do not repeat an unchanged test merely to increase coverage counts.

## Execution Sequence

1. Inspect the current shared component and its existing cascade before changing a surface.
2. Capture the failing state, including nested containment, focus and actual text size.
3. Make the smallest change in the canonical owner. Preserve calling eligibility, setup controls and current product behavior during visual work.
4. Recheck the affected states at phone, tablet and desktop widths in both appearances.
5. Run the existing relevant checks. Add a test only for a meaningful behavior or regression that is not already covered.
6. Record current browser and available device evidence, remaining gaps and the exact release revision. Broader device or assistive technology coverage stays explicit until executed.
