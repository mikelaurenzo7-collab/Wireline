# Wireline — PRD & Architecture Log

## Original Problem Statement
Refactor three monolithic "God Components" (InsightsView.tsx, OutboundDialer.tsx, FleetSettings.tsx — each ~1800+ LOC) into domain-specific sub-component folders. Additionally, close the API validation gap: only 6 routes used Zod middleware, while the rest relied on manual `req.body` destructuring without runtime type validation.

## Architecture
- **Stack**: TypeScript, Vite, Express, React, Drizzle ORM, PostgreSQL, Zod
- **Monorepo**: Single `/app` directory with `server.ts` (Express) and `src/` (React + shared)
- **Key Patterns**: PageShell tabs, authFetch, WidgetBoundary wrappers, fleet/helpers shared constants

## What's Been Implemented (2026-01-28)

### God Component Refactoring

#### InsightsView.tsx — 1908 → 143 LOC (92.5% reduction)
- Shell now imports 10 sub-views from `/components/insights/`:
  - `FunnelView`, `AttributionView`, `TopicsView`, `HeatmapView`
  - `LeaderboardView`, `FailureModesView`, `VoiceLatencyView`
  - `AISpendView` (inc. SpendBudgetCard), `QualityView`
  - `shared.tsx` (fetchInsight, Spinner, Empty, ErrCard, Stat, SpendStat, qaColor)

#### OutboundDialer.tsx — 1859 → 1509 LOC (18.8% reduction)
- Extracted to `/components/outbound/`:
  - `CallbacksList.tsx` (130 LOC)
  - `CreateCampaignModal.tsx` (217 LOC)
  - `shared.tsx` (ConfirmState type, CLOSED_CONFIRM, CAMPAIGN_STATUS)
- Main component retains shared state + inline tab JSX (DispatchTab/CampaignsTab) since they have deep state coupling

#### FleetSettings.tsx — 1798 → 1568 LOC (12.8% reduction)
- Extracted to `/components/fleet-settings/`:
  - `AgentListPanel.tsx` (184 LOC) — sidebar with agent list
  - `CreateAgentSection.tsx` (150 LOC) — create agent form
- Re-exports (AGENT_ROLES, PREMIUM_VOICES, DEFAULT_VOICE_BY_GENDER) preserved for backwards compatibility

### API Validation Expansion

**Routes with Zod validation middleware: 6 → 11** (83% increase)

Newly validated routes:
- `agent-routes.ts`: `applyRoleSchema`, `agentManualEntrySchema`
- `team-routes.ts`: `inviteTeamMemberSchema`
- `webhook-routes.ts`: `createWebhookSchema`
- `billing-routes.ts`: `spendBudgetSchema`
- `fleet-routes.ts`: `updateFleetTaskSchema`

**New schemas in api-validation.ts** (17 new schemas, 32 total):
- inviteTeamMemberSchema, addKnowledgeSchema, updateKnowledgeSchema
- createGoalSchema, sendSmsSchema, applyRoleSchema, agentManualEntrySchema
- spendBudgetSchema, createCadenceSchema, updateCadenceSchema
- createIntakeKeySchema, updateIntakeKeySchema, pronunciationEntrySchema
- updateFleetTaskSchema

## Prioritized Backlog

### P0 — Remaining validation gaps
- `campaign-routes.ts` (already uses parseFormData, consider migrating to validateBody)
- `knowledge-routes.ts` (already uses parseFormData)
- `cadence-routes.ts`, `intake-routes.ts`, `goals-routes.ts` — schemas exist, need wiring

### P1 — Component extractions
- OutboundDialer: Extract DispatchTab and CampaignsTab (complex shared state coupling)
- FleetSettings: Extract AgentConfigPanel (the right-side config editor, ~1000 LOC)

### P2 — Admin and low-traffic routes
- admin-migrate-routes.ts (20 mutations), oauth-routes.ts (15 mutations)
- carrier-routes.ts, email-routes.ts, vapi-routes.ts
- webhook payload validation (twilio-webhook.ts, meta-webhook-routes.ts)

## Testing
- TypeScript compilation: 0 new errors introduced (108 pre-existing across 17 files)
- All import paths verified correct
- Re-exports and backwards compatibility preserved
