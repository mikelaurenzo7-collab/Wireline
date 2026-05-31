# Wireline Design System — Aurora Cream (Elevated)

**Status:** Live (2026)
**Goal:** One cohesive, premium, editorial visual language across every surface.

## 1. Core Design Philosophy

Aurora Cream is an **editorial-luxury** design system — razor-sharp corners,
warm cream paper textures, deep purple ink accents, and glass-morphism surfaces
that catch light like cut gemstones. The aesthetic sits at the intersection of
*Anthropic's editorial warmth*, *Vercel's glass polish*, and *old-money typographic
rigor*.

Every element is hand-finished: crystalline glints on medallions, subtle scanline
textures, floating aurora blobs, and a reduced-motion system that collapses
animations gracefully without losing the static beauty.

---

## 2. Design Tokens

### Typography
- **Display (Headlines):** `font-display` → Fraunces (italic, 400–700)
- **Interface (Body/UI):** `font-sans` → Plus Jakarta Sans
- **Mono (Labels, Code, Metrics):** `font-mono` → JetBrains Mono
- **Body size:** 15px base, 13.25px inside `.app-surface` for dense data views

### Color Palette
| Token | Light | Dark |
|-------|-------|------|
| `--color-brand` | `#8B3FD6` (vibrant purple) | `#8B3FD6` |
| `--color-brand-deep` | `#6B2B99` | `#6B2B99` |
| `--color-brand-ink` | `#f3e8ff` | `#f3e8ff` |
| `--ink` | `#1A1614` (warm near-black) | `#f3e8ff` |
| `--paper` | `#EFE9DC` (cream) | `#120f1a` (deep purple) |
| `--purpleLight` | `#A87BD4` (distinct lavender) | — |
| `--purpleMuted` | `#8B6FA8` (dusty purple) | — |
| `--rose` | `#E8466A` (errors only) | `#ef4444` |

### Effects
- **Glass surfaces:** `.glass` (light), `.glass-strong`, `.glass-elevated` (modals)
  — warm cream translucent with backdrop blur. Collapsed on reduced-motion.
- **Aurora Ring:** `.aurora-ring` — premium border glow using CSS mask-composite.
  Near-invisible on mobile (<768px) to avoid visual noise.
- **Medallion Glint:** `.medallion-glint` — specular highlight + diagonal light-sweep
  that reads like a cut gemstone catching the light.
- **Scanline:** `.scanline` — fixed overlay with repeating purple-tinted horizontal
  lines at 4px intervals, screen blend. Hidden on reduced-motion.
- **Noise texture:** `body::before` renders a subtle fractal noise SVG at 15% opacity
  with multiply blend, giving the cream paper a tactile grain.

### Radius
- **Zero radius** is the global default (`border-radius: 0 !important`).
- Exceptions: circular elements (`.dot-online`, `.live-ring`, `[data-circular]`),
  scrollbar thumbs (999px), and medallion glint overlays.

---

## 3. Component Architecture

### Tier 1 — shadcn Primitives (`src/components/ui/shadcn/`)
The canonical UI layer. Every button, input, modal, sheet, tab, dropdown,
switch, tooltip, badge, alert, progress, skeleton, avatar, accordion,
separator, and command palette ships from here.

Available: `ShadButton`, `Card`, `Tabs`, `Dialog`, `Sheet`, `DropdownMenu`,
`Select`, `Checkbox`, `Slider`, `Command`, `Input`, `Switch`, `Badge`, `Alert`,
`Progress`, `Skeleton`, `Avatar`, `Separator`, `Tooltip`, `ScrollArea`, `Accordion`.

### Tier 2 — Aurora Cream Compositions (`src/components/ui/`)
Higher-level patterns composed from shadcn primitives:

- **Medallion** — gradient icon container with optional halo and crystalline glint.
  Sizes: `sm` (24px), `md` (36px), `lg` (44px). Supports custom accent colors.
- **SectionHeader** — mono eyebrow + italic display title + muted description.
  Used at the top of every major content block.
- **EmptyState** — canonical "no data" surface. Composes Medallion + SectionHeader
  + action buttons. Supports `framed` variant with `aurora-ring` + `glass-strong`.
- **HaloButton** — thin `ShadButton asChild` wrapper for branded CTAs with
  glass + `blur-2xl` halos. Preserves the visual while satisfying the ratchet.

### Tier 3 — Feature Components (`src/components/<feature>/`)
Feature-specific components that compose Tiers 1 & 2. Never reintroduce raw
HTML controls.

### Tier 4 — Pages (`src/pages/`)
Route-level page components. Compose feature components.

---

## 4. Recurring Patterns

- **Every content block** starts with `SectionHeader`
- **Every empty state** uses `EmptyState` with `Medallion` + halo
- **Every interactive card** uses `.card-interactive` or `.card-interactive-premium`
- **Every primary CTA** uses gradient brand (`from-brand to-brand-deep`)
- **Every tabbed interface** uses `Tabs` from shadcn
- **Every route change** uses View Transitions API (CSS cross-fade)

---

## 5. Do's and Don'ts

**Do:**
- Use `ShadButton` for every button — never raw `<button>`
- Use `Card` for card surfaces — reserve `.glass` for non-card surfaces
- Use `--color-brand` and `var()` references over hardcoded hex
- Use `color-mix()` for dynamic opacity — never hardcode rgba duplicates
- Mark purely decorative elements with `aria-hidden`
- Respect `prefers-reduced-motion` — collapse animations to 0.01ms
- Use the three-tier scrollbar system: global (6px thin), `.scrollbar-hide` (5px),
  `.panel-scroll` (`scrollbar-width: thin`)

**Don't:**
- Introduce new colors — stay within purple/cream family
- Use off-brand blues (`#3B82F6`), teals (`#10B981`), or oranges (`#F59E0B`)
- Create one-off empty states — always use `EmptyState`
- Use `border-white/*` on cream backgrounds — use `border-black/8` or `border-ink/[0.08]`
- Stack multiple cards inside cards without visual separation
- Add Material Design 3 patterns — they conflict with the editorial aesthetic
- Use `rounded-{lg|xl|2xl|3xl}` — the brand is zero-radius

---

## 6. File Organization

```
src/
├── index.css                    # Single CSS entry — design tokens + utilities + animations
├── components/
│   ├── ui/
│   │   ├── shadcn/              # shadcn primitives (22 files)
│   │   ├── __tests__/           # Design system ratchet tests
│   │   ├── Medallion.tsx        # Signature gradient icon container
│   │   ├── SectionHeader.tsx    # Editorial content header
│   │   ├── EmptyState.tsx       # Canonical empty state
│   │   └── HaloButton.tsx       # Branded CTA wrapper
│   ├── layout/                  # AppShell, Sidebar, TopBar, AuroraBackdrop
│   ├── fleet/                   # Fleet management components
│   ├── marketing/               # Public site components
│   └── ...                      # Feature components
├── constants/
│   ├── brand-colors.ts          # BRAND palette, ROUTE_ACCENTS, NAV_GROUP_ACCENTS
│   └── navigation.ts            # NAV_GROUPS, PAGE_TITLES, keyboard shortcuts
├── contexts/
│   ├── ThemeContext.tsx          # Light/dark with system preference + localStorage
│   └── BrandingContext.tsx       # Per-tenant logo + accent
└── pages/                       # Route-level page components
```

---

## 7. CSS Architecture

The single `index.css` is organized into these sections:

1. **Fonts + Tailwind imports** (top of file)
2. **Design Tokens** — `:root` (light) and `.dark` shadcn custom properties
3. **@theme Block** — Tailwind theme extensions (fonts, colors, radius)
4. **Base Layer** — razor-edge reset, typography, body/html, selection, readability floors,
   app surface spacing, scrollbar system
5. **Aurora Utilities** — `@utility` classes (brutal-border, brutal-btn, brutal-card),
   glass variants, aurora ring, text treatments
6. **Animations** — aurora drift/blobs, medallion glint, card interactions,
   skeleton/pulse/shimmer, route transitions, accordion
7. **Component Surfaces** — buttons, inputs, badges, status dots, tabs, panels,
   workspace stage, marketing surfaces
8. **Typography Scale** — eyebrow, lead, caption, strong, chrome, fluid type
9. **Dark Mode Overrides** — glass/brutal cards in dark, dynamic border rescue,
   dark scrollbar/selection
10. **Responsive Breakpoints** — mobile-first refinements, touch device optimization
11. **Accessibility** — single `prefers-reduced-motion` block covering all animations

---

## 8. Testing

| Test File | Purpose |
|-----------|---------|
| `shadcn-pivot-ratchet.test.ts` | Design system compliance — raw button/input/select counts, component pattern usage, brand color integrity |
| `brand-colors.test.ts` | Brand palette integrity — all colors in purple/cream family, contrast ratios |
| `navigation-accent.test.ts` | Route accent resolution — tab overrides, fallback behavior |
| `navigation.test.ts` | Navigation IA structure — groups, paths, keyboard shortcuts |
| `channel-pages.manifest.test.ts` | Channel page structure — no redundant HubTabs |
| `robot-phone-layout.test.ts` | Marketing illustration layout math |

---

*The canonical empty state and loading shell in AppShell are the current gold standard.*