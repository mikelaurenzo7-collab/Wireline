# Wireline design system (implementation reference)

## Brand voice (UI copy)

- **Operator-facing**: direct, confident, no hype
- **Director / wingman**: mission control, fleet, approvals, integrations
- **Avoid**: “AI-powered”, “unlock”, “revolutionize”, emoji-heavy marketing inside app chrome
- **Constants**: prefer `wireline-director-design.ts` for Director strings; add new copy there when shared

## Color (source of truth)

### TS constants — `src/constants/brand-colors.ts`

| Token | Hex | Use |
|-------|-----|-----|
| purple | `#8B3FD6` | Primary CTA, active states |
| purpleDeep | `#3B154C` | Sidebar, secondary brand |
| cream / paper | `#F5F0E6` / `#EFE9DC` | Backgrounds |
| ink | `#1A1614` | Body text (light) |
| rose | `#E8466A` | Errors, critical compliance only |

Route accents: `ROUTE_ACCENTS`, `NAV_GROUP_ACCENTS` — stay in purple/cream family.

### CSS — `src/index.css`

- **shadcn**: `:root` / `.dark` (`--background`, `--primary`, `--card`, `--sidebar-*`, …)
- **Tailwind @theme**: `--color-brand`, `--color-paper`, `--font-sans`, `--font-display`, `--font-mono`
- **Legacy utilities** (`emerald-*`, `amber-*`, `blue-*`, `sky-*`) are **remapped to purple/cream** — safe for old code, don’t add new off-hue literals

### Director accents — `wireline-director-design.ts`

| Token | Hex | Use |
|-------|-----|-----|
| violet | `#8B3FD6` | Primary director UI |
| signal | `#10B981` | Success / executed approval only |
| opus | `#D97706` | Deep analysis badge only |

## Typography

| Role | Font | Utility |
|------|------|---------|
| UI | Plus Jakarta Sans | `font-sans`, body |
| Display | Fraunces (italic in marketing) | `font-display`, hero |
| Data / code | JetBrains Mono | `font-mono`, IDs, metrics |

- **Section label**: `.app-section-title` (app) or `.wl-label` (compact uppercase)
- **Chrome text**: `.chrome-eyebrow`, `.chrome-muted`, `.chrome-subtle`
- **Small brand text**: use `--color-brand-ink` on buttons/tabs for WCAG at 10–11px

## Elevation & surfaces (prefer classes)

| Class | Use |
|-------|-----|
| `paper-texture` | Subtle grain on marketing/large surfaces |
| `elev-0` … `elev-3`, `elev-glow` | Shadow scale |
| `wl-panel` | Standard floating panel |
| `wl-panel-elevated` | Primary workspace container |
| `glass-1`, `glass-2` | Sticky header, modals — sparingly |
| `hairline`, `aurora-divider` | Section separators |
| `scroll-viewport` | Scrollable regions inside locked shell |

## Director / mission control

Import from `src/lib/wireline-director-design.ts` (full map in that file — do not duplicate class strings in TSX):

```ts
WL_DIRECTOR_CLASSES.missionPanel      // wl-mission-panel director-live-panel
WL_DIRECTOR_CLASSES.composerDock      // composer
WL_DIRECTOR_CLASSES.directorBubble    // assistant
WL_DIRECTOR_CLASSES.operatorBubble    // user
WL_DIRECTOR_CLASSES.proposalCard      // approval cards
WL_DIRECTOR_CLASSES.proposalRail      // left accent rail
WL_DIRECTOR_CLASSES.composerToolbar   // tool row
WL_DIRECTOR_CLASSES.composerAccessory // expanded accessory panel
WL_DIRECTOR_CLASSES.liveOrchestra     // multi-step live orchestration
WL_APP_CLASSES.*                      // settings / insights / integrations chrome
```

CSS blocks in `index.css`: `.wl-director-bubble`, `.wl-operator-bubble`, `.wl-composer-dock`, `.wl-proposal-card`, `.director-live-shimmer`, `.wl-orchestration-step`, `.wl-integration-live-card`.

**Live vs proposed**: proposed integrations use `data-proposal="true"` (dashed border) — never look “already executed.”

## Layout shell

```
AuroraBackdrop (fixed, z-0)
  AppShell
    Sidebar (brand-heavy)
    main.app-surface
      TopBar (title, eyebrow, subtitle from route context)
      scroll-viewport → page content
```

- **Marketing** surfaces: `.marketing-surface` — can be more expressive
- **App** surfaces: `.app-surface` — prioritize clarity and density

## Components to reuse

| Need | Use |
|------|-----|
| Button | `shadcn/ShadButton`, `HaloButton`, `VoidButton` (check existing usage on screen) |
| Empty | `EmptyState`, `InlineEmpty` |
| Section title | `SectionHeader` |
| Status / agent | `StatusOrb`, `wl-orbit`, `AgentActivityIndicator` |
| Streaming tasks | `LiveTaskPipeline` |
| Cards | `shadcn/Card`, `ArtifactCard` |
| Proposals | `chat/ProposalCard` |

Add shadcn: `npx shadcn@latest add <component> -y` (aliases in `components.json`).

## Accessibility

- Global `:focus-visible` uses `--focus-ring` / `--focus-ring-dark`
- Don’t rely on color alone for status — pair icon + label
- `aria-live` on streaming Director regions
- Touch targets ≥ 44px on primary mobile actions — use `touch-press`
- Test dark mode contrast on `muted-foreground` and sidebar text

## When to edit `index.css` vs TSX

| Change | Where |
|--------|--------|
| New semantic color, shadow, motion token | `index.css` `:root` / `.dark` / `@theme` |
| New reusable panel/bubble pattern | `index.css` utility block + optional constant in `wireline-director-design.ts` |
| One-screen layout | TSX + existing utilities |
| Copy shared across Director | `wireline-director-design.ts` |

## Tests to run after design contract changes

```bash
npm run test:design
# or individually:
npm test -- wireline-director-design
npm test -- shadcn-pivot-ratchet
```
