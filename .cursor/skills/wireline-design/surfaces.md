# Wireline — design upgrade surfaces

Prioritized map for design passes. Start with **P0** when the user doesn’t specify a screen.

## P0 — Core product identity

| Surface | Primary files | Notes |
|---------|---------------|-------|
| **Director / mission control** | `DirectorWorkspace.tsx`, `director/DirectorLiveSession.tsx`, `director/DirectorLiveOrchestra.tsx`, `director/DirectorMessageBody.tsx`, `director/DirectorComposerToolbar.tsx`, `director/DirectorComposerAccessory.tsx`, `director/DirectorComposerContextStrip.tsx`, `director/DirectorCapabilityCatalog.tsx`, `director/DirectorStarterPrompts.tsx`, `director/DirectorArtifactsPanel.tsx`, `director/DirectorResearchSources.tsx`, `chat/ProposalCard.tsx` | Chat spine; composer; capabilities; live orchestration; proposals |
| **App shell** | `layout/AppShell.tsx`, `TopBar.tsx`, `Sidebar.tsx`, `AuroraBackdrop.tsx` | Global hierarchy, route titles |
| **Agent chat** | `pages/AgentChat.tsx`, `hooks/useStreamingChat.ts` | Parity with Director patterns where appropriate |
| **Founder dashboard** | `FounderDashboard.tsx` | Fleet overview; “needs attention” over vanity metrics |

## P1 — Fleet & workspace

| Surface | Primary files |
|---------|----------------|
| Agent workspace | `AgentWorkspace.tsx`, `AgentTemplates.tsx` |
| Fleet settings | `fleet-settings/FleetSettings.tsx` |
| Integrations hub | `integrations/PreviewCards.tsx`, `integrations/live/*` |
| Live task UI | `ui/LiveTaskPipeline.tsx` |

## P2 — Channels & ops

| Surface | Primary files |
|---------|----------------|
| Phone / email / SMS routes | `routes/*`, channel-specific pages |
| Ops / triage / insights | ops-related route components |
| Pipeline | pipeline views |
| Admin / audit / DNC | admin routes — compliance clarity |

## P3 — Marketing & auth

| Surface | Notes |
|---------|-------|
| Landing / marketing | `.marketing-surface` — Fraunces display allowed; keep purple/cream |
| Auth / onboarding | Match app tokens on transition into shell |

## Integration live UI (recent)

| Component | Path |
|-----------|------|
| Live action card | `integrations/live/IntegrationLiveActionCard.tsx` |
| Live feed | `integrations/live/IntegrationLiveFeed.tsx` |
| Live visuals | `integrations/live/IntegrationLiveVisuals.tsx` |

Use `wl-integration-live-card`, proposal dashed state, `LIVE_FEED_LABELS` copy.

## Quick audit grep (off-brand drift)

Run when auditing a screen:

```bash
# Hardcoded off-brand hues (investigate each hit)
rg "#0[0-9a-f]{5}|#3b82f6|#06b6d4|from-blue|from-cyan|to-teal" src/components --glob "*.tsx"

# Inline styles bypassing tokens
rg "style=\\{\\{" src/components/<Area> --glob "*.tsx"
```

## Suggested upgrade order (full product pass)

1. App shell + TopBar consistency  
2. Director live session (reference implementation)  
3. Founder dashboard + Agent workspace  
4. Integration live cards + Fleet settings  
5. Channel ops tables (density + empty states)  
6. Marketing alignment (without breaking public pages)
