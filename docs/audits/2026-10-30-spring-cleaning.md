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

7. Retired the legacy Gemini HTTP session/tool/status handlers to explicit nonbillable HTTP 410 tombstones; POSTs retain authentication. Unmounted the historical Gemini media WebSocket bridge from the voice worker because it trusted tenant identifiers in a client-provided start frame without authenticated admission. Did not remove the current voice rehearsal or SIP paths. Removed the now-unreferenced Gemini media bridge and service implementation files from the PR branch; the lower-level live-client module remains because existing tests and compatibility types still import it.

8. Moved the first-visit cookie/privacy notice into normal document flow on narrow screens while retaining a floating panel when choices are explicitly reopened. Corrected stale iPhone source-contract expectations. This requires preview-browser screenshot verification before merging.

## Independently observed, not modified

- The production Supabase project reported `ACTIVE_HEALTHY`. All returned public-schema tables reported RLS enabled; this is not a proof of tenant policy correctness.
- The Supabase security advisor reported disabled **Supabase Auth** leaked-password protection. BotBound uses a separate application password system with its own breached-password checks. Determine whether Supabase Auth is actually used before treating that advisor item as an application password bypass.
- Resend reported `botbound.app` verified with outbound sending enabled. AgentMail contained managed `bots.botbound.app` and company role inboxes. Neither establishes the success of a new real delivery.
- Two separate live Stripe accounts were visible. Canonical production account and webhook bindings were not established; **no Stripe records were changed**.
- Two Render workspaces were visible, without a confirmed active workspace. **No service was deployed or changed**.
- Read-only Browser Use inspected public `/`, `/pricing`, `/features`, `/signin`, `/signup`, `/contact`, `/support`, and secondary pages at desktop and mobile viewports. No broken internal navigation or pricing-total inconsistency was found. The mobile privacy-consent notice overlapped lower-page content at 390 px width. This remains open pending screenshot-backed design verification and a separate fix.
- Supabase job and computer-task records show ongoing activity, but completed DB jobs do not independently certify their external effects.

## Additional live cross-platform investigation (October 30, UTC)

- GitHub `main` remained `cf95cfa0d62b3fbd9c921b7d3aad18730fb10d41`; PR #1444 was open, unmerged, and had no successful PR CI run observed. The GitHub-browser workflow dispatcher could not run because that separate browser session was not authenticated.
- Render's `My Workspace` (`tea-d6cgo7kr85hc738l3lh0`) hosts the real `botbound-api`, `botbound-voice`, jobs sweep and daily brief services. The separate `BEASTBOTS` workspace hosts an unrelated repository. API and cron live revision matched `cf95cfa`; voice initially served `af0a5cd` because its auto-deploy is deliberately **off**. A manual deployment (`dep-dbigh8ajnfac73cbf350`) of the **existing production main** `cf95cfa` reached `live` on October 30 at 21:15 UTC. Render recorded successful build/deploy, and the worker logged readiness on port 10000 (`maxCalls=10`, `maxCallSeconds=3600`). This restores source parity, **not authenticated `/readyz` proof or a successful live call**. The production runbook requires draining calls before manual voice promotion; this session checked for live SIP leases but did not independently execute its authenticated drain command. Future voice releases must follow the full drain process. Voice build `npm ci` reported 13 dependency advisories (11 moderate, 2 high); no blind `npm audit fix` was run.
- Stripe canonical merchant is `acct_1TkyXL8e6If87QKm` (explicit account rejection guard in `scripts/stripe-usage-billing-setup.mjs`). Its BotBound webhook is enabled; the second connected BOTBOUND LLC account's similar webhook is disabled. Both reported zero current live Stripe subscriptions; database's six `active` subscription rows were exclusively demo/QA/founder grants with null Stripe subscription IDs, so do not report them as paying users.
- Source-derived Stripe webhook inventory comparison passed: all **14** event names matched the enabled canonical live endpoint (zero missing, zero extra), and webhook API version `2026-08-26.dahlia` matched `src/lib/stripe-api-version.ts`. This verifies configured event coverage, not the successful external processing of a newly delivered payment event.
- The checkout table had one local `open` operation whose recorded expiry was October 27 and whose matching Stripe session was `expired`. Source review of `src/routes/launch-billing-checkout-atomic-routes.ts` confirms the next checkout atomically expires past-TTL local operations and verifies Stripe's remote session before reusing a URL. The stale row does not prove a customer-facing defect unless a retry or status surface ignores this reconciliation; do not force-update billing state in SQL.
- Supabase project `ogenlhodmwvyacvnrsnj` was `ACTIVE_HEALTHY`; seven Stripe event audit rows were all `processed` (including a rotation probe). The jobs table showed 36,441 completed jobs, five historic dead jobs, and recent scheduler activity. Zero non-terminal OpenAI SIP leases were found. These counts are not end-to-end external delivery evidence.
- AgentMail returned 13 managed inboxes, including company `@botbound.app` addresses and a `@bots.botbound.app` bot inbox. On October 30, a controlled internal smoke email sent from `support@botbound.app` to `michael@botbound.app` was visible in the recipient inbox at 21:16:55 UTC. This verifies AgentMail-to-AgentMail delivery for these addresses, **not external-domain deliverability or webhook processing**.
- Supabase's unused-index lint returned 70 informational candidates. Leave indexes intact until usage and query-plan review. The Auth leaked-password warning concerns Supabase Auth; inspect the application's separate scrypt/breached-password controls before declaring an auth bypass.

## Work intentionally deferred

- Gemini legacy HTTP status/session/tool entry points and the unauthenticated Gemini media WebSocket mount are now retired in this **unmerged** branch. The deleted legacy source remains recoverable from Git history; do not assume the change is deployed. Verify voice-worker upgrade behavior and any external callback dependencies before merging.
- Vercel names remain in deployment, compatibility, and tests. Remove only after the explicitly documented rollback path is retired.
- Voice clones have separate feature gates, consent, provider retention, and legacy references. Preserve saved records and historical billing while feature rollout is paused.
- Cloud Computer records use bounded browser sessions and provider-specific spend reservations. Reconcile actual remote-browser provider usage before changing accounting constants.
- The mobile consent overlap has an **unmerged source fix**: first-visit notice now mounts before the app in normal mobile page flow; explicitly reopened choices still float. Verify at 320/375/390/430 px, including accessible focus, unobscured pricing CTAs, and both consent choices.
- Do not drop purportedly unused database indexes without query plans, operational usage observation, and rollback-safe migrations.

## Acceptance criteria before merge or launch

Run the PR CI workflow, `npm run verify:full`, `npm run verify:contracts`, route, security, docs, and source-control checks at the exact PR head. Confirm no unrelated code changes. Then, for any production release, verify Render API/voice source parity, provider credentials without exposing them, real signup and payment reconciliation in a controlled environment, authenticated browser takeovers, mobile visual screenshots, rollback, and operator sign-off following [the canonical runbook](../DEPLOYMENT_RUNBOOK.md).

An unavailable or skipped step is unverified, **not passed**. This branch does not authorize production deployment.
