# Wireline — Figma & Design System Rules

Use this document when implementing UI or syncing with the Figma library via MCP.

## Figma source of truth

| Asset | URL / key |
|-------|-----------|
| Design system file | [Wireline Design System v1](https://www.figma.com/design/0DRoWTyl71bfUBrK5W59e8) (`fileKey: 0DRoWTyl71bfUBrK5W59e8`) |
| Routing map (FigJam) | `https://www.figma.com/board/IZcX3HcGRi72SHFTG8k2fn` |
| Product IA (FigJam) | `https://www.figma.com/board/HjqmcLUaayF7kmKOlnGo4o` |
| Code bridge | `src/lib/figma-design-system.ts` |

**Code Connect** requires Figma Organization/Enterprise. Mappings live in `figma.config.json`; add `*.figma.tsx` next to components when the plan allows.

---

## Design system structure

### 1. Token definitions

**Primary location:** `src/styles/foundation.css`

Warm monochrome palette with shadcn semantic aliases:

```css
:root {
  --wl-bg: #f7f7f5;
  --wl-surface: #ffffff;
  --wl-ink: #1d1d1f;
  --wl-muted: #6e6e73;
  --wl-line: #deded9;
  --primary: var(--wl-accent);          /* #27272a — graphite accent */
  --background: var(--wl-bg);
  --foreground: var(--wl-ink);
  --card: var(--wl-surface);
  --border: var(--wl-line);
}
```

**Figma variable collections** (same file, 45+ variables):

- Wireline Primitives — raw hex (`color/wl-bg`, `color/wl-ink`, …)
- Wireline Semantic — shadcn aliases with WEB syntax `var(--background)`, `var(--primary)`, …
- Wireline Spacing — `space/1` … `space/12` (see **Foundations / Spacing** page)
- Wireline Radius — `radius/sm` … `radius/2xl`

**Tailwind theme:** `src/index.css` maps `--color-brand` → `var(--primary)` for legacy utility compatibility.

**Class constants:** `src/lib/wireline-design-system.ts` (`WL_APP_CLASSES`, `WL_COMPOSER_CLASSES`, `WL_BRAND`).

**Patterns CSS:** `src/styles/design-system.css`, `src/styles/workspace-buttons.css`.

### 2. Component library

| Layer | Path | Notes |
|-------|------|-------|
| shadcn primitives | `src/components/ui/shadcn/` | Button, Input, Card, Checkbox, Command |
| Product patterns | `src/components/ui/EmptyState.tsx`, `SectionHeader.tsx` | Use `WL_APP_CLASSES` |
| App shell | `src/components/WorkspaceShell.tsx` | 212px sidebar, 6 nav items |
| Workspace pages | `src/pages/*Page.tsx` | Wrap content in `WorkspaceShell` |

**Figma component pages:** Components / Button, Input, Card, EmptyState, NavLink · Patterns / Workspace Shell.

**Do not use:** `wireline-director-design.ts` (deleted). Copy/data for fleet coach lives in `src/lib/director-copy.ts` only.

### 3. Frameworks & libraries

- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS v4** (`@import "tailwindcss"` in `index.css`)
- **React Router** for workspace routes
- **lucide-react** for icons (match Figma nav labels: Studio, Agents, Knowledge, Actions, Live, Settings)
- **motion/react** for light transitions on legacy surfaces only

### 4. Asset management

- Static assets: `public/` and `src/assets/`
- Image pipeline: `npm run assets` → `scripts/render-image-assets.mjs`
- No CDN-specific design tokens; use relative `/` paths in app

### 5. Icon system

- **Product UI:** `lucide-react` imports per component
- **Marketing:** `src/components/layout/IntegrationLogos.tsx`, brand marks in `public/`
- **Naming:** PascalCase component names (`WandSparkles`, `Bot`); Figma NavLink labels are sentence case

### 6. Styling approach

**Order of precedence for workspace routes:**

1. Semantic CSS variables (`bg-card`, `text-muted-foreground`, `border-border`)
2. Workspace utilities (`wl-surface`, `wl-stat-strip`, `wl-segmented`, `workspace-btn-primary`)
3. Typography utilities (`wl-text-title`, `wl-text-micro`, `wl-label` in `design-system.css`)
4. `WL_APP_CLASSES` from `wireline-design-system.ts` for shared panels/settings

**Global imports** (`src/main.tsx` → `index.css`):

```
foundation.css → design-system.css → workspace-buttons.css → monochrome-guard.css → readability-guard.css
```

**Legacy guard:** `monochrome-guard.css` neutralizes retired purple/cyan Tailwind utilities on lazy-loaded legacy routes until those modules are removed.

**Avoid:** hardcoded `#7C3AED`, `velvet`, `studio-home` layout, `WIRELINE_DESIGN_UI`, no-code website builder patterns.

### 7. Project structure

```
src/
  components/
    WorkspaceShell.tsx      # App chrome — match Figma Patterns / Workspace Shell
    StudioWorkspaceV2.tsx   # /studio
    ui/shadcn/              # Primitives
  pages/                    # Workspace routes (Agents, Knowledge, Actions, Live, Settings)
  styles/
    foundation.css          # Tokens
    design-system.css       # wl-panel, wl-label, composer chrome
    workspace-buttons.css   # workspace-btn-*, wl-surface
  lib/
    figma-design-system.ts  # Route ↔ Figma frame map
    wireline-design-system.ts
    director-copy.ts        # Fleet coach strings only (not styling)
```

**Workspace nav (canonical):**

| Route | Nav label | Page title | Figma page |
|-------|-----------|------------|------------|
| `/studio` | Studio | Studio | Product / Studio |
| `/agents` | Agents | Agents | Product / Agents |
| `/knowledge` | Knowledge | Knowledge | Product / Knowledge |
| `/integrations` | Actions | Actions | Product / Actions |
| `/ops` | Live | Live | Product / Live |
| `/settings` | Settings | Settings | Product / Settings |

---

## Figma screen specs

All product frames: **1440×900**, fixed **212px** sidebar + fluid main (1228px). Pattern reference: `Patterns / Workspace Shell`.

| Frame | States |
|-------|--------|
| `/studio/default` | Chat + build map + roster |
| `/studio/create-modal` | Modal overlay on studio |
| `/agents/list-default` | Agent grid |
| `/agents/empty` | Empty state |
| `/agents/loading` | Skeleton |
| `/agents/degraded` | Warning banner |
| `/knowledge/default` | Facts / rules / tone |
| `/knowledge/empty` | No agent yet |
| `/integrations/default` | Per-agent action toggles |
| `/ops/live-default` | Live tab |
| `/ops/handoffs-default` | Handoffs tab |
| `/ops/review-default` | Review tab |
| `/settings/default` | Settings cards + powered-by strip |

---

## Implementation checklist (design → code)

1. Read frame in Figma (`get_design_context` or screenshot); treat React+Tailwind output as structure only.
2. Map colors to `var(--*)` / Tailwind semantic classes — never copy literal Figma RGBA into TSX.
3. Reuse `WorkspaceShell`, `wl-surface`, `workspace-btn-primary|secondary`, shadcn primitives.
4. Match typography: eyebrow `text-[10px] uppercase tracking-[.16em]`, title `text-[22px]–[28px] font-semibold tracking-[-.04em]`.
5. Update `FIGMA_SCREENS` in `figma-design-system.ts` when adding states.
6. Run `node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit` before shipping.

---

## Purged / retired

- `wireline-director-design.ts` — removed; use `wireline-design-system.ts` + `director-copy.ts`
- `WIRELINE_DESIGN_UI` / Stitch / no-code website builder
- Lavender/violet brand system (`#7C3AED`, `WIRELINE_DIRECTOR_BRAND.violet`)
- Orphan `wl-panel` without CSS — fixed in `design-system.css`

Legacy routes outside `WorkspaceShell` still carry `text-brand/*` utilities; `monochrome-guard.css` remaps them to graphite until those modules are deleted.

`wireline-ops-design.ts` remains for legacy ops/admin channels (Command Center, inbox, insights) — separate from workspace shell; do not extend for new workspace UI.

Stitch / Wireline Design preview (`design-preview-route.ts`, director stitch metadata) is retired product surface; Studio uses `StudioWorkspaceV2` only.
