# Wireline — Google Stitch Design System Rules

Use this document whenever implementing, reviewing, or testing product UI.

## Source of truth

| Asset | Location |
|---|---|
| Google Stitch project | `https://stitch.withgoogle.com/projects/6981221452983374608` |
| Design specification | `.stitch/DESIGN.md` |
| Export manifest | `.stitch-export/manifest.json` |
| Route-to-export bridge | `src/lib/stitch-design-system.ts` |
| Tokens | `src/styles/foundation.css` |
| Shared patterns | `src/styles/stitch-patterns.css`, `src/styles/design-system.css`, `src/styles/workspace-buttons.css` |

The committed Stitch export and `.stitch/DESIGN.md` are the implementation contract. Do not reintroduce a parallel Figma, preview, or no-code design source.

## Wireline OS visual language

- **Surfaces:** warm off-white `#F7F7F5`, white elevated cards, low-contrast warm borders.
- **Primary action:** forest `#1A3C34`; use semantic `primary` classes and variables rather than literal component hex values.
- **Typography:** Inter for interface copy, JetBrains Mono only for metrics and technical data.
- **Geometry:** 4px as the default control/card radius. Pills are reserved for status and avatars.
- **Elevation:** tonal layering and borders first; soft shadows only for popovers and modals.
- **Density:** dashboard utility, 8px rhythm, concise labels, no decorative gradients or oversized hero surfaces in the workspace.

## Workspace architecture

The app shell is a fixed 212px sidebar plus a fluid main stage, capped at 1680px. Standard desktop frames are 1440×900.

| Canonical route | Navigation label | Implementation |
|---|---|---|
| `/studio` | Studio | `src/components/StudioWorkspaceV2.tsx` |
| `/agents` | Agents | `src/pages/AgentsPage.tsx` |
| `/knowledge` | Knowledge | `src/pages/KnowledgePage.tsx` |
| `/actions` | Actions | `src/pages/IntegrationsPage.tsx` |
| `/ops` | Live | `src/pages/OperationsPage.tsx` |
| `/settings` | Settings | `src/pages/SettingsPage.tsx` |

`/integrations` is a backward-compatible redirect only. All new UI links, menus, shortcuts, and tests must use `/actions`.

## Studio requirements

Studio is the core product surface, not a settings form.

- Keep the agent roster, conversation/training stage, and inspector clearly differentiated.
- Keep the inspector actionable: identity, rules, facts, tone, actions, model, and assets.
- Preserve model selection and text/image asset ingestion in the composer workflow.
- Send agent and integration selection into Studio context; do not bounce operators into unrelated sidebar pages.
- Keep side navigation visible and the primary training workflow usable above the fold on laptop viewports.

## CSS cascade

The global import order in `src/main.tsx` is intentional:

```text
foundation.css → index.css → monochrome-guard.css → readability-guard.css
```

`index.css` owns Tailwind plus product-pattern imports. Foundation must load first so downstream styles resolve the same semantic token layer.

Use styles in this order:

1. Semantic utilities (`bg-card`, `text-muted-foreground`, `border-border`)
2. Workspace utilities (`wl-surface`, `wl-stitch-card`, `wl-segmented`, `workspace-btn-*`)
3. Typography utilities (`wl-text-*`, `wl-stitch-label`, `wl-stitch-eyebrow`)
4. Shared class constants from `src/lib/wireline-design-system.ts`

## Implementation rules

1. Map design values through semantic tokens; do not copy raw design colors into components.
2. Prefer `WorkspaceShell` for authenticated workspace pages.
3. Use Lucide icons, 16px by default in navigation.
4. Keep controls keyboard-accessible with visible focus states.
5. Use the exact `stitchFile` mapping in `STITCH_SCREENS` when changing a mapped surface.
6. Preserve mobile behavior while optimizing desktop and laptop workspace density.
7. Run the Stitch contract, TypeScript, test, and build verification before shipping.

## Retired design surfaces

Do not restore any of the following:

- violet/lavender brand palette (`#7C3AED`) or purple/cyan Tailwind utilities
- old Figma bridge/configuration
- `/design/preview` Stitch preview route
- `WIRELINE_DESIGN_UI`, `studio-home`, or no-code website-builder scaffolding
- oversized rounded cards, purple gradients, or ornamental mascot treatments

The compatibility guards may neutralize old lazy-loaded UI temporarily, but new product code must be token-driven and Stitch-compliant.
