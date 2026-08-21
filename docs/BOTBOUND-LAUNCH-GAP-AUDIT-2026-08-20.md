# BotBound Launch Gap Audit

Date: 2026-08-20

Status: Point-in-time adversarial launch evidence

Audited repository: codex/botbound-launch-cohesion-20260820

Audited HEAD: 3d1c0fe0c3ec2793dbc805f949b12f222d042f9d

## Executive verdict

BotBound has a strong product and security foundation, a coherent new identity, a real billing catalog, broad tenant and provider controls, and unusually substantial launch runbooks. It is not ready for an unrestricted production launch from the audited working tree.

The immediate blockers are concrete:

1. Required PR and production release checks are red.
2. The canonical BotBound public origin and the release-certification origin disagree.
3. The paid-media delivery manifest does not match six current files, and the media-rights record is still an explicit broadcast gate.
4. The latest available live evidence still does not prove one completed paid lifecycle, one non-demo production call, or the required carrier and support operations.
5. Scaled marketing outbound remains intentionally fail-closed until federal DNC and carrier evidence exists.

The best next motion remains a narrow founder-led design-partner launch, not broad paid acquisition. Even that motion should wait until the code gate, domain gate, exact-head authenticated QA, one real call, support delivery, and provider checks below are complete.

## Resolution addendum: current working-tree follow-up

This addendum records fixes verified after the point-in-time audit above. It does not convert local evidence into production evidence or rewrite the original findings as if they had not existed.

### Verified locally resolved

| Original area                    | Current verified resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-01 local code gates           | The complete `npm run verify:full` release command now passes on the current working tree: TypeScript, ESLint, design, source-control, workflow, route/security, docs, OpenAPI, tokens, Stripe, authorization, tenant, bootstrap, CSP, runtime, API-error, dependency audit, the complete authored unit estate, coverage, production build, server import smoke, 79 browser tests, and browser-extension package integrity. Six credential-dependent design-gold browser captures remain intentionally skipped. The regenerated authorization matrix inventories 395 routes: 320 protected, 75 explicitly public, and 0 violations.                           |
| P0-02 code-side canonical origin | Runtime and release tooling now treat `https://botbound.me` as canonical. Production build, environment, runtime link, and Twilio-base validation reject any other `APP_URL`, including the legacy host, `www`, lookalikes, ports, paths, credentials, and trailing-slash variants at the deployment boundary. New ChatGPT, Claude, and Cursor manifests, install links, public connector pages, OAuth publication metadata, and release checks use the same canonical MCP issuer/resource. `https://trywireline.com` remains explicit compatibility infrastructure only where already-issued callbacks, clients, or provider registrations still require it. |
| P1-04 support identity           | `support@trywireline.com` is now documented and tested as the verified compatibility mailbox, not an accidental public-brand leak. It remains intentionally unchanged until a BotBound-domain mailbox completes external delivery and DNS-authentication proof.                                                                                                                                                                                                                                                                                                                                                                                               |
| P1-03 Call Ops                   | Call Ops analytics is mounted in the visible Calls surface and reads exact aggregate-only metrics independently of call-row pagination. Call history exposes bounded load-more behavior instead of silently presenting a capped history as complete. Focused metrics and analytics truth contracts pass.                                                                                                                                                                                                                                                                                                                                                      |
| Source package integrity         | The refreshed `brand-work/SOURCE-SHA256SUMS.txt` verifies all 50 current compact source-package entries. This resolves source-package revision ambiguity only; it does not clear the separate delivery or rights gate.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Runtime and measurement brand    | Public showcase prompts, live-model context, status copy, connector prose, and Plausible attribution now name BotBound. Stable `wireline` protocol, storage, package, and installed-client identifiers remain intentionally unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Still requires external or live proof

- GitHub required checks and an exact clean-checkout CI run must confirm the locally green code gates.
- `botbound.me` still needs exact-head DNS, TLS, Vercel alias, health, source-commit, cookie, sign-in, checkout, crawl, and share-card certification.
- OpenAI, Anthropic, Cursor, OAuth, Stripe, Twilio, Resend, AgentMail, native, and extension dashboards or hosts must complete the canonical-origin cutover and prove any retained legacy traffic before compatibility endpoints are removed.
- External support send, receive, reply, forwarding, SPF, DKIM, DMARC, bounce, complaint, and response-process evidence remains open.
- The delivery manifest still has six checksum mismatches, and paid-media rights clearance remains a broadcast gate even though the compact source manifest is green.
- Live database drift/backup/restore, one completed paid lifecycle, one consented non-demo call and messaging workflow, carrier approvals, live observability, and funnel-event receipt remain unproven.

## Launch decision by motion

| Motion                                      | Decision              | Minimum gate                                                                                    |
| ------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| Merge this branch                           | CONDITIONAL GO        | Required GitHub checks must reproduce the locally green full release gate on the exact PR head. |
| Deploy BotBound canonical production        | NO-GO                 | P0-01 and P0-02, then exact-head Vercel, database, health, and log proof.                       |
| Founder-led inbound design partners         | CONDITIONAL HOLD      | Code/domain gates plus P1-02, P1-04, P1-05, and one real production workflow.                   |
| Open self-serve paid acquisition            | HOLD                  | P0-04 completed billing lifecycle and first production outcome proof.                           |
| Broad paid media or broadcast               | HOLD                  | P0-03 checksum and rights clearance, plus product/domain release gates.                         |
| Cold or scaled campaign outbound            | HOLD                  | P0-06 federal DNC, consent, registration, and operating evidence.                               |
| Browser store release                       | HOLD AS EARLY ACCESS  | Manual Chromium and Firefox acceptance, store review, and canonical-domain update.              |
| iOS App Store                               | HOLD AS PLANNED       | Signing, simulator and device acceptance, privacy review, and production-origin decision.       |
| Android Play release                        | HOLD AS INTERNAL BETA | Device acceptance, signing, Play data safety, and production-origin decision.                   |
| ChatGPT, Claude, or Cursor directory launch | HOLD AS EARLY ACCESS  | Real host OAuth reviewer flows, callback-origin proof, and directory packet recertification.    |

## Severity model

- P0: Blocks merge, a production release, or the specific launch motion named in the finding.
- P1: Blocks broad launch or creates a material conversion, reliability, evidence, or operating risk.
- P2: Pre-scale cleanup that should be scheduled but does not block a controlled design-partner cohort by itself.

## Audit method and evidence limits

This review covered the public web funnel, auth and onboarding, authenticated workspace, billing, APIs, privacy and security, migrations and RLS, voice and SMS, email and support, browser extension, native clients, MCP clients, analytics, SEO, marketing delivery, and deployment.

Evidence was collected from:

- current source and configuration;
- local static gates and focused Vitest tranches;
- the complete non-E2E repository test estate with nested generated dependencies explicitly excluded;
- current browser-proof artifacts under brand-work/exports/product-proof;
- current source and delivery checksum manifests;
- current runbooks and the most recent repository-held live audit evidence from August 15 and 16.

Important limits:

- The working tree was not clean. Brand, film, generated asset, documentation, and native-icon changes were in progress on top of the audited HEAD. Findings describe that working-tree snapshot, not HEAD alone.
- No implementation, provider state, database state, deployment, Git branch, commit, or pull request was changed by this audit.
- Live Stripe, Supabase, Twilio, Vapi, xAI, Resend, AgentMail, Vercel, Sentry, Plausible, Gmail, Apple, Google Play, and directory dashboards were not available in one authoritative read-only session.
- The latest live counts cited below are inherited evidence, not a claim about the present provider state. They must be refreshed against the exact release.
- The live trywireline.com page was observable with the current BotBound title. The audit browser could not inspect botbound.me, so no conclusion about BotBound DNS, TLS, aliasing, redirect behavior, or served commit is made here.
- Load, destructive recovery, real charges, real calls, real messages, and external sends were intentionally not executed.

## Verification summary

### Passing local evidence

| Check                                                        | Result                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Client TypeScript                                            | Passed.                                                                                                         |
| Server TypeScript                                            | Passed.                                                                                                         |
| Design system                                                | Passed: 10 modules, command palette, 12 public surfaces, and no-em-dash scan.                                   |
| Source-control hygiene                                       | Passed across 2,144 tracked files.                                                                              |
| Documentation links and indexing                             | Passed before this audit file was added.                                                                        |
| Workflow syntax                                              | Passed for 13 GitHub Actions workflows.                                                                         |
| Route registry                                               | Passed: 98 app.use registrations, 130 route files, 115 mounted route modules.                                   |
| Security route precedence                                    | Passed.                                                                                                         |
| Authorization inventory                                      | Existing generated matrix reports 404 routes, 329 protected, 75 explicitly public, 0 violations.                |
| OpenAPI implementation parity                                | Passed for the 23 declared operations.                                                                          |
| CSP parity                                                   | Passed.                                                                                                         |
| Runtime policy                                               | Passed for the OpenAI-first policy.                                                                             |
| Stripe catalog                                               | Passed: 7 products, 13 prices, 8 plan environment targets.                                                      |
| Database schema definition                                   | drizzle-kit check passed across the 160 migration SQL files.                                                    |
| Tenant-owned insert check                                    | Passed.                                                                                                         |
| Server bootstrap and route precedence                        | Passed.                                                                                                         |
| API error-shape ratchet                                      | Passed.                                                                                                         |
| Focused security and data tranche                            | 17 files and 79 tests passed.                                                                                   |
| Focused billing, voice, email, and operations tranche        | 171 of 175 tests passed; failures are discussed under P0-01 and P1-03.                                          |
| Focused MCP, native, browser, deployment, and funnel tranche | 149 of 151 tests passed; the two failures are stale BotBound source assertions.                                 |
| Canonical BotBound release second pass                       | 8 files and 48 tests passed in clean-room mode.                                                                 |
| Browser extension policy/package check                       | Passed.                                                                                                         |
| Marketing measurement consent                                | Passed.                                                                                                         |
| Native release-horizon contract                              | Passed.                                                                                                         |
| MCP HTTP hardening                                           | Passed.                                                                                                         |
| Password screening disclosure                                | Passed.                                                                                                         |
| Stripe checkout tax contract                                 | Passed.                                                                                                         |
| Operational core                                             | Passed.                                                                                                         |
| Production dependency audit                                  | Root and film packages each reported 0 vulnerabilities.                                                         |
| Remotion TypeScript                                          | Passed.                                                                                                         |
| Source delivery integrity                                    | SOURCE-SHA256SUMS.txt verified 50 of 50 files.                                                                  |
| Public browser proof                                         | Four local production-bundle captures returned 200 with no page errors, console errors, or horizontal overflow. |

### Red or incomplete local evidence

| Check                            | Result                                                                                                                    | Meaning                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| npm run verify:contracts         | 1 file failed, 48 passed; 3 tests failed, 299 passed.                                                                     | Required contract gate is red.                                                                         |
| Complete authored non-E2E estate | 34 repository test files failed, 432 passed; 50 tests failed, 2,726 passed.                                               | PR CI cannot pass as configured. Many failures are stale source assertions, but the gate remains real. |
| npm run lint:eslint              | Fails. With nested generated film output excluded, scripts/capture-botbound-launch-proof.mjs still has 7 no-undef errors. | PR CI and canonical production audit are red.                                                          |
| Database drift                   | Could not run without DATABASE_POOL_URL, POSTGRES_URL, or DATABASE_URL.                                                   | Live migration parity is unproven.                                                                     |
| Resend readiness                 | Local audit environment reported RESEND_API_KEY missing.                                                                  | This does not prove production is missing it; live delivery remains unverified.                        |
| Delivery checksum                | 56 of 62 entries match; 6 do not.                                                                                         | Current paid-media package is not the certified revision represented by its manifest.                  |
| Browser visual proof scope       | Home desktop/mobile, Features desktop, Pricing desktop only.                                                              | Authenticated, billing, onboarding, and operator surfaces are not visually cleared by this artifact.   |

## Surface readiness matrix

| Surface                         | Evidence-backed posture                                                                                                                   | Launch gate                                                                                                                  | Primary findings           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Public web and conversion       | Public captures are visually clean. Desktop has proposition and auth. Mobile intentionally hides the proposition and defaults to Sign In. | Fix mobile acquisition context and certify botbound.me exact head.                                                           | P0-02, P1-01               |
| Auth and onboarding             | Security contracts are strong; /signin, /signup, /get-started, reset, invite, OAuth complete, and onboarding routes exist.                | Current browser signup, verification, reset, OAuth, invite, and first-Bot flow at desktop/mobile.                            | P0-01, P1-02               |
| Authenticated workspace         | Broad route inventory exists under /studio, /phone, /inbox, /approvals, /insights, /connections, and /settings.                           | Seeded and zero-state exact-head QA, plus full test triage.                                                                  | P0-01, P1-02, P1-03        |
| Pricing and billing             | Catalog and checkout policy gates pass. Public pricing proof is clean.                                                                    | One live checkout through subscription, webhook, entitlement, portal, cancellation, refund, and ledger reconciliation.       | P0-04                      |
| APIs                            | Route registration, auth matrix, error-shape, and declared OpenAPI parity pass.                                                           | Clean full suite, deployed probes, and clarity about which APIs are public.                                                  | P0-01, P2-04               |
| Security and privacy            | Strong route, signing, SSRF, auth, session, export, deletion, and dependency evidence.                                                    | Live configuration, legal/entity alignment, provider dashboard proof, and exact-head penetration review for broad scale.     | P1-08, P1-11               |
| Database, migrations, RLS       | Drizzle schema check and focused RLS/migration contracts pass.                                                                            | Live drift, schema-effect assertion, backup/PITR proof, and restore drill.                                                   | P1-05                      |
| Calls and voice                 | Twilio/xAI and rollback controls are represented in code and tests.                                                                       | Funding, number state, callbacks, usage alerts, and one inbound and permitted outbound non-demo workflow.                    | P0-05                      |
| SMS                             | Signed webhooks, STOP/HELP, DNC, outcomes, and tenant controls are represented.                                                           | Toll-free or A2P approval, status callbacks, STOP/HELP, consent, and quiet-hour live exercises.                              | P0-05, P0-06               |
| Email and support               | AgentMail, Resend feedback, suppression, unsubscribe, contact, and support routes exist.                                                  | External support delivery and response, AgentMail send/fetch, signed Resend event persistence, bounce/complaint suppression. | P1-04                      |
| Browser extension               | Package freshness and policy checks pass.                                                                                                 | Manual target-browser install, explicit-action handoff, store permission review, canonical-domain update.                    | P1-09                      |
| iOS                             | Native contract tests pass; posture is correctly Planned.                                                                                 | Signing, simulator/device, PushKit/CallKit, privacy, deletion, and production-origin acceptance.                             | P1-09                      |
| Android                         | Native contract tests pass; posture is correctly Internal beta.                                                                           | Build/device, Telecom/FCM, signing, data safety, deletion, and production-origin acceptance.                                 | P1-09                      |
| ChatGPT, Claude, Cursor MCP     | Account-bound MCP/OAuth contract tests pass.                                                                                              | Real host OAuth and PKCE, widget, reviewer, privacy, and callback-origin proof.                                              | P0-02, P1-09               |
| Observability                   | Health, SLO, Sentry relay, logs, and product events exist in source.                                                                      | Exact-head uptime probe, alert receipt, error stream, voice status, provider budget alerts, and rollback observation.        | P1-08                      |
| Product and marketing analytics | Consent contract passes and Plausible/product events are wired.                                                                           | Live event receipt and funnel attribution from botbound.me through demo, signup, activation, and checkout.                   | P1-10                      |
| SEO and share metadata          | BotBound canonical tags, sitemap, robots, JSON-LD, and OG assets exist.                                                                   | Resolve about-page prerender drift, update contract origin, certify social cards on the live canonical domain.               | P0-01, P1-06               |
| Brand and campaign              | Approved identity, copy kit, film source, captions, deck, and Drive index exist.                                                          | Resolve delivery checksums, rights record, and conflicting launch authorities.                                               | P0-03, P1-07               |
| Deployment and rollback         | Runbook is careful about exact head, environment isolation, migrations, billing shutdown, and rollback limits.                            | Green code gates, botbound.me certification, exact-head production evidence, restore/rollback drill.                         | P0-01, P0-02, P1-05, P1-08 |

## P0 findings

### P0-01: Required PR and production release gates are red

Evidence:

- package.json makes test:run and lint:eslint part of the normal verification ladder.
- .github/workflows/ci.yml runs both on pull requests.
- scripts/vercel-build.mjs runs lint:eslint for canonical production and explicit launch-deep-audit builds.
- npm run verify:contracts failed 3 metadata tests in tests/marketing-route-meta-contract.test.ts.
- A repository-only non-E2E run, explicitly excluding apps/botbound-film/node_modules, failed 50 of 2,776 tests across 34 files.
- The raw root test command also discovers nested tests under apps/botbound-film/node_modules when that local package has been installed.
- The clean authored ESLint scope still fails seven browser-global references in scripts/capture-botbound-launch-proof.mjs.

Observed failure clusters include:

- stale trywireline.com expectations after the BotBound canonical-domain change;
- stale About metadata expectations;
- stale WirelineMark and old copy assertions after BotBound UI changes;
- stale AgentMail source-string assertions even where the implementation still fails closed;
- stale xAI/Gateway model expectations after the OpenAI-first runtime change;
- stale migration-journal and pricing-copy strings;
- source-contract failures around authenticated layouts, roster surfaces, SMS, and support that require owner triage;
- one confirmed Call Ops integration gap detailed in P1-03.

Impact:

- The pull request cannot earn a green required CI result as currently configured.
- A canonical production artifact reaches lint:eslint and fails before release completion.
- Red source contracts hide meaningful regressions inside avoidable drift.

Launch gate:

- Blocks merge and production deployment.

Recommended fix:

1. Add the launch-proof capture script to the browser-evaluation ESLint override, or isolate browser callbacks so globals are declared accurately.
2. Change nested ignore patterns to cover any-depth node_modules and dist output for deterministic local tests and lint.
3. Update canonical-domain and metadata tests to BotBound truth.
4. Triage all 34 failing repository suites into: stale assertion, real product regression, or retired historical contract.
5. Preserve behavior-focused protections for failure honesty, tenant isolation, consent, billing, and provider spend. Do not make the suite green by deleting protections wholesale.
6. Re-run npm ci, test:run, lint:eslint, verify:contracts, verify:full, and the production build from a clean checkout.

### P0-02: Public canonical origin and release-certification origin conflict

Evidence:

- src/lib/brand.ts defines https://botbound.me as canonical and https://trywireline.com as legacy.
- index.html, public/sitemap.xml, and src/lib/marketing-route-meta.ts publish botbound.me.
- docs/DEPLOYMENT_RUNBOOK.md says main -> Vercel -> botbound.me and requires GET https://botbound.me/api/health.
- scripts/lib/production-url.mjs hard-codes https://trywireline.com and rejects every other origin.
- scripts/generate-launch-status.mjs consumes that hard-coded production URL.
- .github/workflows/production-visual-qa.yml and scripts/capture-prod-visual-qa.mjs default to trywireline.com.
- scripts/align-stripe-webhook-events.mjs, scripts/check-vendor-readiness.mjs, and multiple provider checks still treat trywireline.com as the production business origin.
- iOS, Android, and the browser extension use trywireline.com as their production runtime.
- ChatGPT, Claude, and Cursor list BotBound pages on botbound.me but keep MCP/OAuth and support on trywireline.com.

Impact:

- The current release tools cannot certify the public domain the product declares canonical.
- A marketing launch could send users and crawlers to an alias whose DNS, TLS, redirect, health, source commit, cookies, OAuth, and provider callbacks were not proven together.
- An accidental redirect of callback paths can break OAuth, webhooks, native clients, MCP hosts, or extension handoffs.

Launch gate:

- Blocks the public BotBound production cutover.

Recommended fix:

1. Define an explicit two-origin contract: public canonical origin and compatibility/callback origin.
2. Centralize that contract for browser code, Node release scripts, native clients, extension manifests, submission packets, provider audits, and runbooks.
3. Certify botbound.me DNS, TLS, Vercel alias ownership, health response, source-commit header, crawl metadata, cookies, sign-in, checkout, and share cards.
4. Maintain an allowlisted path matrix for any trywireline.com callback endpoints that must not redirect.
5. Verify APP_URL, OAuth registrations, Stripe, Twilio, Resend, AgentMail, MCP, native, and extension endpoints against that matrix.
6. Require both public-domain and callback-domain probes in release evidence.

### P0-03: Paid-media delivery integrity and rights are not cleared

Evidence:

- SOURCE-SHA256SUMS.txt verifies 50 of 50 compact repository inputs.
- DELIVERY-SHA256SUMS-R3.txt currently verifies 56 of 62 entries.
- Mismatches are:
  - brand-work/README.md
  - brand-work/CURRENT-ASSET-INDEX.md
  - design-qa.md
  - brand-work/exports/commercial/botbound-commercial-endframe-4k.png
  - brand-work/exports/social/botbound-launch-linkedin-1200x627.png
  - brand-work/gtm/BOTBOUND-LAUNCH-DECK-2026-08-20-contact-sheet.png
- apps/botbound-film/ASSET_MANIFEST.md explicitly requires a final media-rights record before paid broadcast delivery.
- The repository intentionally keeps full-resolution delivery masters in Google Drive, so Drive and local revision identity must agree.

Impact:

- The revision-3 label does not identify the current working assets.
- A buyer, platform, or production partner can receive a file that differs from the approved checksum.
- Paid placement before rights provenance is attached creates avoidable legal and takedown risk.

Launch gate:

- Blocks paid media, broadcast, CTV, and any immutable commercial handoff. It does not by itself block a controlled unpaid product demo.

Recommended fix:

1. Finish the asset optimization and copy revisions.
2. Review final frames, captions, audio, safe areas, and complete BotBound glyphs in every cut.
3. Attach the source-generation and usage-rights record for every generated image and audio source.
4. Create a new immutable delivery revision instead of silently rewriting R3.
5. Verify every local and Drive file against the new manifest and record 100 percent pass.
6. Generate platform transcodes from the certified 4K master, checksum them, and retain the approval record.

### P0-04: A complete live paid lifecycle is still unproven

Evidence:

- The local Stripe catalog contract passes and the application has signed webhook, checkout, portal, entitlement, refund, dispute, and ledger code.
- The latest repository-held live audit, dated 2026-08-16, reported zero live Stripe subscriptions.
- The 2026-08-15 operations review reported zero completed Checkout sessions, PaymentIntents, invoices, Stripe-bound subscriptions, and checkout operations.
- No newer exact-head live lifecycle evidence is stored in the repository.

Impact:

- Configuration correctness is not transaction correctness.
- The first customer could encounter a checkout, webhook, entitlement, portal, cancellation, refund, or reconciliation failure that no repository test reproduces.

Launch gate:

- Blocks open self-serve billing, paid acquisition, and pricing-led scale.

Recommended fix:

1. Deploy the exact green release with self-serve billing initially fail-closed.
2. Run one founder-controlled Starter monthly checkout through success.
3. Verify customer binding, subscription provenance, allowance ledgers, production-number entitlement, invoice, tax posture, and product access.
4. Verify portal access, payment-method update, cancellation, reactivation where supported, refund/dispute paths, and webhook replay/idempotency.
5. Retain redacted IDs and timestamps in an operator evidence record.
6. Open billing only for the approved cohort, observe, then widen.

### P0-05: Real production voice, SMS, and carrier operations are not proven

Evidence:

- Focused voice, webhook, spend, consent, recording, and SMS contracts are strong.
- The latest repository-held live audit reported 114 calls, all marked demo, with zero non-demo calls.
- The same evidence reported zero voice-usage events.
- The August 15 operations review says Twilio/Vapi funding, sender approval, A2P/toll-free posture, callback delivery, and usage alerts were not available through the installed evidence sources.
- docs/VENDOR_LAUNCH_MAP.md correctly states that number inventory is not compliance clearance.

Impact:

- The core promise has not been proven in the exact production environment for a real customer workflow.
- Funding, routing, disclosure, recording, callback, reconciliation, follow-up, or carrier registration failure could surface on the first production interaction.

Launch gate:

- Blocks broad voice/SMS launch. A founder-led inbound design partner is conditional on completing the bounded proof below.

Recommended fix:

1. Verify Twilio funding, number ownership, xAI SIP registration, rollback routing, signature validation, callbacks, usage alerts, and budget alerts.
2. Complete one consented inbound non-demo call with disclosure, transcript, recording policy, summary, outcome, and approved follow-up.
3. Complete one permitted outbound non-marketing call with quiet-hour and consent checks.
4. Exercise SMS delivery, status callback, STOP, HELP, re-opt-in policy, and tenant-scoped thread/outcome ownership.
5. Verify toll-free or A2P registration for the exact sender and intended traffic.
6. Reconcile carrier records, voice-usage events, product events, and customer-visible history.

### P0-06: Cold and scaled marketing outbound remains intentionally fail-closed

Evidence:

- docs/VENDOR_LAUNCH_MAP.md and docs/FOUNDER_LAUNCH_COMMAND_CENTER.md state that federal DNC vendor configuration is unavailable and marketing/campaign outbound must fail closed.
- The focused DNC and outbound compliance contracts pass, which proves the block is deliberate.
- No current live federal DNC probe evidence was available.

Impact:

- Opening cold outbound without this evidence risks unlawful contact, carrier enforcement, complaints, and brand damage.

Launch gate:

- Blocks cold marketing, purchased-list outreach, and scaled campaign outbound. It does not block consented inbound, support, or transactional workflows.

Recommended fix:

1. Configure the real federal DNC vendor credential and endpoint.
2. Run the non-billable probe and persist screening evidence.
3. Document responsible business identity, consent basis, quiet hours, state rules, caller-ID and attestation posture, opt-out handling, and escalation ownership.
4. Start with a tiny reviewed sample, audit every outcome, and widen only after legal and carrier sign-off.

## P1 findings

### P1-01: Mobile acquisition traffic lands on an access wall without the product promise

Evidence:

- src/styles/landing-prestige.css says mobile is access-first and hides .landing-prestige__hero and .landing-prestige__desktop-only at 820 px and below.
- src/components/marketing/WireAgentLanding.tsx mounts AuthAccessPanel with initialMode set to signin.
- The 390 x 844 proof shows the BotBound lockup and Sign In form, but no explanation of calls, texts, email, the Phone Bot, Free Builder, demo, roles, or pricing.
- Desktop shows the proposition and proof beside the same auth panel.

Impact:

- New mobile visitors from social, QR, paid media, or word of mouth are asked to sign in before they know what BotBound is.
- Existing-user intent is prioritized over acquisition intent at the highest-volume top-of-funnel viewport.

Launch gate:

- Blocks performance marketing and materially weakens an otherwise controlled public launch.

Recommended fix:

- Keep the compact access panel, but add one small promise block, the approved robot, Put Your Bot on the Line., and a primary Build Free or Hear the Phone Bot action above it.
- Default acquisition routes to account creation while keeping Sign In secondary.
- Measure view -> demo -> signup and view -> signup by viewport.

### P1-02: Authenticated, onboarding, billing, and operator visual QA is not current

Evidence:

- brand-work/exports/product-proof/botbound-launch-proof.json contains four routes: Home desktop, Home mobile, Features desktop, and Pricing desktop.
- No current proof artifact covers signup completion, verification, reset, invite, onboarding, empty Studio, seeded Studio, Phone, Inbox, Approvals, Connections, Billing, team, compliance, admin, or error/degraded states.
- tests/e2e contains relevant journeys, but no exact-head execution record for the audited working tree was available.
- The complete repository contract estate is red.

Impact:

- Public chrome can look finished while the first five minutes after signup contain a redirect, empty-state, loading, billing, mobile, or degraded-state regression.

Launch gate:

- Blocks design-partner onboarding and broad launch until current evidence exists.

Recommended fix:

- Run a clean seeded and zero-state browser matrix on the exact preview SHA.
- Cover phone and desktop for signup, email verification, OAuth, reset, first Bot, private simulation, paid activation, line setup, first call, text, email, approval, history, portal, cancellation, and account deletion.
- Capture console, network, accessibility, focus, overflow, and route-state evidence.

### P1-03: Call Ops analytics is orphaned and call history is silently capped

Evidence:

- src/components/CallLogsClaude.tsx requests limit=100 and offset=0.
- CallsResponse defines total and hasMore, but the component does not use them to paginate or disclose truncation.
- src/components/CallOpsAnalytics.tsx fetches aggregate-only metrics from /api/call-ops/analytics.
- No current product component imports CallOpsAnalytics.
- tests/call-ops-analytics-truth-contract.test.ts and tests/call-ops-metrics-truth-contract.test.ts fail around this integration.

Impact:

- Customers with more than 100 calls see incomplete history without knowing it.
- Exact aggregate metrics exist server-side but are absent from the visible Call Ops surface.

Launch gate:

- Blocks claims that every outcome and complete analytics are visible at meaningful usage.

Recommended fix:

- Mount the aggregate analytics component in the Phone/Call History owner.
- Add cursor or offset pagination with total and hasMore truth.
- Keep transcript-bearing rows out of metric aggregation and render errors separately from a true empty state.

### P1-04: Email delivery and support operations are not proven end to end

Evidence:

- AgentMail fetch code logs and rethrows IMAP errors; several failing tests are brittle source assertions rather than proof that it fails open.
- Resend feedback, suppression, unsubscribe, support ticket, and AgentMail webhook routes exist.
- The local Resend readiness check had no RESEND_API_KEY.
- The latest live evidence reported zero connected email accounts, zero Resend webhook events, and no support tickets found in the connected Gmail review.
- Public support and submission packets still use support@trywireline.com while the public brand is BotBound.

Impact:

- The first customer may not receive a recap or support response, or BotBound may not record bounce, complaint, and suppression feedback.
- Mixed brand and support domains can reduce trust or create routing ambiguity.

Launch gate:

- Blocks design-partner onboarding until at least support and transactional delivery are proven.

Recommended fix:

- Send an external support request, receive it, reply, and verify the stated service process.
- Exercise AgentMail create/fetch/send and signed webhook handling.
- Exercise Resend delivered, bounced, complained, and rejected events and verify durable suppression.
- Document whether support@trywireline.com is an intentional compatibility address, add a BotBound alias, and verify SPF, DKIM, DMARC, return path, and reply handling.

### P1-05: Live database drift, backup, PITR, and restore evidence is absent

Evidence:

- drizzle-kit check passed and focused RLS, tenant-pool, migration-journal, schema-effect, export, deletion, and purge contracts passed.
- docs/AUTHZ_MATRIX.md reports zero mounted-route authorization violations.
- npm run db:drift could not run because no database URL was available.
- The August 16 audit says backup and PITR settings were not proven and a restore drill remained required.
- docs/DEPLOYMENT_RUNBOOK.md correctly warns that a Vercel rollback does not reverse migrations.

Impact:

- Source correctness does not prove the live database is at the same journal, grants, RLS policies, indexes, and functions.
- A bad migration or data incident lacks demonstrated recovery time and procedure.

Launch gate:

- Blocks broad launch and should be complete before material customer data accumulates.

Recommended fix:

- Run read-only drift and production schema-effect checks against the exact release database.
- Record migration journal head, grants, RLS, policies, extensions, and critical functions without customer data.
- Verify backup/PITR settings and complete a restore into an isolated scratch project.
- Time the recovery, validate tenant isolation, and document forward-fix versus restore decision ownership.

### P1-06: SEO and share metadata has one real drift plus stale verification

Evidence:

- index.html, sitemap, robots, JSON-LD, and OG URLs use botbound.me.
- src/lib/marketing-route-meta.ts gives /about the title ABOUT BotBound | AI EMPLOYEES FOR CONVERSATIONS AND FOLLOW-THROUGH and a short description.
- src/pages/About.tsx hydrates a different title and longer description.
- tests/marketing-route-meta-contract.test.ts and tests/sitemap-prerender-parity-contract.test.ts still parse or expect trywireline.com.
- src/pages/Compare.tsx says competitor prices were checked on August 1, 2026.

Impact:

- Non-rendering crawlers and social bots can see different About metadata than hydrated browsers.
- Stale tests do not protect the live BotBound origin.
- Comparison pricing can become inaccurate between publication and a campaign.

Launch gate:

- Resolve before indexing campaigns, press outreach, or paid sharing.

Recommended fix:

- Make one route metadata registry authoritative for prerender and runtime PageMeta.
- Update tests and sitemap parsing to botbound.me.
- Validate every sitemap route and OG image on the deployed canonical domain.
- Recheck competitor pricing from official pages on publication day and date-stamp or temporarily hide entries that cannot be verified.

### P1-07: Active brand, product, and launch authorities contradict one another

Evidence:

- brand-work/BOTBOUND-BRAND-GUIDE.md approves BotBound, Put Your Bot on the Line., and AI employees for calls, texts, and email.
- docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md is still marked Active launch authority, names Wireline, says Voice agents that get the work done., and says to avoid AI employee as the primary noun.
- docs/FOUNDER_LAUNCH_COMMAND_CENTER.md repeats the no-AI-employee rule.
- src/lib/product-copy.ts uses Build -> Configure -> Launch -> Improve.
- brand-work/SECOND-RING-CAMPAIGN.md and the old launch source use Build -> Train -> Launch -> Improve.
- docs/README.md and multiple submission packets still lead with Wireline doctrine.

Impact:

- Press, founder posts, ads, product UI, support, and AI-connected surfaces can describe different products.
- Teams cannot reliably resolve a copy dispute because multiple documents claim authority.

Launch gate:

- Blocks coordinated launch publishing even if the application is technically available.

Recommended fix:

- Create one dated BotBound launch authority and mark the Wireline authority historical or compatibility-only.
- Decide the primary category noun and the one public operating loop.
- Define where Wireline may remain as a technical or callback identifier.
- Update canonical docs, product copy, submission packets, support scripts, campaign files, and QA contracts from that decision.

### P1-08: Exact-head production observability and rollback proof is not current

Evidence:

- The source includes health, protected readiness, SLO, voice status, browser-to-server Sentry relay, job/webhook monitoring, and release log checks.
- docs/DEPLOYMENT_RUNBOOK.md has a strong exact-head and rollback procedure.
- No Vercel deployment ID, botbound.me source commit, current production health, current error/fatal stream, alert receipt, or rollback exercise was available for this working tree.
- Historical docs mention GitHub hosted-runner billing failure, but that external state was not rechecked here.

Impact:

- A green local artifact can still fail due to environment targeting, provider state, aliasing, runtime errors, or alerts that no one receives.

Launch gate:

- Blocks production promotion and broad traffic.

Recommended fix:

- Record exact SHA, deployment ID, aliases, environment gate, migration result, health, voice status, SLO, fresh error logs, and alert receipts after promotion.
- Exercise the billing shutdown switch and a safe application rollback.
- Explicitly record that database and provider changes need forward-fix or separate recovery.

### P1-09: Companion surfaces pass contracts but lack host and device acceptance

Evidence:

- Browser extension packaging checks pass and the committed download packages are fresh.
- iOS and Android contract tranches pass and their docs correctly label Planned and Internal beta.
- MCP/OAuth contract tranches for ChatGPT, Claude, and Cursor pass.
- Native and extension runtime URLs still use trywireline.com.
- No current manual Chromium/Firefox, iOS simulator/physical device, Android emulator/physical device, ChatGPT, Claude, or Cursor reviewer-flow evidence was available.

Impact:

- Store permissions, signing, deep links, OS call integrations, OAuth host behavior, and review metadata can fail despite source contracts.

Launch gate:

- Does not block the core web design-partner launch if these surfaces remain accurately labeled. Blocks marketing or directory/store release for the affected surface.

Recommended fix:

- Execute the release checklists in docs/CLIENT_SURFACES.md on the exact release.
- Keep every companion optional and accurately labeled until accepted.
- Update brand, support, privacy, and origin metadata together.

### P1-10: Funnel analytics is wired but not proven live on the canonical domain

Evidence:

- public/marketing-measurement.js loads Plausible and optional advertising measurement under the documented consent model.
- The marketing consent contract passes.
- Product event clients emit demo, signup, activation, checkout, and operational events.
- No live event receipt or end-to-end UTM attribution evidence from botbound.me was available.

Impact:

- Launch traffic can arrive without reliable knowledge of which creative, CTA, device, or stage fails.
- Consent or domain configuration can silently suppress the events needed for launch decisions.

Launch gate:

- Blocks paid optimization and makes broad launch learning unnecessarily blind.

Recommended fix:

- On the exact production domain, verify consent states and event receipt for landing, demo start, signup start, signup complete, first Bot, private test, checkout start, checkout complete, first line, first call, and first outcome.
- Use the UTM convention in brand-work/gtm/BOTBOUND-LAUNCH-COPY-KIT.md.
- Build a small daily funnel review with raw counts, conversion, errors, support load, and source commit.

### P1-11: Legal entity, contact, and provider identity alignment is not recertified for BotBound

Evidence:

- The August 16 audit required legal entity alignment across Stripe, terms, invoices, email, carrier accounts, and contracts.
- Current public branding is BotBound while support and several provider-facing endpoints retain Try Wireline.
- Privacy, terms, data deletion, platform submissions, carrier identity, statement descriptor, and invoice branding span multiple files and external dashboards.

Impact:

- Customers can see inconsistent merchant, sender, support, and product identities.
- Provider review or disputes can be delayed when the public brand and responsible legal identity are not explicitly connected.

Launch gate:

- Blocks broad paid launch and regulated outbound until documented.

Recommended fix:

- Publish an approved identity matrix for public brand, legal entity, merchant, email sender, carrier registrant, support domain, invoice, statement descriptor, app-store seller, and OAuth authorization server.
- Recertify each public and provider-facing surface against it.

### P1-12: Current capacity and failure-recovery behavior is not load-proven

Evidence:

- docs/LOAD_TEST.md and provider-spend, queue, retry, reservation, and webhook contracts exist.
- No exact-head load, soak, burst, rate-limit, queue-backlog, or provider-degradation result was available for the audited release.
- A live load test was intentionally not run during this review.

Impact:

- Broad launch can reveal queue saturation, database-pool pressure, webhook retries, provider budgets, or alert thresholds only after customers arrive.

Launch gate:

- Blocks broad media and volume traffic, but not a tightly capped founder cohort.

Recommended fix:

- Run the documented non-customer load profiles against an isolated or controlled environment.
- Prove rate limiting, queue drain, idempotency, budget stops, backpressure, and recovery.
- Set a cohort cap that stays below the measured safe envelope.

## P2 findings

### P2-01: Test and lint ignore patterns are root-relative

vitest.config.ts and eslint.config.mjs ignore node_modules and dist only at the root pattern. Installing or building apps/botbound-film causes the root tools to discover nested generated tests and bundles. Use any-depth ignores so the same source tree produces the same result before and after film work.

### P2-02: Legacy Wireline names remain visible beyond pure technical compatibility

Download filenames, extension routes, native documentation, public changelog copy, submission packets, environment names, and support addresses retain Wireline. Some are safe compatibility identifiers. Classify every occurrence as technical, callback, legal, or customer-visible, then remove or explain customer-visible leftovers.

### P2-03: Retired Live Video documentation is internally inconsistent

docs/VENDOR_LAUNCH_MAP.md says Live Video is retired, while older commercial and operations evidence still describes a recurring add-on. Archive or annotate the obsolete commercial language so sales, support, and AI surfaces cannot resurrect it.

### P2-04: OpenAPI scope is narrower than the mounted API estate

The OpenAPI parity gate passes for 23 declared operations while the authorization matrix inventories 404 routes. That can be correct if OpenAPI is explicitly the supported external API subset. State that boundary on /developers and in the spec so customers do not infer that undocumented internal routes are stable.

### P2-05: Comparison pricing needs an operating owner

The page links official sources and dates its check, which is good. Add an owner and publish-day or scheduled revalidation rule. Competitor price changes should fail publishing or remove the row, not silently age.

### P2-06: Release evidence is spread across durable docs, dated audits, Drive, and generated proof

The repository has excellent material but no single immutable release ledger tying commit, deployment, domain, migration, provider proof, browser matrix, commercial assets, and final decision. Add a compact redacted release record per launch revision.

## Recommended execution order

1. Freeze the intended source and asset revision. Stop changing delivery files while certification runs.
2. Fix P0-01 from a clean checkout until PR CI, verify:contracts, verify:full, and the canonical production audit are green.
3. Resolve the two-origin architecture in P0-02 and certify botbound.me plus compatibility callback paths.
4. Produce the next immutable media delivery manifest and complete rights clearance.
5. Deploy an exact-head preview and run the complete public, auth, onboarding, authenticated, billing, and accessibility matrix.
6. Run live read-only Vercel, Supabase, Stripe, Twilio/xAI, Resend/AgentMail, Sentry, Plausible, carrier, and MCP readiness checks.
7. Complete database drift, schema effects, backup/PITR, and isolated restore evidence.
8. Complete one founder-controlled paid lifecycle and reconcile all billing records.
9. Complete one consented real inbound workflow from ring through follow-up, plus support and email delivery proof.
10. Admit 3 to 5 founder-led design partners into one bounded inbound job each.
11. Observe activation, useful outcome, repeat use, support minutes, provider cost, error rate, and churn reason for at least one operating cycle.
12. Open self-serve, paid media, companion stores, and outbound as separate decisions. Do not let one green lane imply all lanes are green.

## Minimum immutable release ledger

For the release that is actually launched, retain one redacted record containing:

- source commit and clean-tree confirmation;
- CI run and required-check results;
- Vercel deployment ID, project ID, environment, aliases, and served source commit;
- botbound.me and compatibility-origin DNS/TLS/redirect/path results;
- migration journal head, schema-effect result, backup setting, and restore-drill reference;
- Stripe catalog, checkout, subscription, invoice, portal, cancellation, and reconciliation references;
- Twilio number, SIP registration, call, message, callback, usage-alert, and carrier-registration references;
- Resend/AgentMail delivery, webhook, suppression, and support-thread references;
- health, voice status, Sentry/log, uptime, alert, and Plausible funnel proof;
- authenticated browser/device/host QA matrix;
- asset delivery revision, 100 percent checksum result, rights approval, and Drive location;
- explicit GO/HOLD decision for each motion in this audit.

## Source notes

Current repository facts were inspected in:

- package.json
- .github/workflows/ci.yml
- .github/workflows/verify-full.yml
- .github/workflows/production-visual-qa.yml
- scripts/vercel-build.mjs
- scripts/lib/production-url.mjs
- scripts/capture-prod-visual-qa.mjs
- scripts/capture-botbound-launch-proof.mjs
- scripts/check-vendor-readiness.mjs
- scripts/align-stripe-webhook-events.mjs
- src/lib/brand.ts
- src/lib/product-copy.ts
- src/lib/marketing-route-meta.ts
- src/lib/plan-catalog.ts
- src/App.tsx
- src/routes/AppRoutes.tsx
- src/server/register-api-routes.ts
- src/components/marketing/WireAgentLanding.tsx
- src/styles/landing-prestige.css
- src/components/CallLogsClaude.tsx
- src/components/CallOpsAnalytics.tsx
- src/pages/About.tsx
- src/pages/Compare.tsx
- public/sitemap.xml
- public/robots.txt
- docs/AUTHZ_MATRIX.md
- docs/DEPLOYMENT_RUNBOOK.md
- docs/CLIENT_SURFACES.md
- docs/DATABASE_OPERATIONS.md
- docs/VENDOR_LAUNCH_MAP.md
- docs/FOUNDER_LAUNCH_COMMAND_CENTER.md
- docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md
- brand-work/BOTBOUND-BRAND-GUIDE.md
- brand-work/SECOND-RING-CAMPAIGN.md
- brand-work/CURRENT-ASSET-INDEX.md
- brand-work/SOURCE-SHA256SUMS.txt
- brand-work/DELIVERY-SHA256SUMS-R3.txt
- apps/botbound-film/ASSET_MANIFEST.md
- apps/botbound-film/VERIFICATION.md
- design-qa.md
- ios/Wireline/Networking/WirelineConfig.swift
- android/app/build.gradle.kts
- apps/browser-extension/manifest.base.json
- chatgpt-app-submission.json
- claude-connector-submission.json
- plugin.json

Inherited live evidence is explicitly time-bounded to:

- docs/reviews/2026-08-16-final-design-and-launch-readiness.md
- docs/reviews/2026-08-15-wireline-production-ops-review.md

Those live observations must be rerun. They are used here only to identify unclosed proof gates, never as invented current customer, revenue, performance, certification, or availability claims.
