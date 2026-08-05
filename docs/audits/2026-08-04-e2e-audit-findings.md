# Wireline E2E audit — 2026-08-04

## Scope

Repository, production build boundaries, Vercel deployment posture, Supabase schema/runtime data, Stripe commercial state, product entitlement truth, vendor/integration surface, and launch sequencing.

## Verified state

- Audited base: `main` at `2821669e374b1916924fd32ac75cdbd125c56229`, followed through merged production-hardening commit `c4e5c90176f03827873777a6c800e45485238d5a`.
- Exact-head Vercel preview completed the deep launch audit successfully: TypeScript, server TypeScript, audit-module TypeScript, ESLint, the full non-E2E Vitest suite, production-equivalent contract subset, build, server import smoke, and function packaging.
- Upstash production credentials were not missing. The noisy warning originated from tests that intentionally delete the Upstash variables to verify fail-closed behavior.
- Production Supabase is active. Current accounts are classified as test/demo; no production funnel events or recent production calls were found during this audit.
- Cadence AI is the correct Stripe account for Wireline, but its customer-facing identity still needs to be renamed to Wireline by the account owner.
- Federal DNC remains intentionally fail-closed until the business/EIN and vendor credentials exist.

## Implemented improvement

Production Vercel builds now execute the authoritative required-environment validator before migrations and product compilation. Preview builds remain isolated from production-only credentials. This converts missing required production secrets from request-time failures into deployment-time failures. The change merged through PR #1008.

## Confirmed residuals

### 1. Drizzle schema parity

`src/db/schema.ts` is behind committed migrations:

- Header still names migration `0129`, while `0130` and `0131` are committed/applied.
- `wireline_settings.account_environment` from migration `0130` is absent from the Drizzle declaration.
- `wireline_spend_budgets` still declares `monthly_limit_usd` default `0`, `hard_cap` default `false`, and nullable guard columns, contradicting migration `0107` and production (`0.50`, `true`, and NOT NULL constraints).

This is not a current runtime outage, but it is a migration-generation hazard. Correct it with a surgical full-file edit, regenerate Drizzle SQL, and require an empty/no-destructive diff before accepting the repair.

### 2. Shared workspaces

Shared workspace invitation routes remain intentionally fail-closed until `shared-workspace-data-plane-v1` certification. Do not set the certification variable merely to expose the UI; complete actor/tenant authorization certification first.

### 3. Commercial proof

The live Stripe account has customer metadata but no active subscriptions or PaymentIntents. Internal database grants are test/demo and have no Stripe subscription IDs. Complete one controlled checkout → webhook → entitlement → portal → cancellation/refund lifecycle after the Stripe identity rename and before public paid acquisition.

### 4. Product sequencing

Wireline already has a broad vendor registry. Do not add generic providers for breadth. The highest-value next product proof is one narrow system-of-record workflow that turns a real conversation into a measurable outcome—for example, qualified lead → booked appointment → CRM writeback → owner follow-up—with durable attribution and a case-study artifact.

## Explicit non-actions

- Did not treat GitHub Actions billing/startup failures as code defects.
- Did not change or fabricate Upstash configuration.
- Did not enable marketing outbound without Federal DNC.
- Did not enable shared workspaces without certification.
- Did not rename or mutate the Stripe account through an unverified connector path.
- Did not add more model/provider choices to customer-facing product surfaces.
