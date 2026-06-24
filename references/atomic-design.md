# Atomic Design Principles for Wireline

Atomic Design is a **composition discipline** for Wireline’s product UI. It helps the application stay coherent as Studio, Assistants, Knowledge, Actions, Inbox, Settings, mobile-adjacent surfaces, and future products grow.

It is not a mandate to force every wrapper into a named taxonomy or to build generic abstractions before a pattern has proven itself.

For the executable roadmap, ownership model, and completion criteria, see [migration-plan-atomic-design.md](./migration-plan-atomic-design.md).

## Layers

### Atoms

Small, business-agnostic components with finite visual and interaction variants.

**Examples:** Button, IconButton, Badge, Skeleton, EmptyState, HelpTooltip.

**Rules:**

- Use semantic tokens and CVA when a component exposes finite variants.
- Keep asynchronous, disabled, focus, and accessible-name behavior inside the primitive.
- Do not embed product-domain or API logic.
- Do not rely on hover-only information.

### Molecules

Small, purposeful combinations of atoms that solve a repeated interaction problem.

**Examples:** FormField, SearchField, MetricCard, filter controls, confirmation actions.

**Rules:**

- Compose atoms and minimal local layout.
- Own a single, clear UI job.
- Do not aggregate unrelated data loading or product permissions.

### Organisms

Substantial reusable operational patterns or sections of the product.

**Examples:** WorkspaceShell, DataTable, ListDetailShell, command surfaces, page toolbars.

**Rules:**

- Compose atoms and molecules.
- Keep the interaction contract explicit, particularly responsive and keyboard behavior.
- Prefer semantic HTML. A `table` is not a `grid` unless the full grid keyboard contract is implemented.

### Features and pages

Feature folders own business data, API calls, route concerns, and the composition of lower UI layers.

A page may use an atom directly where no reusable molecule is justified. Do not create indirection solely to comply with a hierarchy.

## Styling rules

- `src/styles/foundation.css` owns semantic tokens, reset behavior, and global interaction guardrails.
- Tailwind utilities own layout and local composition.
- CVA owns finite visual choices.
- Existing `src/components/ui/shadcn/` primitives remain supported during transition; do not fork their behavior casually.
- New global "pass" stylesheets are prohibited. New feature-specific styles must be scoped and justified.

## Folder structure

```text
src/components/
├── atoms/        # Business-agnostic primitives
├── molecules/    # Repeated, focused combinations
├── organisms/    # Reusable operational patterns
├── layout/       # Product shell and responsive layout contracts
├── ui/shadcn/    # Existing supported primitive layer during transition
└── features/     # Domain-specific UI as it is progressively extracted
```

## Migration strategy

1. Strengthen primitive contracts and semantic tokens.
2. Extract only proven repeated patterns.
3. Migrate high-traffic surfaces before low-frequency or legacy screens.
4. Keep compatibility boundaries intentional and temporary.
5. Verify each shared component across keyboard use, loading, error, empty, mobile, laptop, and wide desktop states.
