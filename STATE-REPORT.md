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

1. **Database Migration**: Transitioning from Supabase-js string-based queries to Drizzle ORM for end-to-end type safety.
2. **Audit Data Mismatches**: `AuditActivityPanel.tsx` expects `d.logs` but API returns `entries`. (Fixing via Drizzle schema).
3. **Environment Path**: `node`/`npm` missing from shell PATH in some environments.
4. **Rate Limiting**: Implementation of Upstash Redis for distributed state.
