# Atomic Design Migration — Completion Standard

## Decision

Wireline uses a pragmatic Atomic Design system, not a folder taxonomy for its own sake. The purpose is to create **one canonical implementation** for repeated interactions while retaining stable compatibility import paths during a controlled migration.

The system is complete when new work has clear public entry points at each layer, compatibility exports delegate rather than fork behavior, and the delivery contract protects the system from drifting back into local-only controls or duplicate primitive implementations.

## Architecture

```text
src/components/
├── atoms/       # canonical primitives and finite visual variants
├── molecules/   # reusable combinations with one interaction purpose
├── organisms/   # route-level interface sections
├── ui/shadcn/   # compatibility import paths for unresolved Radix composition
└── …            # established product/domain components
```

### Non-negotiable rules

1. **One canonical primitive per interaction.** Button, Input, Textarea, NativeSelect, Switch, Badge, Skeleton, Toast, Dialog, DropdownMenu, and HelpTooltip live in `atoms/`. Legacy paths re-export or adapt to the atom; they do not fork behavior.
2. **Variants live in `cva`.** Semantic options are typed, discoverable, and testable. Call-site `className` is for layout or a narrow local exception, never for reimplementing an atom variant.
3. **Accessibility is part of the component contract.** Focus visibility, keyboard operation, invalid states, labels, descriptions, and screen-reader status are default behavior.
4. **Molecules are evidence-based.** FormField, SearchField, MetricCard, StatusNotice, and Card solve repeated interaction problems. A molecule does not exist solely to wrap page markup.
5. **Organisms own repeated route anatomy.** PageShell, Panel, StatTile, and CommandBar are imported from `@/components/organisms` for new route-level work.
6. **Migration is additive first.** New and materially changed surfaces use public atoms, molecules, and organisms. Compatibility paths remain until all active consumers can be safely migrated.

## Canonical inventory

| Layer | Canonical component | Status | Primary responsibility |
| --- | --- | --- | --- |
| Atom | `Button` | Complete | Semantic actions, `asChild`, focus and disabled states |
| Atom | `Input` | Complete | Typed state variants and invalid semantics |
| Atom | `Textarea` | Complete | Long-form text input, resize, and invalid semantics |
| Atom | `NativeSelect` | Complete | Simple, native keyboard-selectable choices |
| Atom | `Switch` | Complete | Accessible binary preference controls with finite size variants |
| Atom | `Badge` | Complete | Semantic status and metadata treatment |
| Atom | `Skeleton` | Complete | Text, circle, control, and surface loading affordances |
| Atom | `EmptyState` | Complete | Empty-result framing |
| Atom | `Toast` | Complete | Notification tone and live-region semantics |
| Atom | `HelpTooltip` | Complete | Radix-backed contextual help, focus, placement, and semantic trigger behavior |
| Molecule | `Card` | Complete | Reusable content surface with stable header, body, footer, and elevation slots |
| Molecule | `FormField` | Complete | Label, help, error, and described-by relationship |
| Molecule | `SearchField` | Complete | Search affordance with predictable clear behavior |
| Molecule | `MetricCard` | Complete | Operational metric with contextual trend |
| Molecule | `StatusNotice` | Complete | Semantic inline feedback for service, warning, and account-action states |
| Organism | `PageShell` | Complete | Responsive page anatomy, tabs, mobile actions, Panel, and StatTile |
| Organism | `CommandBar` | Complete | Mounted workspace command palette with route-safe navigation and keyboard contract |

## Completed adoption waves

### Primitive and compatibility closure

- `ShadButton`, Input, Badge, Card, Skeleton, Switch, and Textarea delegate to canonical atoms or molecules where the interaction is equivalent.
- The legacy HelpTooltip preserves its public API while delegating to the canonical Radix-backed atom.
- `ui/shadcn` is explicitly a compatibility layer; it is not a competing canonical system.
- Source-root aliases support both historic `@/src/...` and concise `@/...` imports without root-level shims.

### Workspace operations

- Assistants uses canonical Button, Badge, Skeleton, and MetricCard patterns for creation, readiness, loading, and roster summaries.
- Inbox uses canonical SearchField, Badge, Button, EmptyState, and Skeleton patterns while retaining its existing API lifecycle and outcome controls.
- Studio’s create-agent dialog uses FormField, Input, Textarea, NativeSelect, and Button without changing agent creation, browser-context prefill, or training extraction behavior.
- Connections, Knowledge, Overview, Settings, Billing, Team, Client Apps, and Salesforce use canonical controls and StatusNotice feedback around their live persistence contracts.

### Public and account flows

- Reset Password uses canonical Input, Button, FormField, and StatusNotice treatment for password policy, invalid reset links, failure, and success states.
- Onboarding uses canonical Card, Input, Button, and FormField contracts, including semantic progress state and mobile-friendly input metadata.
- Developer Portal uses the canonical Button atom for OpenAPI, Swagger, request simulation, and copy actions without changing its external API behavior.

### Organism boundary

- PageShell, Panel, StatTile, and CommandBar are exported through `@/components/organisms` for route-level composition.
- Existing direct imports remain compatible while the public organism barrel is the required entry point for new route-level work.

## Quality gate

`npm run design:contract` delegates to the active-surface contract, which runs:

- `scripts/check-design-system-contract.mjs` for canonical atom, compatibility, semantic-token, and high-traffic consumer invariants;
- `scripts/check-atomic-design-completion.mjs` for Card, organism, public/auth adoption, and compatibility-boundary invariants;
- `scripts/check-command-palette-contract.mjs` for route-safe keyboard behavior.

The guardrail grows after each adoption wave. Turning every legacy import into a hard failure before its route is safely migrated creates false urgency and encourages unsafe bulk rewrites.

## Definition of done

The Atomic Design system is considered complete when these conditions hold:

- repeated app-wide interactions have one canonical atom, molecule, or organism;
- compatibility exports delegate to canonical implementations where the behavior is shared;
- newly changed routes import from `atoms`, `molecules`, or `organisms`, not compatibility paths;
- app, public, and account flows have direct consumer adoption of the canonical entry points;
- keyboard and screen-reader behavior are validated for dialogs, menus, tabs, forms, status feedback, and destructive actions;
- `npm run design:contract`, type checking, tests, build, and visual QA pass.

## Governance

- Every new component PR declares its layer: atom, molecule, organism, or domain component.
- A new variant requires an explicit semantic use case; do not add variants for one-off colors or spacing.
- Compatibility exports are removed only after repository-wide import migration and a release window.
- Design-system changes require at least one consumer adoption in the same pull request.
- A UI control cannot be presented as configurable or saved unless its persistence and runtime contract exist.
