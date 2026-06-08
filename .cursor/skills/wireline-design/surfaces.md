# Wireline — design upgrade surfaces

Prioritized map for design passes. Start with **P0** when the user doesn’t specify a screen.

**Before editing any surface:** read [csp-theming.md](csp-theming.md) if the work touches color, progress, charts, or motion.

## P0 — Core product identity

| Surface | Primary files | Notes |
|---------|---------------|-------|
| **Director / mission control** | `DirectorWorkspace.tsx`, `director/DirectorLiveSession.tsx`, `director/DirectorLiveOrchestra.tsx`, `director/DirectorMessageBody.tsx`, `director/DirectorComposerToolbar.tsx`, `director/DirectorComposerAccessory.tsx`, `director/DirectorComposerContextStrip.tsx`, `director/DirectorCapabilityCatalog.tsx`, `director/DirectorStarterPrompts.tsx`, `director/DirectorArtifactsPanel.tsx`, `director/DirectorResearchSources.tsx`, `chat/ProposalCard.tsx` | Chat spine; composer; capabilities; live orchestration; proposals |
| **App shell** | `layout/AppShell.tsx`, `TopBar.tsx`, `Sidebar.tsx` (`data-rail`), `AuroraBackdrop.tsx`, `PageShell.tsx` (`data-accent`) | Global hierarchy, route accents |
| **Agent chat** | `pages/AgentChat.tsx`, `hooks/useStreamingChat.ts` | Parity with Director patterns where appropriate |
| **Founder dashboard** | `FounderDashboard.tsx` | Fleet overview; “needs attention” over vanity metrics |
| **Toasts** | `Toast.tsx` | `data-toast` theming; motion via Framer |

## P1 — Fleet & workspace

| Surface | Primary files | CSP notes |
|---------|---------------|-----------|
| Agent workspace | `AgentWorkspace.tsx`, `AgentTemplates.tsx` | `data-accent` metrics |
| Fleet settings | `fleet-settings/FleetSettings.tsx` | |
| Integrations hub | `PreviewCards.tsx`, `preview-cards.css`, `live/*` | **Reference** co-located CSS pattern |
| Capability canvas | `AgentIntegrationCanvas.tsx` | `wl-canvas-node`, `data-integration-accent` |
| Live task UI | `ui/LiveTaskPipeline.tsx` | |
| Insights | `insights/*` (e.g. `HeatmapView`, `AISpendView`) | `data-heat-opacity`, `data-accent`; Recharts uses style-src-attr |

## P2 — Channels & ops

| Surface | Primary files |
|---------|---------------|
| Phone / email / SMS routes | `routes/*`, channel-specific pages |
| Ops / triage / insights | ops-related route components |
| Pipeline | pipeline views |
| Admin / audit / DNC | admin routes — compliance clarity |

## P3 — Marketing & auth

| Surface | Notes |
|---------|-------|
| Landing / marketing | `.marketing-surface`, `SectionStickers`, `NebulaPulse`, `GlyphMorph`, `VoidButton` |
| Pricing | `.wl-pricing-tier--highlight` for spotlight tiers |
| Auth / onboarding | Match app tokens on transition into shell |
| First paint | `public/app-shell.css` — do not re-inline skeleton CSS |

## Integration live UI

| Component | Path |
|-----------|------|
| Live action card | `integrations/live/IntegrationLiveActionCard.tsx` |
| Live feed | `integrations/live/IntegrationLiveFeed.tsx` |
| Live visuals | `integrations/live/IntegrationLiveVisuals.tsx` |
| Preview thumbnails | `integrations/PreviewCards.tsx`, `preview-cards.css` |

Use `wl-integration-live-card`, proposal dashed state, `LIVE_FEED_LABELS` copy.

## Quick audit (design + CSP)

Run when auditing a screen:

```bash
# Off-brand hues
rg "#0[0-9a-f]{5}|#3b82f6|#06b6d4|from-blue|from-cyan|to-teal" src/components --glob "*.tsx"

# CSP regressions (must be 0)
npm run csp:check

# Manual spot-check in area
rg "style=\{" src/components/<Area> --glob "*.tsx"
rg "<style" src/components/<Area> --glob "*.tsx"
```

## Suggested upgrade order (full product pass)

1. App shell + TopBar + Sidebar (`data-rail`, route accents)  
2. Director live session (reference implementation)  
3. Founder dashboard + Agent workspace  
4. Integration canvas + PreviewCards + Fleet settings  
5. Insights / ops tables (density + `data-*` metrics + empty states)  
6. Marketing primitives (stickers, Nebula, VoidButton) + Pricing  
7. `npm run csp:check` + visual pass at 390px / dark mode
