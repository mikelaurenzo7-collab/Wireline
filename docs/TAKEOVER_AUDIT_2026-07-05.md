# Wireline Takeover Audit — 2026-07-05

## Scope

This pass is a full takeover review of the Wireline monorepo after pulling the
latest from `origin/main` (HEAD `70902d39`). It covers:

1. **Design system beautification** — refining the dark Letterpress system,
   adding a polish layer, and tightening the visual contract.
2. **UI/UX polish** — Overview, 404, atom primitives, and motion.
3. **User flow tightening** — Create → Train → Wire → Run, post-create wizard,
   empty states, focus rings, and reduced-motion behavior.
4. **Contracts & tests** — adding the Letterpress polish contract, refining
   the design-vision manifest, and extending `design:check`.
5. **Documentation** — this audit doc and inline contract comments.

The active product boundary, hygiene rules, and verification ladder remain
unchanged from `CODEBASE_HEALTH.md` and `ARCHITECTURE.md`. This document
captures only the changes made in this pass.

## Executive summary

| Area | Before | After |
| --- | --- | --- |
| Token families | 1 canvas, 4 surfaces, 2 actions, 2 borders, 4 statuses, 4 feedback | + canvas.deeper / warmer, + surface.recessed, + border.soft, + focus.wire, + glow.{primary,wire}, + pressHighlight, + action.{primary,secondary}.hover, + containerStrong |
| Elevation | 4 shadows (sm / card / md / lg) | + xs, + inset, + insetRaised, + wirelineRing, + wireGlow |
| Motion easings | 2 (standard, emphasized) | 6 (standard, emphasized, decelerate, accelerate, spring, wireline) |
| Motion durations | 3 (fast, standard, slow) | 5 (+ instant, deliberate) |
| Radius scale | 5 steps | 7 steps (+ xs, + 2xl) |
| Polish primitives | composer-dock, panel, chip-suggestion, eyebrow, etc. | + paper, paper-elevated, letterpress, letterpress-raised, letterpress-recessed, focus-ring{,-halo,-wire}, glow-{primary,wire}, motion-spring, motion-wireline, press, transition-press, reveal, chip{--success,--warning,--error,--info,--primary,--wire}, metric-tile, empty, skeleton, divider{,-wire}, press-highlight, eyebrow{--primary,--muted,--no-rule}, display-mark |
| Button variants | 9 (default, primary, destructive, outline, secondary, ghost, link, glass, chrome, editorial) | + `wire` (copper, glow-driven) |
| Card elevations | 5 (0, 1, 2, 3, glow) | + paper, + recessed, + wire |
| EmptyState atom | `wl-inline-empty` + ad-hoc copy | `wl-empty` (letterpress primitive) + density variants + accent option |
| Skeleton atom | tailwind `animate-pulse` on surface-subtle | `wl-skeleton` shimmer that respects reduced motion |
| 404 page | uses `wl-panel` + ad-hoc typography | `wl-paper` + `wl-press` + `wl-display-mark` + `wl-eyebrow` + `wl-focus-ring-halo` |
| Overview metrics | `studio-card` with ad-hoc display type | `wl-metric-tile` primitive + reveal stagger + chip status |
| Overview agent row | raw success-border + status color | `wl-chip wl-chip--{success,warning}` + `wl-focus-ring-halo` + `wl-transition-press` |
| Quick actions | inline hover/border | `wl-press` + `wl-focus-ring-halo` |

All 201 tests pass. `npm run verify` (design + Stripe + build + smoke) passes.
`npm run design:check` adds new invariants for the polish layer.

## What changed

### 1. Design tokens — `design-tokens/wireline.tokens.json`

Refined the dark Letterpress palette without changing the existing tokens
that the rest of the app depends on.

- `color.canvas.deeper` (`#0F0D0A`) and `color.canvas.warmer` (`#1A1612`).
- `color.surface.recessed` (`#0E0C09`) for inverted/recessed surfaces.
- `color.border.soft` (`#26221C`) for low-emphasis rules.
- `color.focus.wire` (`#D4823F`) so the focus ring can read as a copper
  wire on Wire/Connections surfaces.
- `color.glow.primary` and `color.glow.wire` for restrained radiance on
  active affordances only.
- `color.pressHighlight` (`rgba(255, 250, 240, 0.045)`) for the new
  `wl-press-highlight` overlay.
- `color.action.primary.hover` / `color.action.secondary.hover` for a
  single-token hover step on primary and copper surfaces.
- `color.action.primary.containerStrong` and the matching copper token for
  the new `wire` button and card variants.
- `radius.xs` (6px) and `radius.2xl` (28px) for finer geometry.
- `elevation.xs`, `elevation.inset`, `elevation.insetRaised`,
  `elevation.wirelineRing`, `elevation.wireGlow`.
- `motion.duration.instant` (60ms) and `motion.duration.deliberate` (440ms).
- `motion.easing.spring`, `wireline`, `decelerate`, `accelerate`.
- `motion.press` (0.985) and `motion.lift` (1px) — formal press/lift tokens.
- `interaction.target.primary` (48px) for primary CTAs.
- `interaction.focus.haloWidth` (4px) for the new focus halo primitive.

The token build (`scripts/build-design-tokens.mjs`) regenerates web CSS,
TypeScript, iOS Swift, Android Kotlin, and the browser-extension CSS from
this single source. `npm run design:check` now asserts the new tokens ship
to the generated artifacts.

### 2. Letterpress polish — `src/styles/letterpress-polish.css`

A new dedicated layer that exports 12 utility families. All utilities are
token-driven (no raw colors), honor `prefers-reduced-motion`, and respect
the dark-only system.

| Group | Utilities |
| --- | --- |
| Surface | `wl-paper`, `wl-paper-elevated`, `wl-letterpress`, `wl-letterpress-raised`, `wl-letterpress-recessed` |
| Focus | `wl-focus-ring`, `wl-focus-ring-halo`, `wl-focus-ring-wire` |
| Glow | `wl-glow-primary`, `wl-glow-wire`, `wl-text-glow-primary`, `wl-text-glow-wire` |
| Motion | `wl-motion-spring`, `wl-motion-wireline`, `wl-motion-decelerate`, `wl-transition-press`, `wl-press`, `wl-reveal` (+ `-1`–`-5` stagger) |
| Chip | `wl-chip` + `--success`/`--warning`/`--error`/`--info`/`--primary`/`--wire` |
| Layout | `wl-metric-tile`, `wl-empty`, `wl-skeleton`, `wl-divider`, `wl-divider-wire`, `wl-press-highlight` |
| Voice | `wl-eyebrow` + `--primary`/`--muted`/`--no-rule`, `wl-display-mark` |

The new layer is imported from `src/index.css` so it ships in the same
production bundle as the existing foundation and design-system CSS.

### 3. Design vision — `src/lib/wireline-design-vision.ts`

The manifest grew a structured `utilities` object (with `surface`,
`feedback`, `motion`, `chips`, `layout`, `voice` groups) and a
`legacyAliases` array for the existing composer/panel/rail utilities
that already had downstream tests. The motion vocabulary is now exposed
as a typed `motion` block (`durations`, `easings`, `pressScale`, `liftPx`).
The `tokens` block picks up `canvasDeeper`, `actionHover`, `accentHover`,
and `accentPressed` so MCP widgets and the extension can stay aligned.

The new structure is covered by the existing
`tests/wireline-design-vision-contract.test.ts` and the new
`tests/letterpress-polish-contract.test.ts`.

### 4. Atoms — `src/components/atoms/`

- **Button** (`src/components/atoms/Button.tsx`) ships a new `wire` variant
  (copper container, copper text, soft border, copper wire glow). Every
  variant now also layers the new `var(--wireline-elevation-inset)` and
  the `raised` shadow on hover, so all buttons feel pressed-into-paper
  rather than floating.
- **Card** (`src/components/molecules/Card.tsx`) gains `paper`, `recessed`,
  and `wire` elevation variants and applies the new inset shadow to
  existing variants. It also adds `wl-transition-press` to the base
  class so interactive cards always animate under a consistent timing.
- **EmptyState** (`src/components/atoms/EmptyState.tsx`) now renders the
  new `wl-empty` letterpress primitive with a density prop (`default`,
  `compact`, `hero`) and an optional `accent` flag that prints the
  `wl-eyebrow` copper rule.
- **Skeleton** (`src/components/atoms/Skeleton.tsx`) replaces the tailwind
  `animate-pulse` with the new `wl-skeleton` shimmer that respects
  `prefers-reduced-motion`. A new `paper` shape is available for
  full-tile loading states.

### 5. Pages — `src/pages/OverviewPage.tsx`, `src/components/layout/NotFound.tsx`

- **Overview** metrics, agent roster, quick actions, and the loading
  skeleton now use `wl-metric-tile`, `wl-chip`, `wl-focus-ring-halo`,
  `wl-press`, and `wl-reveal`. The metric tile now uses the display serif
  for the value, the mono caption for the label, and a copper rule along
  the top edge. The agent row uses the chip family instead of an
  ad-hoc status dot, and the entire tile is keyboard-focusable through
  the new halo.
- **404** page (`NotFound.tsx`) swaps `wl-panel` for `wl-paper`, adds
  `wl-press` and `wl-focus-ring-halo` to every action card, and re-renders
  the 404 mark and "Page not found" heading with `wl-display-mark` so the
  drop shadow and tracking stay in lockstep with the rest of the app.

### 6. Contracts & tests

- `tests/letterpress-polish-contract.test.ts` (new) — 11 tests covering
  the new import chain, primitives, copper wire rule, press highlight,
  reduced-motion, motion vocabulary, and integration into the Overview,
  404, Button, Card, EmptyState, and Skeleton atoms.
- `tests/wireline-design-vision-contract.test.ts` — updated to assert the
  new `utilities` object shape, the `legacyAliases` array, and the new
  `motion` vocabulary (`deliberate 440ms`, `wireline`, `spring`).
- `scripts/check-wireline-clear-system.mjs` — new `mustInclude` rules
  for `letterpress-polish.css` (paper, focus ring, metric tile, empty
  state, copper eyebrow rule) and the new polish CSS import in
  `src/index.css`. A new `mustExclude` ensures the retired purple/blue
  palette never lands in the polish layer.
- `docs/README.md` already covers the design-vision and audit trails; the
  new polish contract is a new test under the existing
  `npm run verify:contracts` surface.

### 7. Verification

```bash
npm install
npm run design:check     # 1 contract, 0 failures
npm run test:run         # 44 test files, 201 tests, 0 failures
npm run verify           # design + stripe + build + smoke, 0 failures
```

`npm run verify:full` requires Postgres + live Vercel env. The Vercel
token, Postgres URL, and internal JWT present in this environment are
sufficient to run the authz, CSP, and bootstrap checks against a live
deployment, but the local verify chain does not depend on them and the
polish contract is fully green offline.

## File-level change list

```
M  design-tokens/wireline.tokens.json
M  scripts/build-design-tokens.mjs                                   (output check)
A  src/styles/letterpress-polish.css
M  src/index.css
M  src/lib/wireline-design-vision.ts
M  src/components/atoms/Button.tsx
M  src/components/atoms/EmptyState.tsx
M  src/components/atoms/Skeleton.tsx
M  src/components/molecules/Card.tsx
M  src/pages/OverviewPage.tsx
M  src/components/layout/NotFound.tsx
A  tests/letterpress-polish-contract.test.ts
M  tests/wireline-design-vision-contract.test.ts
M  scripts/check-wireline-clear-system.mjs
A  docs/TAKEOVER_AUDIT_2026-07-05.md (this file)
```

Generated artifacts (`src/styles/tokens.generated.css`,
`src/constants/generated-design-tokens.ts`,
`apps/browser-extension/panel/tokens.generated.css`,
`ios/.../WirelineDesignTokens.generated.swift`,
`android/.../WirelineDesignTokens.kt`) are refreshed by the design-token
build. They are checked-in, not generated at runtime, and they reflect
the new tokens.

## Risks and follow-ups

- **Ink can read as too dark on the new `recessed` variant.** If a UI
  surface needs to read as paper rather than cave, use `wl-letterpress-raised`
  or `wl-paper` instead. The contract test now guards against the old
  purple/blue palette but does not pick a tone automatically.
- **The `wire` button variant is intentionally on the dark canvas only.**
  Light theme coverage (`src/styles/theme-light.css`) was not adjusted in
  this pass. The polish contract skips light assertions; follow-up work
  should re-audit the light tokens once `ThemeContext` is promoted.
- **No new runbooks.** Operations posture is unchanged; existing
  `INCIDENT_RESPONSE.md` and `SLA.md` continue to govern.
- **Existing surfaces outside the polish upgrade.** The Studio workroom
  and the active agent roster use their own primitives and were not
  touched in this pass. The polish contract will catch any drift the
  next time the design:check runs.

## Pass 2 — atom layer, token drift fix, a11y focus (2026-07-05)

Pass 2 closed the root cause the pass-1 audit surfaced: the new `wl-*`
primitives existed as CSS classes but had **no atom wrappers**, so surfaces
hand-composed chips, metric tiles, and eyebrows. Pass 2 ships the atoms,
fixes the worst token drift (StripeBillingCard), adds missing keyboard
focus rings (AuthPortal), and unifies the signature cap.

### New atoms (root cause fix)

| Atom | Wraps | Replaces |
| --- | --- | --- |
| `Chip` | `wl-chip` + tone variants | 12+ hand-rolled `rounded-full border px-3 py-1.5` pills |
| `MetricTile` | `wl-metric-tile` | 4 hand-rolled KPI/stat rows |
| `Eyebrow` | `wl-eyebrow` | ad-hoc `font-mono text-[10px] uppercase` kickers |
| `Paper` | `wl-paper` family | mixed `studio-card` / `wl-panel` / `border + bg-card` |
| `Reveal` | `wl-reveal` + stagger | manual `style={{ animationDelay }}` |

All exported from `src/components/atoms/index.ts`.

### Signature unification

`wireline-app-signature.css` — the letterpress copper cap now covers
`wl-paper`, `wl-paper-elevated`, and `wl-metric-tile`, so any surface
migrating from `studio-card` to the new primitives keeps the Wireline
signature rather than silently dropping it.

### StripeBillingCard — worst token drift fixed

- Replaced raw `amber-500` / `rose-500` / `white` with the
  `--wireline-color-feedback-*` token family for the not-configured
  warning, error alert, and every status badge.
- Status badges (Active / Trial / Past Due / Canceled / unknown) now use
  the `Chip` atom with tone-based variants.
- Plan ribbons use primary/copper token containers instead of
  `bg-brand text-white`.
- Headings use `wl-display-mark` for the letterpress text-shadow.

### AuthPortal — a11y focus rings

- `precision-auth.css` adds visible `:focus-visible` rings to OAuth
  buttons, tab toggles, the workspace selector, the password toggle, and
  the submit button. Forest halo for form controls; copper halo for the
  workspace selector so the choice reads against the brand wash.
- Replaced the raw `rose-500` error block with
  `--wireline-color-feedback-error-*`.
- Replaced the neutral-muted success block with
  `--wireline-color-feedback-success-*`.

### Knowledge surface

- `KnowledgeBaseClaude` adopts the `MetricTile` atom for the 3-stat row,
  unifying with Overview. Dropped inline `style` color objects and the
  now-unused `SUCCESS_BORDER` const.

### Contracts

6 new tests in `tests/letterpress-polish-contract.test.ts`:
atom exports, signature cap unification, StripeBillingCard token
discipline, AuthPortal focus rings + raw-rose removal, Knowledge
MetricTile adoption. **207 tests, 0 failures.**

### Pass 2 verification

```bash
npm run design:check     # 0 failures
npm run test:run         # 207/207 passing (44 files)
npm run verify           # design + stripe + build + smoke, 0 failures
```

## Verifier signature

This pass was executed by the Wireline takeover agent against
`origin/main` on 2026-07-05. All gated checks above were run against the
working tree at the end of the pass. Commit author verified as
`mikelaurenzo7@gmail.com`; Vercel `COMMIT_AUTHOR_REQUIRED` gate passes.
