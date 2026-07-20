# Wireline launch design QA

**Status: historical.** Closed pre-launch visual/QA pass tied to a specific
commit; superseded by the later launch audits indexed in `docs/README.md`.

Date: 2026-07-14

Baseline: `f1adccd2c6577fd1b09b1729a3a3a5a2b377263d`

Final reviewed candidate: `d5099acd1d907c1ed7a3ed5226a6fb7f1a68f54d`

## Outcome

The launch candidate passed the final visual, responsive, first-run, interaction, and local release gates. No P0-P2 product defect remained after the final fixes.

The highest-leverage product change is a deliberately narrow first-run path:

1. A zero-agent workspace explains the first ten minutes instead of showing an empty operations dashboard.
2. Fast Start asks for one job and a name, then keeps voice, identity, and phone choices optional.
3. The post-create guide opens immediately and walks through Review, Number, and Test without requiring a reload.
4. Users can safely finish without provisioning a number or granting microphone access.

## Final visual matrix

- 39 public and lifecycle routes.
- 24 authenticated workspace routes.
- 15 widths: 360, 390, 430, 639, 640, 767, 768, 834, 1023, 1024, 1280, 1365, 1440, 1536, and 1920 pixels.
- 945 accepted route/viewport screenshots: 585 public and 360 authenticated.
- 16 additional focused-state screenshots for onboarding and high-risk interactions.
- 0 accepted captures with a route failure, unresolved loading state, page-level horizontal overflow, or broken image.

The in-app Browser's `fullPage` mode was rejected as evidence because this application scrolls inside bounded marketing/workspace surfaces and the capture mode produced blank or header-only images. Every accepted final artifact is a settled, true viewport capture; invalid exploratory captures are excluded from the release bundle.

## Verified interaction paths

- Fresh email signup redirects to `/studio?create=1`.
- Fast Start creates a business agent from a one-sentence brief.
- The activation guide opens immediately after creation without a reload.
- Review → Number → Test → Ready completes without purchasing a number or requesting microphone access.
- SMS Inbox empty state routes to phone setup.
- iCloud connection exposes the email and Apple app-specific-password guidance, then cancels without persisting credentials.
- Compliance DNC add-number modal keeps submission disabled until valid input exists.
- Tenant account/audit export returns an authenticated JSON attachment.
- Phone history empty state explains the next actions.
- Built-in voice preview completes and customer-facing surfaces show readable voice names rather than opaque provider IDs.
- Unknown public and authenticated routes render intentional 404 states.

## Fixes driven by the audit

- Simplified the zero-agent Overview and Fast Start journey.
- Added immediate post-create activation handoff.
- Made fresh-signup redirect scope deterministic.
- Added public changelog and public 404 treatment.
- Added Gmail, Outlook, Yahoo, and iCloud mailbox setup surfaces.
- Reconciled DNC, account-export, phone-history, and voice-preview request paths.
- Added route-specific authenticated document titles and missing page headings.
- Rebalanced the Compliance Center desktop grid so DNC controls do not clip.
- Replaced raw voice identifiers with human-readable or safe fallback labels.
- Hardened live voice preview cleanup, authorization, proxying, and rate-limit behavior.
- Reconciled production migration `0087` and removed duplicate Vercel migration execution.

## Release evidence

- `npm.cmd run verify:full`: passed.
- TypeScript, ESLint, design-system, route-registry, OpenAPI, authz, CSP, runtime-policy, and server-bootstrap checks: passed.
- Vitest: 115 files, 592 tests passed.
- Production build and server smoke: passed.
- `npm audit --audit-level=high --omit=dev`: 0 vulnerabilities.
- Vercel preview health: operational for voice runtime, voice fallback, and reasoning.
- Final dogfood account creation and agent activation: passed.

## Non-blocking launch operations

- Supabase leaked-password protection remains disabled and should be enabled before broad public signup if the project plan supports it.
- Supabase is still on a free-plan backup posture; establish production backup/restore ownership before meaningful customer volume.
- Vercel project settings still display Node 20 while `package.json` correctly selects Node 22 during builds.
- The live `0087` database state is verified, but the canonical Drizzle migration remains the source of truth because the manually reconciled change is not listed in Supabase's platform migration history.
- Real carrier provisioning, real mailbox consent completion, and microphone/live-call audio were intentionally not completed with demo-only accounts.

## Promotion decision

Ready to promote once the final branch SHA, production deployment health, and remote `main` fast-forward are revalidated immediately before push.
