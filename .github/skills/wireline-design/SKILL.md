---
name: wireline-design
description: >-
  Wireline UI/UX upgrade skill — Aurora Cream design system (warm cream +
  silky purple, razor-edge zero-radius, editorial type), CSP-safe styling
  patterns, shadcn ratchets, and Director mission-control contract. Use when
  improving any Wireline screen, polishing UX flows, fixing visual bugs, or
  when the user mentions design pass, level up UI, Director, fleet dashboard,
  or CSP-safe styling.
---

# Wireline design — implementation contract

Everything here is verified against source-of-truth files. When in doubt,
**code wins**: `src/index.css`, `src/constants/brand-colors.ts`,
`src/lib/wireline-director-design.ts`, `DESIGN.md`.

## Brand tokens (verified)

| Token | Value | Source |
|---|---|---|
| `--primary` (light) | `#8b3fd6` | `src/index.css` |
| `--primary` (dark) | `#9b5ce0` | `src/index.css` |
| `--color-brand` | `var(--primary)` | `src/index.css` `@theme` |
| `BRAND.purple` | `#8B3FD6` | `src/constants/brand-colors.ts` |
| `BRAND.purpleDeep` | `#3B154C` | sidebar / secondary |
| `BRAND.cream` / `paper` | `#F5F0E6` / `#EFE9DC` | backgrounds |
| `BRAND.ink` | `#1A1614` | body text (light) |
| `BRAND.velvet` | `#1A1225` | dark elevated panels |
| `BRAND.chromeGlow` | `#C77DFF` | luminous brand on dark chrome |
| `BRAND.rose` | `#E8466A` | errors/critical ONLY — never decorative |

Director accents (`wireline-director-design.ts`): violet `#8B3FD6`,
signal `#10B981` (executed approvals only), opus `#D97706` (deep-analysis badge only).

**Palette law:** purple + cream family only. Legacy `emerald-*`/`sky-*`/`blue-*`
utilities are remapped to brand in `index.css` — never introduce new off-hue literals.

## Typography

- UI: Plus Jakarta Sans (`font-sans`)
- Display: Fraunces italic (`font-display`) — heros, section titles
- Data/code: JetBrains Mono (`font-mono`) — IDs, metrics, eyebrows
- Section labels: `.app-section-title` or `.wl-label`; chrome text: `.chrome-eyebrow` / `.chrome-muted`

## Radius — razor edge

Global `border-radius: 0 !important` reset in `index.css`. Only circular
elements (`.dot-*`, `.live-ring`, `[data-circular]`) opt back to `9999px`.
**Use `rounded-md` as the only radius literal** — `rounded-{lg,xl,2xl,3xl}`
are banned by the ratchet.

## Ratchets — all baselines are 0, never raise

`src/components/ui/__tests__/shadcn-pivot-ratchet.test.ts` (feature code in
`src/components` + `src/pages`, excluding `ui/shadcn/`):

| Banned | Use instead |
|---|---|
| raw `<button>` | `ShadButton` (custom tiles: `variant="ghost" disableAnimations className="h-auto …"`) |
| raw `<input>` / `<select>` / `<dialog>` | `Input` / `Select` / `Dialog` / `Sheet` from `ui/shadcn/` |
| `.glass` in feature code | `<Card>` or `wl-panel` (shell chrome exempt) |
| `rounded-{lg,xl,2xl,3xl}` | `rounded-md` |

CSP ratchet (`npm run csp:check`, `src/lib/csp-inventory.ts`): **zero**
`style={` and zero `<style>` in `.tsx`. Patterns instead:

1. `data-accent={hex}` on wrapper + `wl-accent-*` child classes
2. Typed data attrs: `data-pct`, `data-progress`, `data-heat-opacity`, `data-node-x/y`, `data-toast`
3. Co-located `.css` for vendor-dense UI (e.g. `integrations/preview-cards.css`)
4. Global primitive CSS in `index.css` (VoidButton, PrismBadge, GlyphMorph, NebulaPulse…)
5. `applyEdgeInset` / `applyCssVar` from `src/lib/apply-dom-layout.ts` for calc values
6. Framer Motion / Recharts runtime `style=""` is allowed (`style-src-attr`)

## Surfaces & components

| Need | Use |
|---|---|
| Panel | `wl-panel`, `wl-panel-elevated`, `<Card>` |
| Sticky chrome / modal | `glass-1` / `glass-2` (sparingly) |
| Empty state | `EmptyState` / `InlineEmpty` + `Medallion` (`data-accent`) |
| Section title | `SectionHeader` (mono eyebrow → Fraunces italic title → muted description) |
| Buttons | `ShadButton`, `HaloButton`; hero CTA: `VoidButton` |
| Toast | `Toast` + `data-toast={type}` |
| Streaming tasks | `LiveTaskPipeline` |
| Scroll inside locked shell | `scroll-viewport` |

Director surface: import every class/copy string from
`WL_DIRECTOR_CLASSES` / `WL_APP_CLASSES` in `src/lib/wireline-director-design.ts`
— never duplicate the strings in TSX. Update `wireline-director-design.test.ts`
in the same PR when the contract changes.

## Layout shell

```
AuroraBackdrop (fixed z-0, calm paper/velvet — no loud washes behind data UI)
  AppShell
    Sidebar (data-rail expanded|collapsed; 4 groups: Workspace / Channels / Sales / Admin)
    main.app-surface → TopBar → scroll-viewport → page
```

Marketing pages use `.marketing-surface` (more expressive); app pages use
`.app-surface` (clarity + density). First paint: `public/app-shell.css`.

## Authenticated route map

Workspace: `/ops` (Live Ops, default landing) · `/chat` (Director) ·
`/design` (Painter, Beta) · `/training` · `/insights`
Channels: `/phone` · `/email` · `/sms`
Sales: `/pipeline`
Other: `/agents` · `/integrations` · `/admin` · `/help` · `/founder` (owner-only)

## Accessibility & mobile

- Design at 390px first; 44×44px touch targets via invisible padding/pseudo-elements, never inflated visuals
- `:focus-visible` ring from `--focus-ring`; never remove
- Pair icon + label for status — never color alone
- `aria-live` on streaming regions; `role="log"` on toast stack
- All primitives must respect `prefers-reduced-motion`

## Workflow

```
1. Read affected component(s) + relevant index.css blocks
2. Audit: off-brand hues, style={ regressions, missing empty/loading/error states
3. Implement: index.css utilities → data-* / classes → minimal TSX diff
4. Verify dark mode, 390px, focus rings, reduced motion
5. npm run csp:check && npm run test:design (if contract touched) && npm run lint
```

## Anti-patterns — reject on sight

- `style={` / `<style>` in TSX, or `asStyle()` shims to game inventory
- New inline `#hex` when a token exists; any blue/teal/orange decoration
- `rounded-lg`+ literals; raw `<button>`/`<input>`/`<select>`/`<dialog>`
- Generic AI copy ("Unlock the power of…") — Director tone is specific, operator-facing
- Hover-only actions on touch-primary flows
- Breaking `scroll-viewport` / AppShell scroll lock
- Weakening ratchet baselines or removing tests

## Drift checks after design work

```bash
npm run csp:check        # style inventory + vercel.json drift
npm run test:design      # wireline-design-audit, shadcn-pivot-ratchet, wireline-director-design
npm run lint && npm run lint:eslint
```
