---
name: wireline-design
description: >-
  Upgrade and refine Wireline product UI — editorial cream/velvet brand,
  Director mission control, fleet workspaces, shadcn components, and
  src/index.css design system. Use when improving Wireline screens, polish,
  UX flows, rebranding in-app surfaces, or when the user mentions Wireline
  design, Director, fleet dashboard, or visual upgrade.
---

# Wireline design upgrades

Apply the **elite-product-designer** workflow (personal skill at `~/.cursor/skills/elite-product-designer/`) with Wireline-specific rules below. **Always read [wireline-system.md](wireline-system.md) before changing UI.** For file targets, see [surfaces.md](surfaces.md).

## Product lens

Wireline is an **AI fleet operations** product: founders and ops leads run agents across phone, email, SMS, and integrations. UI should feel **editorial, calm, and instrument-grade** — mission control, not generic SaaS or flashy “AI app.”

| Pillar | Meaning |
|--------|---------|
| **Paper & velvet** | Warm cream light mode; deep purple-black dark mode; subtle grain |
| **Orchestration** | Chat/Director is the spine; side panels are tools |
| **Trust** | Approvals, compliance (DNC/audit), clear live vs proposed actions |
| **Density when needed** | Ops, logs, pipeline — scannable tables; marketing stays airy |

## Upgrade workflow (this repo)

```
1. Read wireline-system.md + affected components
2. Audit: off-brand colors, raw hex, missing states, layout breaks
3. Spec: screen spec (elite-product-designer template)
4. Implement: tokens in index.css → shared classes → TSX (minimal diff)
5. Verify: dark mode, 320px, focus rings, prefers-reduced-motion
6. Run tests if touching wireline-director-design or shadcn ratchet
```

Track multi-screen work:

```
Wireline design upgrade:
- [ ] Audit complete (list P0/P1/P2)
- [ ] Tokens / CSS utilities (if needed)
- [ ] Component(s) updated
- [ ] Copy from wireline-director-design or new constants
- [ ] Empty / loading / error / streaming states
- [ ] Dark + mobile pass
```

## Non-negotiables

1. **Palette** — Purple + cream only. Use `BRAND` (`src/constants/brand-colors.ts`), CSS vars (`--primary`, `--color-brand`), or Tailwind remapped scales. **No** decorative blue/orange/teal (legacy `emerald-*` / `sky-*` are remapped — don’t introduce new hues).
2. **Surfaces** — Prefer `wl-panel`, `wl-panel-elevated`, `bg-card`, `paper-texture` over ad-hoc `bg-white/10`. Glass (`glass-1`, `glass-2`) only for sticky chrome/modals — not every card.
3. **Backdrop** — `AuroraBackdrop` is calm paper/velvet — **do not** add heavy purple/teal aurora washes behind data UI.
4. **Typography** — Plus Jakarta Sans (UI), Fraunces italic (display/marketing), JetBrains Mono (data/code). Section labels: `app-section-title` or `wl-label`, not random `text-[10px]`.
5. **Motion** — `motion-editorial` / `motion-snappy`; `touch-press` on mobile CTAs. Respect `prefers-reduced-motion` (already in index.css for director shimmer, orbit).
6. **Director** — Use `WL_DIRECTOR_CLASSES` and copy from `src/lib/wireline-director-design.ts`; update tests in `wireline-director-design.test.ts` if contract changes.
7. **shadcn** — Components live under `src/components/ui/shadcn/`. Extend via `src/index.css` theme vars, not one-off overrides per screen.

## Anti-patterns (reject in reviews)

- Purple gradient hero + three feature cards on **app** surfaces
- Competing full-width colored panels (sidebar already carries brand weight)
- Hover-only actions on touch-primary flows
- Generic AI copy (“Unlock the power of…”) — use Director tone: specific, operator-facing
- New inline `#hex` when a token exists
- Disabling `scroll-viewport` / breaking AppShell scroll lock

## Implementation map

| Layer | Location |
|-------|----------|
| Tokens, utilities, Director CSS | `src/index.css` |
| Brand constants | `src/constants/brand-colors.ts` |
| Director contract | `src/lib/wireline-director-design.ts` |
| App chrome | `src/components/layout/AppShell.tsx`, `TopBar.tsx`, `Sidebar.tsx`, `AuroraBackdrop.tsx` |
| shadcn | `src/components/ui/shadcn/`, `components.json` |
| Shared UI | `src/components/ui/` (`EmptyState`, `SectionHeader`, `LiveTaskPipeline`, …) |

## How to ask the agent

Examples that should load this skill:

- “Upgrade the Founder dashboard to match Director mission control.”
- “Wireline design pass on Agent workspace — hierarchy and empty states.”
- “Polish integration live cards; stay on-brand.”
- “Audit `/agents` for off-brand colors and fix.”

Explicit: **“Use wireline-design on [screen/feature].”**

## Related skills

| Skill | When |
|-------|------|
| elite-product-designer | Process, specs, critique format |
| shadcn | Adding/changing UI primitives |
| react-best-practices | After multi-file TSX edits |
| canvas | Design audit dashboards |

## Resources

- [DESIGN.md](../../../DESIGN.md) — canonical Aurora Cream design system (repo root)
- [wireline-system.md](wireline-system.md) — tokens, classes, voice, accessibility
- [surfaces.md](surfaces.md) — priority screens and file paths
