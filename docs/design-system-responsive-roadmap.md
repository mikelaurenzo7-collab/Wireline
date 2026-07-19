# Wireline Responsive Design System Roadmap

## Objective

Make Wireline feel restrained, precise, and easy to operate across phones, tablets, laptops, and large desktops. The product must be responsive by composition, not by shrinking a desktop interface.

## Design Position

Retain the existing Wireline Letterpress foundation: quiet obsidian/near-white surfaces, fine borders, editorial typography, electric-violet action (Aurora palette), and restrained semantic status colors. Evolve the system through responsive tokens and component contracts rather than a visual rebrand or imported mockup palette.

## Immediate Findings

1. **Controls need a containment contract.** Long labels and flex-row actions can exceed their available width, especially in narrow workspace headers.
2. **Mobile density is too large.** Several headings, cards, and public-page sections consume more vertical space than the information warrants.
3. **Uppercase needs governance.** It is effective for labels and actions but reduces readability and increases overflow risk when applied to long text.
4. **The public and authenticated surfaces need different density modes.** Marketing can use larger display hierarchy; workspaces should favor efficient scanning and primary-task visibility.
5. **Mobile should be its own layout.** It needs intentional action collapse, compact navigation, and full-width primary actions.

## Responsive Contract

### Breakpoints

| Viewport | Mode | Primary behavior |
| --- | --- | --- |
| 320–479px | Compact phone | Single column, icon-first utility actions, 44px targets |
| 480–767px | Phone | Single column, full-width primary calls to action |
| 768–1023px | Tablet | Two-column content where useful; desktop navigation remains collapsed until space is stable |
| 1024–1279px | Laptop | Persistent workspace navigation, restrained page rails |
| 1280px+ | Desktop | Spacious rails, multi-column information layouts |

### Spacing tokens

Use a 4px base with an 8px rhythm:

```css
--wl-space-1: 0.25rem;
--wl-space-2: 0.5rem;
--wl-space-3: 0.75rem;
--wl-space-4: 1rem;
--wl-space-5: 1.5rem;
--wl-space-6: 2rem;
--wl-space-7: 3rem;
--wl-space-8: 4rem;
```

### Type roles

- Display: marketing hero only.
- Page title: route-level hierarchy.
- Section title: short editorial statement.
- Body: natural case, 16px minimum in editable/input contexts.
- Overline: compact uppercase label only.
- Button label: normal case by default; uppercase only for deliberate marketing calls to action.

## Component Rules

### Buttons and action groups

All button primitives must provide:

- `max-width: 100%`
- `min-width: 0`
- `overflow: hidden`
- `text-overflow: ellipsis`
- a 44px effective pointer target
- icon shrink prevention

For narrow mobile headers:

- Back controls show icon-only.
- Secondary labels hide before action groups wrap.
- Long primary actions use compact labels or a menu; no text may escape the control boundary.

### Navigation

- Desktop: visible primary links.
- Mobile: a real button toggles a focus-managed sheet with a single primary conversion action.
- Workspace: side navigation from laptop widths upward; drawer below that width.

### Cards

- Mobile cards: smaller radius, no decorative shadow, 12–16px padding unless content requires more.
- Tablet: two columns only when cards remain readable at 320px minimum.
- Desktop: cards should add decision clarity, not become decoration.

### Forms

- Input type must be at least 16px to prevent iOS zoom.
- Inputs and selects must be at least 44px tall.
- Labels remain visible; placeholders are supplementary.
- Error copy uses text plus status, never color alone.

## Acceptance Criteria

### Layout

- No horizontal scroll at 320px, 360px, 390px, 430px, 768px, 834px, 1024px, 1366px, and 1440px.
- No button, badge, tab, or back action can render text outside its bounds.
- No public page begins with more than one screen of non-interactive visual density before its primary action.
- Workspace headers remain within 56px–72px depending on viewport.

### Accessibility

- Interactive targets have 44px effective hit areas.
- Keyboard focus remains visible.
- All controls use semantic buttons/links.
- No input uses a font size under 16px.
- `prefers-reduced-motion` removes non-essential motion.
- Critical pages pass automated WCAG AA checks.

### Device QA

Use these viewports for visual regression:

- 360×800
- 390×844
- 430×932
- 768×1024
- 834×1194
- 1024×768
- 1366×768
- 1440×900

## Execution Sequence

1. Enforce global button containment and compact back-action behavior.
2. Normalize mobile and tablet layout density.
3. Audit route headers, action groups, and long labels.
4. Refactor remaining direct back actions into a shared pattern.
5. Add Playwright checks for overflow, touch targets, and key viewports.
6. Run live device QA from actual iPhone/iPad and laptop screenshots before further aesthetic changes.
