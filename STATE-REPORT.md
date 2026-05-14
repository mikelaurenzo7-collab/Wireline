# State Report: Wireline Admin Dashboard

## Tech Stack
- Frontend: React 19 + Vite + Tailwind CSS 4.1
- Backend: Express (server.ts) + Supabase (PostgreSQL)
- Auth: Supabase Auth
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

## Gaps Identified
1. **Audit Data Mismatches**: `AuditActivityPanel.tsx` expects `d.logs` but API returns `entries`. Totals fields (`tokens`, `count`, `avg_latency`) are also mismatched.
2. **Environment Path**: `node`/`npm` missing from shell PATH in some environments.
3. **Rate Limiting**: Production using in-memory rate limiting instead of Redis.
4. **Supabase CLI**: Project ref and DB connection string provided but CLI link not verified.
