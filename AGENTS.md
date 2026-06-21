# Wireline — Google Stitch Design System Rules

Use this document whenever implementing, reviewing, or testing product UI.

## Source of truth

| Asset | Location | Applies to |
|---|---|---|
| Google Stitch project | `https://stitch.withgoogle.com/projects/15464421841872665077` | Current visual source |
| Committed desktop export | `.stitch-export/` and the current attached Stitch handoff | React web workspace + public web |
| Committed mobile export | The current attached Stitch handoff (`*_mobile`, SwiftUI files) | Native iOS only |
| Design specification | `.stitch-export/DESIGN.md` | Tokens, type, geometry, layout |
| Route-to-export bridge | `src/lib/stitch-design-system.ts` | Web route mapping |
| Web tokens | `src/styles/foundation.css` | React/Tailwind |
| Native tokens | `ios/Wireline/Theme/WirelineTheme.swift` | SwiftUI |

The Stitch project and committed exports are the implementation contract. Do not reintroduce a parallel Figma, preview, or no-code design source.

## Product framing

Wireline is marketed first as a **personal call and message assistant**. The product should make it obvious that someone can hand off appointments, support lines, school or pharmacy calls, restaurant reservations, follow-ups, and hold time.

- Prefer **assistant**, **your day**, **what matters to you**, **recap**, and **follow-up** over fleet, operator, command center, queue, or SDR language.
- Business configuration remains supported, but it is an optional expansion—not the default mental model or public promise.
- Live Ops is retired. Do not restore `/ops`, live-review, live-handoff, or real-time operator dashboards as a primary navigation destination.
- Do not create a responsive web implementation from the Stitch mobile exports. They are native SwiftUI reference material for `ios/`.

## Wireline visual language

- **Surfaces:** warm off-white `#F9F9F7`, white elevated cards, low-contrast warm borders.
- **Primary action:** forest `#1A3C34` / deep forest `#01261F`; use semantic variables rather than component-level literals.
- **Typography:** Inter on web; native system typography on iOS. JetBrains Mono is reserved for compact metrics and technical metadata.
- **Geometry:** 4px is the default control radius; 8px is for grouped cards and modals. Pills are reserved for status and avatars.
- **Elevation:** tonal layering and borders first; soft shadows only for popovers and modals.
- **Density:** purposeful, laptop-friendly utility. Preserve breathing room without leaving large dead zones below primary work.

## Workspace architecture — desktop web

The authenticated web app is a fixed 212px sidebar plus a fluid main stage, capped at 1680px. Standard desktop QA frames are 1440×900 and 1280×800.

| Canonical route | Navigation label | Implementation |
|---|---|---|
| `/studio` | Studio | `src/components/StudioWorkspaceV2.tsx` |
| `/agents` | Assistants | `src/pages/AgentsPage.tsx` |
| `/knowledge` | Knowledge | `src/pages/KnowledgePage.tsx` |
| `/actions` | Connections | `src/pages/IntegrationsPage.tsx` |
| `/settings` | Settings | `src/pages/SettingsPage.tsx` |

`/integrations` remains a backward-compatible redirect only. `/ops` remains a backward-compatible redirect to Studio only.

### Studio requirements

Studio is the primary work surface, not a generic settings form.

- Keep roster, training conversation, and inspector visually distinct.
- Keep the inspector decisive and plain-language: identity, number, voice, knowledge, connections, rules, and launch readiness.
- Preserve model selection and text/image asset ingestion in the training workflow.
- Phone provisioning, voice selection, integrations, and saved configuration must remain connected to the existing backend endpoints.
- Keep the side navigation visible and the training composer usable above the fold on laptop viewports.

## Native iOS architecture — mobile Stitch exports

The mobile Stitch files are a native SwiftUI contract for `ios/`, not a mobile-browser layout.

- Preserve native behavior: SF Symbols, standard navigation, CallKit, App Intents, widgets, VoiceOver, Dynamic Type, and safe-area handling.
- Apply the same warm surface, forest action color, compact radius, 4pt/8pt rhythm, and press feedback to native surfaces.
- Mobile navigation should describe consumer jobs, not Live Ops. Calls/recaps may replace the retired live-operations destination.
- Do not sacrifice production iOS flows merely to recreate browser components inside SwiftUI.

## CSS cascade

The global import order in `src/main.tsx` is intentional:

```text
foundation.css → index.css → monochrome-guard.css → readability-guard.css
```

Use styles in this order:

1. Semantic utilities (`bg-card`, `text-muted-foreground`, `border-border`)
2. Workspace utilities (`wl-surface`, `wl-stitch-card`, `wl-segmented`, `workspace-btn-*`)
3. Typography utilities (`wl-text-*`, `wl-stitch-label`, `wl-stitch-eyebrow`)
4. Shared class constants from `src/lib/wireline-design-system.ts`

## Implementation rules

1. Map values through semantic tokens; do not copy raw design colors into components.
2. Prefer `WorkspaceShell` for authenticated web workspace pages.
3. Use Lucide at 16px by default on web; use SF Symbols natively on iOS.
4. Keep controls keyboard-accessible with visible focus states on web and accessible labels on iOS.
5. Preserve mobile behavior while optimizing desktop and laptop density for web.
6. Use `0.98` press feedback on intentionally tappable/clickable surfaces.
7. Run TypeScript, tests, build, and visual QA before shipping.

## Retired design surfaces

Do not restore:

- violet/lavender palette, purple/cyan utilities, gradients, or mascot treatments
- the old Figma bridge/configuration
- `/design/preview` Stitch preview route
- `WIRELINE_DESIGN_UI`, `studio-home`, or no-code website-builder scaffolding
- the Live Ops / live review / handoff dashboard as a main product surface
- oversized rounded cards or ornamental, empty hero panels
