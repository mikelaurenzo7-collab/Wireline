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
- **Dynamic accent utilities** (`.wl-accent-surface`, `.wl-accent-text`, `.wl-accent-progress`, …) — consume `--wl-accent` set via `data-accent` on a wrapper (see [csp-theming.md](csp-theming.md))

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
| `wl-pricing-tier--highlight` | Marketing pricing spotlight (no inline box-shadow) |

## Identity primitives (Constellation + v3)

Decorative motion lives in **`index.css`**, not TSX `<style>` blocks. All include `prefers-reduced-motion` guards.

| Era | Components | Notes |
|-----|------------|-------|
| Constellation | `ConstellationField`, `PulseRing`, `AuroraWave`, `StatusOrb` | SVG + shared keyframes |
| Identity v3 | `NebulaPulse`, `GlyphMorph`, `PrismBadge`, `VoidButton`, `SignalThread` | Marketing / hero / CTA |
| Marketing | `SectionStickers`, `RobotHead` | Gutter stickers; calc insets via `apply-dom-layout` |
| Fleet | `Medallion` | `data-accent` + `medallion-accent-face` for contextual empty states |

**VoidButton** — event-horizon CTA: `void-button`, `data-uid="void"`, layers `void-bg` / `void-warp-ring` / `void-corona` / `void-shimmer-stripe`.

**Toast** — `data-toast={type}` sets `--toast-color`; classes `wl-toast-accent`, `wl-toast-icon`. Stack clearance: `data-marketing-sticky` on `.toast-stack`.

Contract tests: `src/components/ui/__tests__/constellation-primitives.test.tsx` (asserts `index.css`, not inline component CSS).

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
    Sidebar (brand-heavy, data-rail expanded|collapsed)
    main.app-surface
      TopBar (title, eyebrow, subtitle from route context)
      scroll-viewport → page content
```

- **Marketing** surfaces: `.marketing-surface` — can be more expressive; `SectionStickers` in gutters
- **App** surfaces: `.app-surface` — prioritize clarity and density
- **First paint**: `public/app-shell.css` skeleton before React hydrates

## Components to reuse

| Need | Use |
|------|-----|
| Button | `ShadButton`, `HaloButton`, `VoidButton` (hero CTA) |
| Empty / marker | `Medallion` (`data-accent`, variant `instrument` \| `signature`) |
| Empty state | `EmptyState`, `InlineEmpty` |
| Section title | `SectionHeader` |
| Status / agent | `StatusOrb`, `wl-orbit`, `AgentActivityIndicator` |
| Streaming tasks | `LiveTaskPipeline` |
| Cards | `shadcn/Card`, `ArtifactCard` |
| Proposals | `chat/ProposalCard` |
| Integration demos | `PreviewCards` + `preview-cards.css` |
| Capability map | `AgentIntegrationCanvas` + `wl-canvas-node` |
| Insights heatmap | `wl-heatmap-cell` + `data-heat-opacity` |
| Notifications | `Toast` + `data-toast` |

Add shadcn: `npx shadcn@latest add <component> -y` (aliases in `components.json`).

## CSP-safe dynamic styling

**Full guide:** [csp-theming.md](csp-theming.md)

Quick rules:

1. **Accent on wrapper** — `data-accent={hex}` + child `wl-accent-*` classes
2. **Progress / metrics** — `data-pct`, `data-progress`, or `--progress-pct` utilities
3. **No `style={` in TSX** — CI ratchet `npm run csp:check`
4. **Calc gutters** — `applyEdgeInset` / `applyCssVar` from `src/lib/apply-dom-layout.ts`
5. **Framer / Recharts** — runtime `style=""` OK under `style-src-attr 'unsafe-inline'`

## Accessibility

- Global `:focus-visible` uses `--focus-ring` / `--focus-ring-dark`
- Don’t rely on color alone for status — pair icon + label
- `aria-live` on streaming Director regions and toast stack (`role="log"`)
- Touch targets ≥ 44px on primary mobile actions — use `touch-press`
- Test dark mode contrast on `muted-foreground` and sidebar text
- Primitives freeze or simplify under `prefers-reduced-motion`

## When to edit what

| Change | Where |
|--------|--------|
| New semantic color, shadow, motion token | `index.css` `:root` / `.dark` / `@theme` |
| New reusable panel/bubble/primitive pattern | `index.css` block + tests if primitive |
| Vendor-dense thumbnail palette | co-located `*.css` next to component |
| Dynamic accent on a screen | `data-accent` + existing `wl-accent-*` before new CSS |
| One-screen layout | TSX + existing utilities |
| Copy shared across Director | `wireline-director-design.ts` |
| CSP header change | `src/lib/csp.ts` → `node scripts/check-csp-drift.mjs --write` |

## Tests to run after design contract changes

```bash
npm run test:design
npm run csp:check
# Primitive / director contracts:
npm test -- constellation-primitives
npm test -- wireline-director-design
npm test -- csp-inventory
npm test -- shadcn-pivot-ratchet
```
