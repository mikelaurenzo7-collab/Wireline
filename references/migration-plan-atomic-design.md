# Atomic Design Migration — Completion Standard

## Decision

Wireline will use a pragmatic atomic design system, not a folder taxonomy for its own sake. The purpose is to create **one canonical implementation** for recurring interaction patterns while retaining stable compatibility import paths during the transition.

The previous migration created the initial `atoms/` directory and documented the intended hierarchy. This document is the execution contract for completing it safely.

## Current Architecture

```
src/components/
├── atoms/       # canonical primitives and their variants
├── molecules/   # reusable combinations with a single interaction purpose
├── organisms/   # route-level interface sections
├── ui/shadcn/   # compatibility import paths during migration
└── …            # established product/domain components
```

### Non-negotiable rules

1. **One canonical primitive per interaction.** `Button`, `Input`, `Badge`, and `HelpTooltip` live in `atoms/`. Legacy paths re-export the atom; they do not fork it.
2. **Variants live in `cva`.** Semantic options are typed, discoverable, and testable. Call-site `className` is for layout or a local exception, not for reimplementing a variant.
3. **Accessibility is part of the component contract.** Focus visibility, keyboard operation, invalid states, and screen-reader labeling are default behavior.
4. **Migration is additive first.** New and materially changed surfaces import canonical atoms. Legacy surfaces migrate only when adjacent work makes the change low-risk.
5. **Do not create abstractions without repeated evidence.** A molecule must solve a recurring interaction problem, not merely wrap markup.

## Canonical Inventory

| Layer | Canonical component | Status | Primary responsibility |
| --- | --- | --- | --- |
| Atom | `Button` | Complete | Semantic action variants, `asChild`, focus and disabled states |
| Atom | `Input` | Complete | Typed state variants and invalid semantics |
| Atom | `Badge` | Complete | Status and metadata treatment |
| Atom | `Skeleton` | Complete | Loading affordance variants |
| Atom | `EmptyState` | Complete | Empty-result framing |
| Atom | `Toast` | Complete | Notification tone and live-region semantics |
| Atom | `HelpTooltip` | Transitional | Contextual help; migrate to canonical Radix implementation next |
| Molecule | `FormField` | Complete | Label, help, error, and described-by relationship |
| Molecule | `SearchField` | Complete | Search affordance with predictable clear behavior |
| Molecule | `MetricCard` | Complete | Operational metric with contextual trend |
| Organism | `PageShell` | Registered | Responsive page anatomy and tabs |
| Organism | `CommandBar` | Registered | Global navigation and command entry |

## Adoption Order

### 1. New work — mandatory now

- Import primitives from `@/components/atoms`.
- Prefer `FormField`, `SearchField`, and `MetricCard` when the interaction matches.
- Import `PageShell` and `CommandBar` from `@/components/organisms` in new route-level work.

### 2. High-traffic migrations — next

1. Command palette / command bar
2. Page shells and route headers
3. Agent Studio forms, cards, and empty states
4. Inbox, conversation, and data-heavy surfaces
5. Admin and long-tail configuration panels

### 3. Deliberate exceptions

- Domain components may keep local layout classes.
- A third-party primitive can remain in `ui/shadcn` only when it is not yet a Wireline canonical atom.
- Visual experiments belong behind isolated components, not extra global CSS utility families.

## Quality Gate

`npm run design:contract` validates the migration invariants:

- canonical high-value atoms use `cva`;
- atoms expose stable `data-slot` hooks;
- legacy Button and Input paths are compatibility re-exports.

This is intentionally narrow at first. Broaden the guardrail only after each adoption wave lands; turning all existing imports into a hard failure before they are migrated creates false urgency and encourages unsafe bulk rewrites.

## Definition of Done

The migration is complete when:

- all repeated app-wide interactions have one canonical atom or molecule;
- no two live implementations define the same Button/Input/Badge/Tooltip behavior;
- all changed routes use the canonical entry points;
- targeted visual QA covers desktop, laptop, and mobile widths;
- keyboard and screen-reader behavior are validated for dialogs, menus, tabs, forms, and destructive actions;
- `design:contract`, type checking, tests, build, and visual QA pass.

## Governance

- Every new component PR must declare its layer: atom, molecule, organism, or domain component.
- A new variant requires an explicit semantic use case; do not add variants for one-off colors or spacing.
- Compatibility exports are removed only after repository-wide import migration and a release window.
- Design-system changes require at least one consumer adoption in the same pull request.
