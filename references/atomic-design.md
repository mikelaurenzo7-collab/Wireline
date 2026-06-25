# Atomic Design Principles for Wireline

## Philosophy
We follow Atomic Design methodology to build a scalable, consistent, and maintainable design system.

The single source of truth is the DTCG design tokens in `design-tokens/wireline.tokens.json`. All surfaces (web, extension, iOS, Android) consume generated outputs for perfect symmetry in colors, spacing, radii, typography, elevations, motion, interaction targets, and z-index layering. No platform-specific deviations in core semantics.

## Levels

### Atoms
The most basic building blocks. These are pure, reusable primitives with no business logic.

**Examples:** Button, Badge, Input, Toast, Skeleton, EmptyState, HelpTooltip, Divider

**Rules:**
- Must be self-contained
- Should accept props for customization but remain simple
- Styling lives primarily in `src/styles/components.css` (or dedicated atom styles)

### Molecules
Combinations of atoms that form a functional unit.

**Examples:** SearchInput (Input + Button), FormField (Label + Input + error), MetricCard (Badge + number + label)

**Rules:**
- Molecules compose only Atoms (never other Molecules or Organisms)
- They solve one clear UI problem

### Organisms
Complex, standalone sections of the interface.

**Examples:** Navbar, CommandBar, AgentCard, DataTable, Sidebar

**Rules:**
- Organisms can use Molecules + Atoms
- They represent meaningful sections of the product
- Keep them focused — avoid god components

### Templates
Page-level structures without real content. These are wireframes/skeletons.

**Examples:** DashboardTemplate, WorkspaceTemplate, SettingsTemplate

### Pages
Specific instances of Templates with real data and content.

## Composition Rules (Strict)

- **Atoms** → used by Molecules, Organisms, and Pages
- **Molecules** → used by Organisms and Pages
- **Organisms** → used by Pages and Templates
- Never skip levels (e.g., a Page should not directly import an Atom if a Molecule exists for that purpose)

## Folder Structure

```
src/components/
├── atoms/        # Pure primitives
├── molecules/    # Functional combinations of atoms
├── organisms/    # Complex UI sections
├── templates/    # Page skeletons
└── pages/        # Actual screens (or keep in routes/pages)
```

## Migration Strategy
- Gradually extract primitives into atoms/
- Create molecules only when clear composition patterns emerge
- Update existing components incrementally
- Keep backward compatibility during transition

## Benefits for Wireline
- Extreme reusability across agent dashboards and workflows
- Consistent robofuturistic aesthetic
- Faster feature development
- Easier maintenance and scaling
