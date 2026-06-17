# Wireline Beast — design & UX bar

Apply on every surface touched during live QA. Feeds **scorecard dimension 6**
(Design & craft, 10%). Fixes use **wireline-design** rules + **shadcn** primitives.

**Intent:** Wireline should feel like **mission control**, not a template AI dashboard.
If Director/shell could be mistaken for ChatGPT in a sidebar → log **MOAT** + design P1.

## Product identity

- **Editorial cream / velvet purple** — mission control, not generic SaaS
- **Orchestration** — Director is the spine; fleet workspaces are tools
- **Trust** — approvals, DNC/audit clarity, live vs proposed actions
- **Instrument-grade density** on ops tables; airy on empty states

Read before coding: `.cursor/skills/wireline-design/wireline-system.md`,
`csp-theming.md`, `surfaces.md`.

## Severity (match beast report)

| Tier | Examples |
|------|----------|
| P0 | Clipped layout, broken stream, unreadable contrast, dead-end CTA |
| P1 | Off-brand hue, missing empty/loading/error, touch < 44px |
| P2 | Copy tone, motion polish, density |

## P0 file targets

| Surface | Files |
|---------|-------|
| Director | `DirectorWorkspace.tsx`, `director/*`, `wireline-director-design.ts` |
| Shell | `AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx`, `index.css` |
| Painter | `pages/Design.tsx`, Painter thread in `DirectorWorkspace` |

## Non-negotiables

1. **Palette** — `BRAND`, `--primary`, `--color-brand`. No new decorative blues/teals.
2. **Surfaces** — `wl-panel`, `bg-card`, `paper-texture`. Glass only on chrome/modals.
3. **Typography** — Plus Jakarta UI; `wl-label` / `app-section-title` for section labels.
4. **CSP** — No `style={` or `<style>` in TSX. Use `data-accent`, `index.css` utilities.
5. **Director** — `WL_DIRECTOR_CLASSES` + copy from `wireline-director-design.ts`.
6. **Motion** — Respect `prefers-reduced-motion`; `touch-press` on mobile CTAs.

## shadcn (this repo)

- Primitives: `src/components/ui/shadcn/` (`ShadButton`, `Tabs`, `Card`, …)
- Extend via `index.css` CSS variables — not per-screen hex overrides
- **Settings:** `Tabs` + `Card` + form fields
- **Tables/dashboards:** `Card` + `Badge` + `Table` + `DropdownMenu`
- **Destructive:** `AlertDialog`, not `Dialog`
- **Mobile nav:** `Sheet` + hamburger (already in shell)
- **Empty/loading/error:** `Card` + `Skeleton` + inline `Alert` — never bare text
- Sizing via Tailwind classes (`h-10 w-10`), not fictional `size` props on Avatar
- Use `cn()` from `@/lib/utils`

## Live QA visual checks

At **1440px** after clicking each major route:

- [ ] Main content clears sidebar (`padding-left` ≈ rail width)
- [ ] Page title visible (not clipped left)
- [ ] Primary CTA visible without horizontal scroll
- [ ] Tab labels readable; active tab obvious

At **390px**:

- [ ] Hamburger opens full nav
- [ ] Composer chips scroll/wrap; send button reachable
- [ ] Approval cards tappable (44px min)

## Anti-patterns (log as P1/P2)

- Purple gradient hero + three cards on **app** surfaces
- Hover-only actions on touch flows
- Generic AI copy ("Unlock the power of…")
- Nested cards inside cards
- Raw HTML buttons when shadcn exists

## After UI code changes

```bash
npm run csp:check    # if styling touched
npm run test:design    # if director contract touched
npm run verify         # before declaring production-ready
```
