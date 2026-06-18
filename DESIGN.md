# Wireline Design System — "Midnight"

**Status:** Active (2026) · **Mode:** Dark-only
**Goal:** One cohesive, premium, desktop-first visual language across every
authenticated surface. Calm, spacious, opinionated.

> **History:** Earlier passes ("Aurora Cream", "Rich Cream + Purple") layered
> competing type systems, `!important` selector-soup, a zero-radius reset, and
> stacked gradients on top of each other. Midnight replaces all of it with a
> single token-driven dark system. The app-visual ratchet tests
> (`shadcn-pivot-ratchet`, `wireline-design-audit`) that locked in the old look
> have been removed. The Director **design-generation** product (the feature
> that generates designs *for clients* via Figma/Canva/Magic Patterns) is
> unrelated to app chrome and is unaffected.

---

## 1. Principles

1. **Dark-only.** `ThemeContext` always resolves `dark`; `<html class="dark">`
   with `color-scheme: dark`. There is no light path today (the seam remains if
   a "Daybreak" variant is ever wanted).
2. **Desktop/laptop-first.** Design for real screens from the smallest laptop
   (~1280px) up through large desktop (1600–1920px+) as the first-class
   experience, escalating layouts into `lg:`/`xl:`/`2xl:` for density and space.
   **Mobile browser is a clean functional fallback, not a focus** — the phone
   experience ships as the native app, not the web viewport.
3. **Token-driven.** All color/radius/elevation lives in `src/index.css`
   (`:root` + `@theme`). Change a token, the whole app moves. Never hardcode a
   hex in a component — use the semantic Tailwind utility or CSS var.
4. **Calm.** One faint accent bloom, hairline borders, generous negative space.
   No competing gradients, grain, or halos. Let data UI breathe.

---

## 2. Core tokens (source of truth: `src/index.css`)

### Color
| Role | Token | Value |
|---|---|---|
| Canvas | `--canvas` | `#0C0D11` |
| Panel (cards, sidebar, topbar) | `--panel` | `#14161D` |
| Raised (inputs, nested) | `--panel-2` | `#191C24` |
| Highest (hover) | `--raised` | `#21242E` |
| Text primary / secondary / tertiary | `--text` / `--text-2` / `--text-3` | `#ECEDF1` / `#9B9DA8` / `#62646E` |
| Accent (iris) | `--iris` / `--iris-bright` / `--iris-deep` | `#7C9CFF` / `#A9BEFF` / `#5570E6` |
| Live / positive | `--mint` | `#54E0B4` |
| Attention | `--amber` | `#F4B45A` |
| Border / input hairline | `--border` / `--input` | `rgba(255,255,255,.09)` / `.12` |

The shadcn semantic tokens (`--background`, `--card`, `--primary`, `--ring`, …)
map onto the above, so every shadcn primitive and Tailwind color utility
(`bg-card`, `text-foreground`, `border-border`, `bg-primary`) inherits Midnight
automatically. **The accent is rare and meaningful** — primary actions, active
nav, focus. Mint is live/success only; amber is attention only.

### Typography
- **Display & UI:** `font-display` / `font-sans` → **Plus Jakarta Sans** (no
  competing serif). Tight display tracking (`-0.034em` on h1, easing to `0`),
  one scale — no per-surface `!important` overrides.
- **Mono (eyebrows, labels, metrics):** `font-mono` → **JetBrains Mono**,
  uppercase, `+0.18em`, used small.

### Radius
Real, soft scale (the old `border-radius: 0 !important` reset is gone):
`--radius-sm:10 · md:12 · lg:14 · xl:18 · 2xl:22 · 3xl:28`. `rounded-*` means
what it says again.

### Elevation & motion
Two soft layered shadows + a 1px inset highlight; gradient buttons carry a
colored glow. One spring (`cubic-bezier(.34,1.56,.64,1)`), `.touch-press` for
GPU press feedback, `prefers-reduced-motion` honored.

---

## 3. Surface utilities (`@layer utilities` in `index.css`)

| Class | Purpose |
|---|---|
| `.wl-panel` | Standard panel (panel bg + hairline + 14px radius) |
| `.wl-panel-elevated` | Primary workspace container (raised bg + inset highlight + deep shadow) |
| `.wl-premium-card` / `.wl-dark-card` | Card surfaces with depth |
| `.wl-title` / `.wl-subtitle` / `.wl-label` | Display title / mono eyebrow / mono micro-label |
| `.wl-numeral` | Tabular lining numerals for metrics |
| `.touch-press` / `.touch-press-deep` | Press physics |
| `.scroll-viewport` | Isolated scroll container with overscroll containment |

---

## 4. Component tiers

- **Tier 1 — shadcn primitives** (`src/components/ui/shadcn/`): the only
  sanctioned source of buttons, inputs, tabs, dialogs, etc. They consume the
  tokens above. Prefer `ShadButton` over raw `<button>`.
- **Tier 2 — compositions** (`src/components/ui/`): `SectionHeader`,
  `EmptyState`, `Medallion`, `HaloButton` — built *out of* Tier 1.
- **Tier 3 — theme/branding**: `ThemeContext` (dark-only), `BrandingContext`.

---

## 5. Information architecture

The **Assistant** (formerly "Director") and the **Studio** are **one
workspace**: the Assistant thread on the left, an open **Canvas** filling the
rest where work appears (deliverables, agent builds, design previews). Idle
Canvas stays spacious by design. Sidebar groups: **Studio · Agents · Training**
then *Operate:* **Live Ops · Inbox · Insights · Settings**.

---

*Gold standard: the unified Studio (Assistant + Canvas). Reference mockups live
in `design-mockups/`.*
