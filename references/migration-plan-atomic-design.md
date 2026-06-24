# Wireline Atomic Design Migration Plan

## Objective

Turn the authenticated Wireline product into one coherent, accessible, and maintainable UI system without a disruptive rewrite. The system uses Tailwind v4 for layout and token utilities, `class-variance-authority` for finite component variants, and semantic Wireline tokens for color, state, and elevation.

This is a **composition discipline**, not a folder-renaming exercise. A component is extracted only when it has a repeated visual and behavioral contract.

## Current baseline

- `src/styles/foundation.css` owns semantic tokens, interaction defaults, and reduced-motion behavior.
- `src/components/atoms/` owns small, business-agnostic controls.
- `src/components/molecules/` owns repeated combinations of atoms.
- `src/components/organisms/` owns substantial product sections and patterns.
- Existing `src/components/ui/shadcn/` primitives remain supported during transition; do not duplicate or fork their behavior casually.
- `WorkspaceShell` remains the single authenticated-app frame.

## Layering rules

| Layer | Purpose | May import |
| --- | --- | --- |
| Atoms | Finite visual and interaction primitives | utilities, Radix primitives, icons |
| Molecules | One clear reusable UI job | atoms |
| Organisms | Meaningful operational region | atoms, molecules |
| Features/pages | Domain workflow and data binding | all lower layers |

A page may use an atom directly when no reusable molecule is warranted. Do not create a molecule solely to obey a taxonomy.

## Canonical contracts

### Tokens

- Use semantic tokens such as `--wl-success-surface` and `--wl-error`, never raw color utility families for product status.
- Use Tailwind `@theme` only for durable utility-generating values such as fonts, radii, and shadows.
- Use normal CSS variables in `foundation.css` for runtime semantic aliases.

### CVA

Use CVA where a component has finite, named visual options: intent, tone, size, density, elevation, or emphasis. Do not use CVA for one-off page grids, arbitrary layout wrappers, or business logic.

### Accessibility

- Native HTML semantics first.
- Icon-only actions require an accessible label.
- Hover-only information is prohibited; use the canonical tooltip primitive.
- Tables remain semantic tables. Only introduce `role="grid"` after implementing the keyboard interaction contract that role requires.
- Every async action communicates loading and disabled state.

## Migration sequence

### Phase 1 — Foundations

1. Complete CVA-backed atoms: Button, IconButton, Badge, Skeleton, EmptyState, form controls, tooltip/help affordances.
2. Replace raw status colors with semantic status tokens.
3. Keep the root style entrypoint small: foundation, typography, component primitives, and deliberate feature styles only.
4. Add component-contract tests before broad rollout.

### Phase 2 — Shared operational patterns

1. FormField, SearchField, filters, metric cards, action menus, confirmation flows.
2. Semantic DataTable with loading, empty, sorting, responsive overflow, and clear row-action rules.
3. Standardized loading, empty, error, and degraded states.
4. WorkspaceShell, page headers, toolbars, and split-pane behavior.

### Phase 3 — Feature rollout

Migrate in business-value order:

1. Studio and Assistant fleet
2. Overview and Inbox
3. Knowledge and Training
4. Actions and integration permissions
5. Settings, billing, and team management
6. Lower-frequency admin and legacy routes

### Phase 4 — Retirement and governance

1. Remove retired `wl-*` compatibility classes only after all consumers move.
2. Consolidate temporary "pass" styles into their owning component or feature stylesheet.
3. Reject new raw palette classes in authenticated product UI.
4. Require responsive, keyboard, and loading/error review for every shared component change.

## Definition of done

The migration is complete only when:

- authenticated routes share a consistent shell, header, spacing, and status language;
- high-frequency actions use canonical Button and IconButton contracts;
- high-frequency lists use a canonical table/list-detail pattern;
- every repeated form field, empty state, loading state, and error state has a shared implementation;
- no new production UI relies on hover-only help or raw status colors;
- visual checks cover 390px, 1280px, 1440px, 1600px, and 1920px; and
- type, test, accessibility, build, and server-import checks remain green.

## Governance

Every new shared component must document:

- its visual variants;
- its semantic and keyboard contract;
- the token family it consumes;
- whether it belongs in atom, molecule, organism, or a feature folder; and
- one real production consumer before it becomes a public design-system API.
