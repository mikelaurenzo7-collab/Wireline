# Atomic Design Migration — Completion Standard

## Decision

Wireline uses a pragmatic atomic design system, not a folder taxonomy for its own sake. The purpose is to create **one canonical implementation** for recurring interaction patterns while retaining stable compatibility import paths during the transition.

The previous migration created the initial `atoms/` directory and documented the intended hierarchy. This document is the execution contract for completing it safely.

## Current Architecture

```text
src/components/
├── atoms/       # canonical primitives and finite visual variants
├── molecules/   # reusable combinations with one interaction purpose
├── organisms/   # route-level interface sections
├── ui/shadcn/   # compatibility import paths during migration
└── …            # established product/domain components
```

### Non-negotiable rules

1. **One canonical primitive per interaction.** Button, Input, Textarea, NativeSelect, Badge, Skeleton, and HelpTooltip live in `atoms/`. Legacy paths re-export or adapt to the atom; they do not fork behavior.
2. **Variants live in `cva`.** Semantic options are typed, discoverable, and testable. Call-site `className` is for layout or a local exception, not for reimplementing a variant.
3. **Accessibility is part of the component contract.** Focus visibility, keyboard operation, invalid states, labels, descriptions, and screen-reader status are default behavior.
4. **Migration is additive first.** New and materially changed surfaces import canonical atoms. Legacy surfaces migrate when adjacent work makes the change low-risk.
5. **Do not create abstractions without repeated evidence.** A molecule must solve a recurring interaction problem, not merely wrap markup.

## Canonical Inventory

| Layer | Canonical component | Status | Primary responsibility |
| --- | --- | --- | --- |
| Atom | `Button` | Complete | Semantic actions, `asChild`, focus and disabled states |
| Atom | `Input` | Complete | Typed state variants and invalid semantics |
| Atom | `Textarea` | Complete | Long-form text input, resize, and invalid semantics |
| Atom | `NativeSelect` | Complete | Simple, native keyboard-selectable choices |
| Atom | `Badge` | Complete | Semantic status and metadata treatment |
| Atom | `Skeleton` | Complete | Text, circle, control, and surface loading affordances |
| Atom | `EmptyState` | Complete | Empty-result framing |
| Atom | `Toast` | Complete | Notification tone and live-region semantics |
| Atom | `HelpTooltip` | Complete | Radix-backed contextual help, focus, placement, and semantic trigger behavior |
| Molecule | `FormField` | Complete | Label, help, error, and described-by relationship |
| Molecule | `SearchField` | Complete | Search affordance with predictable clear behavior |
| Molecule | `MetricCard` | Complete | Operational metric with contextual trend |
| Molecule | `StatusNotice` | Complete | Semantic inline feedback for service, warning, and account-action states |
| Organism | `PageShell` | Registered | Responsive page anatomy and tabs |
| Organism | `CommandBar` | Complete | Mounted workspace command palette with route-safe navigation and keyboard contract |

## Completed Adoption Waves

### Primitive compatibility closure

- `ShadButton`, Input, Badge, Skeleton, and Textarea delegate to canonical atoms where the interaction is equivalent.
- The legacy HelpTooltip preserves its public API while delegating to the canonical Radix-backed atom.
- Source-root aliases support both the historic `@/src/...` and concise `@/...` forms without root-level shims.

### Operational feedback and roster

- Foundation defines semantic foreground, surface, and border tokens for success, warning, error, and info states.
- Assistants uses canonical Button, Badge, Skeleton, and MetricCard patterns for creation, readiness, loading, and roster summaries.

### Inbox and create-agent workflow

- Inbox uses canonical SearchField, Badge, Button, EmptyState, and Skeleton patterns while retaining its existing API lifecycle and outcome controls.
- Studio’s create-agent dialog uses FormField, Input, Textarea, NativeSelect, and Button without changing agent creation, browser-context prefill, or training extraction behavior.

### Connections and knowledge

- Connections uses canonical Button, Badge, NativeSelect, EmptyState, and Skeleton patterns around its domain-specific permission rows.
- Knowledge uses canonical EmptyState, Button, and NativeSelect patterns for its first-run and agent-context states.

### Command palette and workspace shell

- CommandBar is mounted once for authenticated workspace routes and is available from every workspace header as well as `⌘/Ctrl+K`.
- The command registry is limited to current routes and supported assistant-creation flows; redirect-only and retired destinations are excluded.
- Search owns selection and execute keys, the dialog owns its two-control Tab loop, and focus returns to the invoking element on close.

### Overview and settings route shells

- Overview adopts canonical actions, readiness badges, structured roster skeletons, and degraded-workspace feedback.
- Settings adopts canonical session state, sign-out actions, and account-action error treatment.
- Both routes use `StatusNotice`, establishing a shared inline feedback pattern rather than duplicating semantic surface classes.

### Studio and knowledge configuration panels

- Studio’s empty and loading states now use canonical EmptyState, Button, and Skeleton treatment instead of bespoke action classes and text-only loading.
- Knowledge uses canonical NativeSelect, Input, Textarea, Button, FormField, Skeleton, EmptyState, Badge, and StatusNotice patterns across its mobile selector, editor, panel loading states, and source freshness treatment.
- Source management remains explicitly staged: the panel now communicates preview-state truthfully instead of implying fully wired actions that do not exist yet.

### Billing, team, and client surfaces

- Billing now uses canonical back-navigation and an inline informational notice instead of a bespoke receipt card treatment.
- Team uses canonical back-navigation, roster status badges, an RBAC notice, and a shared invite form built from Input, NativeSelect, Button, and FormField.
- Client apps uses canonical readiness badges, link actions, and a shared privacy notice instead of custom pills and banner styling.

## Adoption Order

### 1. New work — mandatory now

- Import primitives from `@/components/atoms`.
- Prefer FormField, SearchField, MetricCard, and StatusNotice when the interaction matches.
- Import PageShell and CommandBar from `@/components/organisms` in new route-level work.

### 2. High-traffic migrations — next

1. Conversation, call, and other data-heavy records when a second list-detail consumer proves a shared organism
2. PageShell adoption where its responsive header or tabs replace duplicate route-specific behavior
3. Visual QA and accessibility validation across desktop, laptop, and mobile viewport tiers
4. Compatibility-export cleanup after repository-wide imports converge
5. Deprecated internal/founder surfaces only when they still materially affect shipping routes

### 3. Deliberate exceptions

- Domain components may keep local layout classes.
- Radix Select may remain in `ui/shadcn` when a non-native, composable selection pattern is genuinely required.
- Visual experiments belong behind isolated components, not extra global CSS utility families.
- A generic DataTable or ListDetailShell is deferred until two live consumers share the same keyboard and responsive contract.

## Quality Gate

`npm run design:contract` validates migration invariants:

- canonical high-value atoms use `cva` and expose stable `data-slot` hooks;
- legacy compatibility paths route to canonical atoms;
- source-root alias and public barrel contracts remain valid;
- semantic feedback tokens are present;
- high-traffic consumer adoption remains real rather than aspirational;
- the mounted command palette stays keyboard-correct and route-accurate;
- Studio and Knowledge configuration surfaces stay on canonical fields, selectors, and notices;
- Billing, Team, and Client Apps stay on canonical settings/admin controls and notices.

The guardrail grows after each adoption wave. Turning every legacy import into a hard failure before its route is safely migrated creates false urgency and encourages unsafe bulk rewrites.

## Definition of Done

The migration is complete when:

- all repeated app-wide interactions have one canonical atom or molecule;
- no two live implementations define the same Button, Input, Textarea, Badge, Skeleton, or Tooltip behavior;
- all changed routes use canonical entry points;
- targeted visual QA covers desktop, laptop, and mobile widths;
- keyboard and screen-reader behavior are validated for dialogs, menus, tabs, forms, and destructive actions;
- `design:contract`, type checking, tests, build, and visual QA pass.

## Governance

- Every new component PR declares its layer: atom, molecule, organism, or domain component.
- A new variant requires an explicit semantic use case; do not add variants for one-off colors or spacing.
- Compatibility exports are removed only after repository-wide import migration and a release window.
- Design-system changes require at least one consumer adoption in the same pull request.
