# BotBound spring-cleaning evidence — October 30, 2026

**Baseline:** `origin/main` at `cf95cfa0d62b3fbd9c921b7d3aad18730fb10d41`.
**Scope:** Incremental code hygiene, independent production observations, release-policy consistency, and public-page risk review. This is not an end-to-end certification of live use.

## Corrections in the first cleanup branch

1. The root PR CI workflow invoked `npm run csp:check`, but the root package had no such script. Removed that obsolete command; the remaining security and runtime gates stay in place.
2. Added a workflow/package-script integrity test that checks root workflows and the independently versioned film package, preventing recurrence of that class of CI drift.
3. Repaired the standalone deployment-boundary checker to distinguish Render production, preview, and malformed host metadata, and to enforce an authenticated Render main branch plus 40-character source revision before accepting self-serve billing. Vercel remains a deliberately supported rollback path, not Render's source of identity.
4. Reconciled the same checker with the managed structured-reasoning policy: xAI is the default and OpenAI the backup. Legacy AI Gateway is not an eligible primary on Render.
5. Set explicit POST methods on authentication, password reset, contact, and support forms. React handlers are unchanged; native browser fallback can no longer transmit entered fields in a GET URL. Added regression assertions.
6. Reclassified the prior root launch score and sign-off as a historical claim, not approval of any later deployed revision.

7. Retired the legacy Gemini HTTP session/tool/status handlers to explicit nonbillable HTTP 410 tombstones; POSTs retain authentication. Unmounted the historical Gemini media WebSocket bridge from the voice worker because it trusted tenant identifiers in a client-provided start frame without authenticated admission. Did not remove the current voice rehearsal or SIP paths.

## Independently observed, not modified

- The production Supabase project reported `ACTIVE_HEALTHY`. All returned public-schema tables reported RLS enabled; this is not a proof of tenant policy correctness.
- The Supabase security advisor reported disabled **Supabase Auth** leaked-password protection. BotBound uses a separate application password system with its own breached-password checks. Determine whether Supabase Auth is actually used before treating that advisor item as an application password bypass.
- Resend reported `botbound.app` verified with outbound sending enabled. AgentMail contained managed `bots.botbound.app` and company role inboxes. Neither establishes the success of a new real delivery.
- Two separate live Stripe accounts were visible. Canonical production account and webhook bindings were not established; **no Stripe records were changed**.
- Two Render workspaces were visible, without a confirmed active workspace. **No service was deployed or changed**.
- Read-only Browser Use inspected public `/`, `/pricing`, `/features`, `/signin`, `/signup`, `/contact`, `/support`, and secondary pages at desktop and mobile viewports. No broken internal navigation or pricing-total inconsistency was found. The mobile privacy-consent notice overlapped lower-page content at 390 px width. This remains open pending screenshot-backed design verification and a separate fix.
- Supabase job and computer-task records show ongoing activity, but completed DB jobs do not independently certify their external effects.

## Work intentionally deferred

- Gemini legacy HTTP status/session/tool entry points and the unauthenticated Gemini media WebSocket mount are now retired in this **unmerged** branch. The legacy service source remains temporarily for history and rollback; do not assume the change is deployed. Verify voice-worker upgrade behavior and any external callback dependencies before merging.
- Vercel names remain in deployment, compatibility, and tests. Remove only after the explicitly documented rollback path is retired.
- Voice clones have separate feature gates, consent, provider retention, and legacy references. Preserve saved records and historical billing while feature rollout is paused.
- Cloud Computer records use bounded browser sessions and provider-specific spend reservations. Reconcile actual remote-browser provider usage before changing accounting constants.
- The mobile consent overlap requires visual QA on iOS and small Android sizes, including a reachable consent choice and unobscured pricing CTAs.
- Do not drop purportedly unused database indexes without query plans, operational usage observation, and rollback-safe migrations.

## Acceptance criteria before merge or launch

Run the PR CI workflow, `npm run verify:full`, `npm run verify:contracts`, route, security, docs, and source-control checks at the exact PR head. Confirm no unrelated code changes. Then, for any production release, verify Render API/voice source parity, provider credentials without exposing them, real signup and payment reconciliation in a controlled environment, authenticated browser takeovers, mobile visual screenshots, rollback, and operator sign-off following [the canonical runbook](../DEPLOYMENT_RUNBOOK.md).

An unavailable or skipped step is unverified, **not passed**. This branch does not authorize production deployment.
