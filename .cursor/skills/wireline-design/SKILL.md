---
name: wireline-design
description: >-
  Upgrade and refine Wireline product UI — editorial cream/velvet brand,
  Director mission control, fleet workspaces, shadcn components, CSP-safe
  dynamic theming (data-accent + index.css), and src/index.css design system.
  Use when improving Wireline screens, polish, UX flows, rebranding in-app
  surfaces, or when the user mentions Wireline design, Director, fleet
  dashboard, visual upgrade, or CSP-safe styling.
---

# Wireline design upgrades

Apply the **elite-product-designer** workflow (personal skill at `~/.cursor/skills/elite-product-designer/`) with Wireline-specific rules below.

**Read before changing UI:**

1. [wireline-system.md](wireline-system.md) — tokens, surfaces, primitives
2. [csp-theming.md](csp-theming.md) — **required** for any dynamic color, progress, or motion styling
3. [surfaces.md](surfaces.md) — file targets by priority

## Product lens

Wireline is an **AI fleet operations** product: founders and ops leads run agents across phone, email, SMS, and integrations. UI should feel **editorial, calm, and instrument-grade** — mission control, not generic SaaS or flashy “AI app.”

| Pillar | Meaning |
|--------|---------|
| **Paper & velvet** | Warm cream light mode; deep purple-black dark mode; subtle grain |
| **Orchestration** | Chat/Director is the spine; side panels are tools |
| **Trust** | Approvals, compliance (DNC/audit), clear live vs proposed actions |
| **Density when needed** | Ops, logs, pipeline — scannable tables; marketing stays airy |
| **CSP-safe craft** | Dynamic look comes from `data-*` + CSS — not JSX `style={` or `<style>` blocks |

## Upgrade workflow (this repo)

```
1. Read wireline-system.md + csp-theming.md + affected components
2. Audit: off-brand colors, style={ / <style> regressions, missing states
3. Spec: screen spec (elite-product-designer template)
4. Implement: index.css utilities → data-* / classes → TSX (minimal diff)
5. Verify: dark mode, 320px, focus rings, prefers-reduced-motion
6. Run: npm run csp:check (if TSX/CSS styling touched), test:design, relevant unit tests
```

Track multi-screen work:

```
Wireline design upgrade:
- [ ] Audit complete (list P0/P1/P2)
- [ ] CSP-safe tokens / CSS utilities (if needed)
- [ ] Component(s) updated — no new style={ or <style> in TSX
- [ ] Copy from wireline-director-design or new constants
- [ ] Empty / loading / error / streaming states
- [ ] Dark + mobile pass
- [ ] csp:check + test:design if contract changed
```

## Non-negotiables

1. **Palette** — Purple + cream only. Use `BRAND` (`src/constants/brand-colors.ts`), CSS vars (`--primary`, `--color-brand`), or Tailwind remapped scales. **No** decorative blue/orange/teal (legacy `emerald-*` / `sky-*` are remapped — don’t introduce new hues).
2. **Surfaces** — Prefer `wl-panel`, `wl-panel-elevated`, `bg-card`, `paper-texture` over ad-hoc `bg-white/10`. Glass (`glass-1`, `glass-2`) only for sticky chrome/modals — not every card.
3. **Backdrop** — `AuroraBackdrop` is calm paper/velvet — **do not** add heavy purple/teal aurora washes behind data UI.
4. **Typography** — Plus Jakarta Sans (UI), Fraunces italic (display/marketing), JetBrains Mono (data/code). Section labels: `app-section-title` or `wl-label`, not random `text-[10px]`.
5. **Motion** — `motion-editorial` / `motion-snappy`; `touch-press` on mobile CTAs. Respect `prefers-reduced-motion` (primitives + Director shimmer in `index.css`). Library motion (Framer/Recharts) is OK under `style-src-attr`.
6. **Director** — Use `WL_DIRECTOR_CLASSES` and copy from `src/lib/wireline-director-design.ts`; update `wireline-director-design.test.ts` if contract changes.
7. **shadcn** — Components under `src/components/ui/shadcn/`. Extend via `index.css` theme vars, not one-off overrides per screen.
8. **CSP-safe styling** — No `style={` or `<style>` in `.tsx`. Dynamic accents: `data-accent` + `wl-accent-*`. Primitives: global CSS in `index.css`. Dense vendor UI: co-located `.css`. Calc gutters: `apply-dom-layout.ts`. See [csp-theming.md](csp-theming.md).

## Anti-patterns (reject in reviews)

- Purple gradient hero + three feature cards on **app** surfaces
- Competing full-width colored panels (sidebar already carries brand weight)
- Hover-only actions on touch-primary flows
- Generic AI copy (“Unlock the power of…”) — use Director tone: specific, operator-facing
- New inline `#hex` when a token exists
- Disabling `scroll-viewport` / breaking AppShell scroll lock
- **`style={` / `<style>` in TSX** — breaks CSP ratchet and security posture
- **`asStyle()` shims** — games inventory without reducing runtime inline styles
- **Per-instance `<style>` in components** — move to `index.css` with stable class/`data-uid` selectors

## Implementation map

| Layer | Location |
|-------|----------|
| Tokens, utilities, primitives, CSP data-* block | `src/index.css` |
| CSP policy | `src/lib/csp.ts`, `vercel.json` (sync via `check-csp-drift.mjs`) |
| Style inventory ratchet | `src/lib/csp-inventory.ts` |
| Imperative calc layout | `src/lib/apply-dom-layout.ts` |
| First-paint shell | `public/app-shell.css` |
| Integration preview CSS | `src/components/integrations/preview-cards.css` |
| Brand constants | `src/constants/brand-colors.ts` |
| Director contract | `src/lib/wireline-director-design.ts` |
| App chrome | `layout/AppShell.tsx`, `TopBar.tsx`, `Sidebar.tsx`, `AuroraBackdrop.tsx` |
| Identity primitives | `ui/VoidButton`, `PrismBadge`, `GlyphMorph`, `NebulaPulse`, `SignalThread`, `ConstellationField`, … |
| shadcn | `src/components/ui/shadcn/`, `components.json` |
| Shared UI | `EmptyState`, `SectionHeader`, `LiveTaskPipeline`, `Medallion`, … |

## Reference implementations (CSP + design)

| Feature | Pattern | Files |
|---------|---------|-------|
| Route accent shell | `data-accent` + `wl-accent-*` | `PageShell.tsx` |
| Integration thumbnails | co-located CSS | `PreviewCards.tsx`, `preview-cards.css` |
| Agent capability map | `data-node-*` + `wl-canvas-node` | `AgentIntegrationCanvas.tsx` |
| Marketing stickers | `applyEdgeInset` + sticker CSS | `SectionStickers.tsx` |
| Pricing spotlight | `.wl-pricing-tier--highlight` | `Pricing.tsx` |
| Toasts | `data-toast` + `.wl-toast-*` | `Toast.tsx` |
| Event-horizon CTA | `void-button` + `data-uid="void"` | `VoidButton.tsx` |

## How to ask the agent

- “Upgrade the Founder dashboard to match Director mission control.”
- “Wireline design pass on Agent workspace — hierarchy and empty states.”
- “Polish integration live cards; stay on-brand and CSP-safe.”
- “Add a progress meter with route accent — use data-accent pattern.”

Explicit: **“Use wireline-design on [screen/feature].”**

## Related skills

| Skill | When |
|-------|------|
| **wireline-beast** | Production ship gate — journeys, moat probes, scorecard ≥85, browser-only QA |
| elite-product-designer | Process, specs, critique format |
| shadcn | Adding/changing UI primitives |
| react-best-practices | After multi-file TSX edits |
| canvas | Design audit dashboards |

## Resources

- [DESIGN.md](../../../DESIGN.md) — canonical Aurora Cream design system
- [wireline-system.md](wireline-system.md) — tokens, classes, voice, accessibility
- [csp-theming.md](csp-theming.md) — Phases 0–6 dynamic styling contract
- [surfaces.md](surfaces.md) — priority screens and file paths
- [LOOP_STATE.md](../../../terminals/csp-hardening-loop/LOOP_STATE.md) — CSP phase status (agent memory)
