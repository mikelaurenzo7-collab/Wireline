# Wireline Design System — Lavender Noir + Console

**Status:** Active (2026)  
**Goal:** Readable, premium UI — light marketing/auth, dark authenticated consoles.

> **Source of truth for tokens:** `src/index.css` (`:root` + `.wl-console-surface`).  
> **Director mission-control copy/classes:** `src/lib/wireline-director-design.ts` (run `npm run test:design` when that contract changes).

---

## 1. Two surfaces (not one theme toggle)

Wireline intentionally uses **two visual modes** on the same site:

| Surface | Where | Class / scope | Canvas | Text |
|---------|--------|---------------|--------|------|
| **Marketing & auth** | `/`, `/pricing`, `/signin`, `/signup`, … | `:root` tokens + `.wl-overhaul-surface` | Lavender `#F3EFFA` | Charcoal `#1E1B2E` |
| **Authenticated console** | `/app/business/*`, `/app/personal/*`, Studio | `.wl-console-surface` on workspace root | Charcoal ink `#1E1B2E` | Paper `#F3EFFA` |

`ThemeContext` keeps `<html>` on the **light** marketing tokens so public pages stay cream/lavender.  
Authenticated shells **must** mount `.wl-console-surface` on their root element — do not rely on `.dark` on `<html>`.

### Console utilities (`src/index.css`)

| Class | Purpose |
|-------|---------|
| `.wl-console-surface` | Scoped dark tokens (background, card, muted, borders) |
| `.wl-glass-panel` | Sidebar / rail (charcoal gradient) |
| `.wl-glass-card` | Elevated panels inside console |
| `.hover-glow` | Hover depth on cards |
| `.wl-panel` / `.wl-panel-elevated` | Standard / raised panels (inherit active surface) |

---

## 2. Core tokens (marketing — `:root`)

| Role | Token | Value |
|------|-------|-------|
| Canvas | `--lavender` / `--background` | `#F3EFFA` |
| Accent | `--violet` / `--brand` | `#7C3AED` |
| Depth (text) | `--charcoal` / `--foreground` | `#1E1B2E` |
| Elevated card | `--lavender-bright` / `--card` | `#FAF8FF` |
| Secondary text | `--charcoal-muted` | `#6E6584` |

Three-color discipline: lavender, violet, charcoal (+ destructive red only).

---

## 3. Core tokens (console — `.wl-console-surface`)

| Role | Token | Value |
|------|-------|-------|
| Canvas | `--canvas` / `--background` | `#1E1B2E` |
| Panel (cards, sidebar) | `--panel` / `--card` | `#2A2540` |
| Raised | `--panel-2` | `#342E4C` |
| Text primary | `--foreground` / `--paper` | `#F3EFFA` |
| Text secondary | `--muted-foreground` | `#B8B0CA` |
| Border | `--border` | `rgba(243,239,250,.10)` |
| Accent | `--brand` | `#7C3AED` (inherits violet) |

Match the auth portal **ink left rail** and `FigmaOverhaul` business console.

---

## 4. Principles

1. **Readable contrast first** — never put `text-white/*` nav on a lavender canvas; never ship undefined utility classes.
2. **Desktop/laptop-first** — sidebars visible from `lg:` (1024px), not only `2xl:`.
3. **Token-driven** — use `bg-card`, `text-foreground`, `border-border` inside the correct surface scope; avoid one-off hex in components.
4. **Calm** — one faint violet wash on marketing; console stays flat charcoal with subtle glass cards.

---

## 5. Typography

- **Display:** Fraunces (`font-display`) — marketing heroes, console page titles
- **UI:** Plus Jakarta Sans (`font-sans`)
- **Mono labels:** JetBrains Mono (`font-mono`, `.wl-label`, `.wl-subtitle`)

---

## 6. Component tiers

- **Tier 1 — shadcn** (`src/components/ui/shadcn/`): buttons, inputs, dialogs — consume semantic tokens.
- **Tier 2 — compositions** (`src/components/ui/`): SectionHeader, EmptyState, …
- **Tier 3 — workspace shells** (`BusinessWorkspace`, `PersonalWorkspace`, `AgentStudioWorkspace`): always root with `.wl-console-surface`.

---

## 7. Root cause — brightness / illegibility (2026-06)

Symptoms: authenticated app looked **blown-out bright**; sidebar labels were faint; cards invisible.

| # | Cause | Fix |
|---|--------|-----|
| 1 | `index.css` `:root` is **light-sovereign** Lavender Noir | Keep for marketing; scope dark via `.wl-console-surface` |
| 2 | `BusinessWorkspace` used `bg-background` + `wl-overhaul-surface` (lavender) | Root → `wl-console-surface` only |
| 3 | Nav/components used **dark-console** colors (`text-white/60`) | Correct on console; wrong on lavender |
| 4 | `wl-glass-panel`, `wl-glass-card`, `hover-glow` **referenced but undefined** | Defined in `index.css` |
| 5 | `DESIGN.md` described "Midnight" while CSS shipped Lavender | Docs aligned to dual-surface model |
| 6 | Sidebar hidden until `2xl` on business app | Show from `lg` |
| 7 | `AgentStudioWorkspace` mixed `bg-ink` with `bg-card` (light card token) | Wrap in `wl-console-surface` |

---

## 8. Information architecture

**Assistant** + **Studio** share one workspace mental model: command surface + canvas.  
Business sidebar: Assistant · Live Ops · Fleet · Training · Analytics · Team · Integrations · Settings.

---

*Reference mockups: `design-mockups/`. Legacy platform notes: `docs/DESIGN_SYSTEM.md` (deprecated).*
