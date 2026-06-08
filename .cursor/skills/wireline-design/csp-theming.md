# CSP-safe dynamic styling (Phases 0–6)

Wireline production CSP (`src/lib/csp.ts`) uses **split style directives**:

| Directive | Prod value | Meaning |
|-----------|------------|---------|
| `style-src-elem` | `'self'` | Stylesheets + linked CSS only — **no** inline `<style>` in HTML/JSX |
| `style-src-attr` | `'unsafe-inline'` | Framer Motion, Recharts, and narrow `applyDomLayout` refs may set `style=""` |

First-paint shell: `public/app-shell.css` (linked from `index.html`) — not an inline block.

## CI ratchets

```bash
npm run csp:check          # vercel.json drift + inventory
npm run csp:inventory:update   # after intentional reductions
```

| Ratchet | Scope | Baseline |
|---------|-------|----------|
| `style={` | `.tsx` under `src/`, comments stripped | **0** |
| `<style` | `.tsx` JSX children | **0** |

Source: `src/lib/csp-inventory.ts`. **Do not** use `asStyle()` shims or per-component `<style>` blocks to pass CI.

## Pattern 1 — Wrapper `data-accent` + utility classes (preferred)

Set accent once on a root; children use `wl-accent-*` utilities.

```tsx
<div className="wl-accent-surface" data-accent={accent}>
  <span className="wl-accent-text">…</span>
</div>
```

CSS (`index.css`):

```css
[data-accent] {
  --wl-accent: attr(data-accent type(<color>));
}
.wl-accent-text { color: var(--wl-accent); }
```

**Also used:** `data-integration-accent`, `data-brand-color`, `data-confidence-color`, `data-recipe-accent`, `data-status-color`, `data-toast` (toast rail/icon).

Reference: `Medallion.tsx` (`data-accent` + `medallion-accent-face`), `PageShell.tsx`, `PreviewCards` co-located CSS.

## Pattern 2 — Typed data attributes for geometry

| Attribute | CSS variable / property | Example |
|-----------|-------------------------|---------|
| `data-pct` | `width` | Progress bars |
| `data-progress` | `--progress-pct` | `.wl-progress-indicator` |
| `data-heat-opacity` | `--heat-opacity` | `.wl-heatmap-cell` |
| `data-node-x` / `data-node-y` | `--node-x` / `--node-y` | `.wl-canvas-node` |
| `data-plasma-*` | Nebula plasma nodes | `NebulaPulse.tsx` |
| `data-rail` | `expanded` \| `collapsed` | `Sidebar.tsx` |

## Pattern 3 — Co-located CSS file (vendor / dense UI)

When a component needs many one-off colors (integration demos):

- `src/components/integrations/preview-cards.css` + `PreviewCards.tsx`
- Import: `import "./preview-cards.css"`

Vendor accent colors stay in CSS — not inline in TSX.

## Pattern 4 — Global primitive CSS (`index.css`)

Identity / motion primitives **must not** ship `<style>` children in TSX:

| Primitive | Classes | CSS section |
|-----------|---------|-------------|
| VoidButton | `void-button`, `void-bg`, `void-shimmer-stripe` | `VOID BUTTON` |
| PrismBadge | `prism-badge-surface`, `prism-holo-layer` | `PRISM BADGE` |
| GlyphMorph | `glyph-morph--*`, `glyph-morph-char` | `GLYPH MORPH` |
| SignalThread | `signal-thread-pulse` | `SIGNAL THREAD` |
| SectionStickers | `wl-sticker-slot`, `wl-sticker-enter` | `SECTION STICKERS` |
| ConstellationField | `constellation-drift-*` | motion presets |
| NebulaPulse | `nebula-plasma-node`, `nebula-drift-*` | nebula keyframes |

Tests assert contracts in `index.css`: `constellation-primitives.test.tsx`.

## Pattern 5 — Imperative layout (`apply-dom-layout.ts`)

**When `attr()` cannot express a value** (e.g. `calc()` sticker gutters):

```tsx
import { applyEdgeInset, applyCssVar } from "@/src/lib/apply-dom-layout";

<div ref={(el) => applyCssVar(el, "--wl-sticker-corridor", corridorHalfRem)} />
<div ref={(el) => applyEdgeInset(el, { left: insetLeft, top: slot.top })} />
```

Allowed under `style-src-attr`; keeps `style={` out of JSX inventory.

## Pattern 6 — Library motion (allowed)

Framer Motion (`motion/react`) and Recharts set inline `style=""` at runtime — **do not** try to zero these. They rely on `style-src-attr 'unsafe-inline'`.

Prefer CSS keyframes + classes for **new** Wireline-owned motion before reaching for `animate={{ width }}`.

## Anti-patterns

| Don't | Do instead |
|-------|------------|
| `style={{ color: accent }}` in TSX | `data-accent` + `wl-accent-text` |
| `<style>{`…`}</style>` in component | `index.css` or co-located `.css` |
| `asStyle()` wrapper to game ratchet | Real migration |
| Untyped `attr(data-inset-left)` for calc | `applyEdgeInset` ref |
| Inline `<style>` in `index.html` | `public/app-shell.css` |
| Broad `style-src 'unsafe-inline'` | Split elem / attr directives |

## Browser note

`attr(data-* type(...))` for colors and percentages requires Chromium 133+ / Firefox 128+. Complex calc gutters use Pattern 5. Test accent surfaces on target browsers when adding new `data-*` theming.
