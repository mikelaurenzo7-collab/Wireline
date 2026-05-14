# Phase Plan: Admin Settings Refactor (TDD)

## Objective
Enforce a flat component architecture for `AdminSettings.tsx` to resolve rendering issues and improve maintainability. Each tab panel will be a standalone component.

## Status: REFACTOR COMPLETE ✅
The monolith `AdminSettings.tsx` has been deconstructed into modular panels in `src/components/admin/`.

## Phased Roadmap

### Phase 1-4: Extraction & Integration (COMPLETED)
- All panels (Carrier, Subscription, System, Team, Growth, Quality, Activity) are now standalone components.
- `AdminSettings.tsx` uses modular imports.

### Phase 5: Stability & Telemetry Hardening (ACTIVE)
- **Goal**: Ensure production-grade accuracy in telemetry and resolve backend/frontend data mismatches.
- **Deliverables**:
  - [x] Align `AuditActivityPanel.tsx` with `AuditSummary` API response.
  - [x] Add global `avg_latency` to audit telemetry.
  - [ ] Implement Redis-backed distributed rate limiting.

### Phase 6: Enterprise Data Layer (Drizzle + Neon)
- **Goal**: Resolve "Supabase CLI" dependencies and string-based query risks by moving to a pure-Postgres Drizzle stack.
- **Deliverables**:
  - [ ] Define `src/db/schema.ts` (Mirroring `supabase_schema.sql`).
  - [ ] Migrate `server-context.ts` to use `@vercel/postgres`.
  - [ ] Refactor `audit-routes.ts` to use typed Drizzle queries.
  - [ ] Implement Vercel Postgres branching for safe schema updates.

## QA Checkpoints
- [x] Admin Settings deconstructed (527 lines vs 1074).
- [x] Audit stats correctly map to backend fields.
- [ ] Supabase migrations in sync with production.
- [ ] Visual QA of Admin Dashboard across 5 breakpoints.
