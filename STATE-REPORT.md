# State Report: Wireline Admin Dashboard

## Tech Stack
- Frontend: React 19 + Vite + Tailwind CSS 4.1
- Backend: Express (server.ts) + Vercel Postgres (Neon) + Drizzle ORM
- Auth: Supabase Auth (Migrating to Clerk or Auth.js planned)
- Integrations: Vapi, Stripe, Twilio, Anthropic (Claude), Google (Gemini/Gmail), CRM

## Database (20+ tables)
| Table | Purpose | Status |
|-------|---------|--------|
| wireline_settings | Platform configuration | Active |
| wireline_agents | AI fleet inventory | Active |
| wireline_phone_numbers | Carrier routing | Active |
| wireline_call_logs | Signal archives | Active |
| wireline_audit_log | AI spend & compliance | Active |
| wireline_webhooks | Outbound notifications | Active |
| wireline_intake_keys | Inbound lead intake | Active |

## API Surface
- `/api/settings`: GET/POST for platform config
- `/api/phone-numbers`: GET/POST/PATCH/DELETE for carrier lines
- `/api/team`: GET/POST/DELETE for team management
- `/api/health/*`: Integration and SLO status

## Frontend (Admin Settings)
- `src/components/AdminSettings.tsx`: Main orchestrator (527 lines). Refactored to modular architecture.
- Tab Panels (All Modularized):
  - Carrier: `CarrierPanel.tsx`
  - Subscription: `SubscriptionPanel.tsx`
  - System: `SystemPanel.tsx`
  - Team: `TeamPanel.tsx`
  - Growth: `GrowthPanel.tsx`
  - Quality: `KimiQualityPanel.tsx`
  - Activity: `AuditActivityPanel.tsx`

## Known Blockers & Status
1. **Database Migration**: **COMPLETE**. Transitioned fully to Drizzle ORM.
2. **Schema Reconciliation**: **COMPLETE**. Fixed mismatches in `agents`, `agentLessons`, and missing tables (`consentLog`, `calendarAccounts`).
3. **Audit Data Mismatches**: **RESOLVED**. Schema and API are now synchronized.
4. **Environment Path**: **RESOLVED**. Master IDE Shim (`src/types/env-shim.d.ts`) expanded to cover `googleapis`, `Buffer`, and missing crypto/express types.
5. **Rate Limiting**: **ACTIVE**. Standardizing on native Express-rate-limit + Upstash.

## Current Focus: Genesis Path
We have remediated the 142 identified build/compilation errors and successfully implemented the **CampaignDialerService** using a Test-Driven Development (TDD) approach.
Focusing on:
- Production Stability: **Campaign Outbound Engine** is now feature-complete and tested via `campaign-dialer.test.ts`.
- Intelligence: Google Drive/Gemini Ingestion is now schema-compliant.
- Optimization: Closing the Adaptive Tuning loop.
