# BotBound Launch Surface Test Matrix

Date: 2026-08-20

Audit snapshot: branch HEAD `3d1c0fe0c3ec2793dbc805f949b12f222d042f9d` plus the shared uncommitted launch worktree

Scope: package scripts, CI, routes, production environment gates, release artifacts, browser extension, native clients, Remotion/media, accessibility, responsive behavior, and failure/recovery paths.

## Resolution update

This matrix preserves the initial adversarial snapshot below. Its repository blockers were subsequently resolved on the same launch branch. The final staged tree passes the complete `npm run verify:full` gate: 469 test files and 2,792 tests, production build and server smoke, 79 Playwright journeys with 6 intentionally skipped credential-dependent design-gold captures, and browser-extension package integrity. The BotBound film also passes its TypeScript check and Remotion bundle, and `brand-work/SOURCE-SHA256SUMS.txt` verifies all 50 current compact source-package entries.

The historical **HOLD** below is therefore superseded for source merge by a conditional go pending required GitHub checks on the published PR head. It is not a production-launch approval: exact-head deployment proof, provider-dashboard callback cutover, support-email delivery proof, paid lifecycle, consented live voice/messaging, database operations, carrier compliance, media rights, and final delivery certification remain external gates.

## Historical snapshot decision

**HOLD the current branch from merge and do not call Revision 3 creative delivery certified yet.**

The deployed web baseline is healthy: both public aliases returned HTTP 200, public health was operational, and all 30 canonical sitemap URLs returned HTTP 200. The source-level route, security, OpenAPI, CSP, extension, and selected failure-recovery contracts are also strong.

Two objective blockers remain in this snapshot:

1. The CI unit gate is red: 34 repository test files have 50 failing assertions.
2. The immutable Revision 3 delivery manifest is red: 56 of 62 files match and 6 have changed since certification.

The branch also has a public-brand blind spot, incomplete `botbound.me` cutover automation, and native/store/device surfaces that are explicitly not release-certified.

## State definitions

| State | Meaning |
| --- | --- |
| PASS | Direct command or live probe passed in this audit. |
| FAIL | Direct command or integrity check failed. |
| PARTIAL | Some layers passed, but required proof or automation is missing. |
| UNTESTED | Not safely testable here, requires credentials, a browser binary, provider console access, a store, or physical hardware. |
| PLANNED | Repository explicitly says the surface is not a current launch surface. |

## Priority findings

### B-01: Root CI unit gate is red

Severity: blocker

Evidence: `npm run test:run -- --reporter=dot` exited 1.

- 597 test files passed.
- 34 repository test files failed.
- 4,589 tests passed.
- 50 repository assertions failed.
- An additional 24 file-load failures came from `apps/botbound-film/node_modules`. Those are local nested-package discovery contamination, not expected on a clean root-only `npm ci`, but they make local `npm run test:run` unreliable after working on the film package.

The repository failures include likely stale source-reading contracts after the BotBound rename and UI refactor, plus contracts whose semantics require review. CI still runs this exact unit command, so stale tests are release blockers even when runtime behavior is correct.

Recommended closure:

1. Reconcile the 34 repository files by behavior cluster.
2. Add an explicit root Vitest exclusion for nested `**/node_modules/**` so installing the film package cannot contaminate root verification.
3. Re-run `npm run test:run`, then the CI ladder, from the final exact head.

### B-02: Revision 3 delivery checksum drift

Severity: blocker for creative distribution

Evidence:

- `sha256sum -c brand-work/SOURCE-SHA256SUMS.txt`: PASS, 50 of 50.
- `sha256sum -c brand-work/DELIVERY-SHA256SUMS-R3.txt`: FAIL, 56 of 62.

Mismatched delivery files:

1. `brand-work/README.md`
2. `brand-work/exports/commercial/botbound-commercial-endframe-4k.png`
3. `brand-work/exports/social/botbound-launch-linkedin-1200x627.png`
4. `brand-work/gtm/BOTBOUND-LAUNCH-DECK-2026-08-20-contact-sheet.png`
5. `design-qa.md`
6. `brand-work/CURRENT-ASSET-INDEX.md`

The source manifest accurately describes current repository inputs, while the delivery manifest describes an earlier Drive snapshot. Do not silently rewrite an immutable certified manifest. Publish a new revision only after the six changed files are reviewed in context, uploaded, and checksummed as one coherent package.

### B-03: Visible Wireline copy can bypass the brand sweep

Severity: high

Evidence: the visible-brand test passed, but its compatibility rule allowlists an entire line when it contains `trywireline.com`. That lets a retired display name on the same line pass.

Current deterministic customer output includes:

- Post-call email: `Open the call ... in Wireline` in `src/lib/post-call-digest.ts`.
- SMS HELP response: `Wireline SMS help` in `src/routes/twilio-webhook-base.ts`.
- Voice-tool result: `already has a Wireline account` in `src/lib/vapi-tool-handlers.ts`.
- iOS Wallet copy: `manage billing at wireline.com` in `ios/Wireline/Views/WalletView.swift`.

The bare `wireline.com` link is not a BotBound property. A live probe redirects it to [Wireline Technologies](https://www.wireline.com/), an industrial rigging-sheave company. This must not ship in a native release.

The legacy strings in `src/lib/showcase-assistant.ts` are a different case: `showcasePromptTruthGuard` rewrites the assistant name, first message, and system prompt before the Vapi response is delivered. Keep that last-mile guard, but do not use its existence to allow unrelated email, SMS, or tool-result leaks.

Recommended closure: make compatibility allowlists term-scoped, add direct assertions over generated email/SMS/tool output, and replace the four visible leaks.

### B-04: Canonical-domain policy and release automation disagree

Severity: high

Evidence:

- `src/lib/brand.ts` and public metadata define `https://botbound.me` as canonical.
- `docs/DEPLOYMENT_RUNBOOK.md` says production is `botbound.me` and the legacy host should remain only for callback compatibility.
- `scripts/lib/production-url.mjs` still calls `https://trywireline.com` the canonical production URL and refuses any other certification target.
- Extension handoffs, native release URLs, Stripe portal reconciliation, webhook alignment, production dogfood, and vendor readiness remain hard-coded to `trywireline.com` in multiple places.

Live probe result at the audit snapshot:

| Probe | Result |
| --- | --- |
| `https://botbound.me/` | 200 |
| `https://trywireline.com/` | 200 |
| Homepage payload comparison | Byte-identical, SHA-256 `63af25cf...` |
| Pricing payload comparison | Byte-identical, SHA-256 `7cceee1d...` |
| Both `/api/health/public` | 200, operational |
| Both deployed source commits | `8b4aa48b2b8b2c44d4c36fd7f568f8ca7067a419` |
| Current branch HEAD | `3d1c0fe0c3ec2793dbc805f949b12f222d042f9d` plus uncommitted work |

There is no current outage, but launch certification can pass against the legacy alias without proving the declared canonical alias and provider cutover. Both aliases serving content without a redirect also means the runbook's end-state has not been reached.

Recommended closure: choose and document the transition state, then make certification probe both aliases and the exact source commit. Do not retire legacy callbacks until provider dashboards and webhook traffic are verified.

### B-05: Environment sources of truth drift

Severity: high for operations, not a secret leak

Evidence:

- The authoritative production gate fails closed. In an empty production environment, `scripts/check-prod-env.mjs` exited 1 and named 14 required variables.
- `scripts/check-vercel-env-health.mjs` can print `CORE READY` after checking only Postgres, pool, JWT, and Upstash plus the retired browser key. It treats required native voice, OAuth state, Stripe, Resend, and other authoritative production requirements as optional or does not check them.
- `.env.example` says `WIRELINE_STRUCTURED_PRIMARY_PROVIDER` defaults to xAI, while `src/lib/reasoning-provider-policy.ts` sets the default and first lane to OpenAI.
- `src/lib/env-validator.ts` still accepts retired `VITE_VAPI_PUBLIC_KEY`, while `.env.example`, deployment-boundary checks, and sanitization say it must never be reintroduced.

Recommended closure: make the health report consume the same required-variable catalog as the production gate, align `.env.example` with the runtime provider order, and reject the retired browser key in every validator.

### B-06: Visual and media automation misses normal releases

Severity: high for launch confidence


- PR visual QA runs only when `src/**` or its own scripts/workflow change. Asset-only changes under `public/**`, `brand-work/**`, and `apps/botbound-film/**` do not trigger it.
- Production visual QA runs on main only when its capture script or workflow changes. A normal UI or asset release does not trigger production capture.
- Root CI does not install or verify `apps/botbound-film`, export captions, list compositions, render review outputs, or validate either brand checksum manifest.
- There is no automated browser-store runtime test for the extension and no physical-device release gate for native apps.

Recommended closure: add focused path-aware jobs for brand manifest verification, Remotion check/compositions/captions, asset-only visual QA, and post-deploy canonical route capture.

## Launch surface matrix

| Surface | State | Evidence | Remaining gap |
| --- | --- | --- | --- |
| Root source-control hygiene | PASS | 2,144 tracked files checked | Does not protect ignored film outputs or Drive state. |
| Workflow syntax | PASS | 13 workflows parsed | Syntax does not detect missing path coverage. |
| Root unit estate | FAIL | 34 repository files, 50 assertions failed | Must be green before merge. |
| Local nested package isolation | FAIL | 24 dependency test files discovered under film `node_modules` | Exclude nested dependencies from root Vitest. |
| Documentation organization | PASS before this report | Indexes and local Markdown links passed | This new dated report must be added to `docs/AUDIT_INDEX.md` by the integrating change. |
| Route registry | PASS | 98 `app.use` registrations, 130 route files, 115 mounted | Live authenticated/provider flows still need exact-head smoke. |
| Security route precedence | PASS | Static precedence gate passed | No live attack-path exercise in this audit. |
| OpenAPI implementation | PASS | 23 operations matched implementation | Raw generator retains example-host and Wireline compatibility text, but managed runtime normalizes it. |
| CSP | PASS | `vercel.json` and source policy match | Recheck after final build/deploy. |
| Canonical public sitemap | PASS | 30 of 30 `botbound.me` URLs returned 200 | Status alone does not prove page content or interaction quality. |
| Live production health | PASS for deployed baseline | Both aliases operational at commit `8b4aa48...` | Not the current branch exact head. |
| Domain and OAuth cutover contract | PASS / PARTIAL | 11 cutover/brand assertions passed; callback paths derive from origin | Provider-console registrations and real connect/disconnect flows untested. |
| Production environment failure mode | PASS | Empty production env blocked with 14 required variables | Live Vercel metadata and secret validity not read in this audit. |
| Vercel environment health report | FAIL as authority | Required set differs from production gate | Can mislead operators with `CORE READY`. |
| Stripe placeholder fallback | PASS with caution | `sk_test_placeholder` only constructs the SDK; routes use `stripeAvailable()` and fail closed | Keep direct call sites gated and covered. |
| Browser extension policy | PASS | MV3, no host permissions, no `tabs`, activeTab/scripting, Chromium side panel, Firefox sidebar | Actual browser handoff and restricted-page behavior untested. |
| Browser extension artifact freshness | PASS | Dist zips equal published zips; Chromium 38,666 bytes, Firefox 38,707 bytes | Store signing, listings, screenshots, and review untested. |
| Browser extension identity | PARTIAL | Display name is BotBound Command | User-facing zip names and technical Firefox ID remain Wireline; handoffs hard-code legacy origin. |
| iOS display identity | PASS | Bundle display name, name, and permission copy use BotBound | Internal project/bundle identifiers remain compatibility names. |
| iOS release readiness | PLANNED / FAIL for release | `DEVELOPMENT_TEAM` empty; simulator only; launch command ignores failure with `|| true` | No archive/signing, TestFlight, App Store, PushKit/CallKit/device, Live Activity, or CarPlay proof. |
| Android release readiness | PLANNED / PARTIAL | App label BotBound; debug assemble workflow exists | Version 0.1.0, no release signing/tests/device/Play track proof. |
| Native backend origin | PARTIAL | Both clients target a currently healthy legacy alias | Hard-coded legacy origin; iOS debug defaults to a Vercel preview alias. |
| Remotion composition package | PASS | Six registered cuts; TypeScript, bundle, composition listing, captions, and review renders previously passed on this exact launch work | No CI and ignored outputs depend on external delivery. |
| Media review outputs | PASS for review files | 30s 4K master and 30/15/6 horizontal, 15/6 vertical, 10s square review files probe as H.264 at 30 fps | Broadcast/platform masters still require context review and final checksum. |
| Accessibility captions | PASS | JSON, SRT, VTT for 30s, 15s, 6s; caption hashes match delivery manifest | Platform ingestion and human caption review untested. |
| Source asset integrity | PASS | 50 of 50 source manifest entries match | Source manifest is not a delivery certificate. |
| Delivery asset integrity | FAIL | 56 of 62 Revision 3 entries match | Publish and certify a new coherent revision. |
| Static accessibility | PASS | AST contract passed | Scope is limited to alt text, tabindex, custom buttons, and aria-hidden focusability. |
| Browser accessibility | UNTESTED here | PR and main workflows exist | Local live attempt blocked because no Playwright Chromium executable was installed. |
| Responsive source contract | PASS | Viewport ownership/source contract passed | Browser-rendered overflow at final exact head not proven here. |
| PR visual responsive coverage | PARTIAL | Six widths from 360 to 1440 are configured | Path filters omit asset-only and native/film changes. |
| Failure/recovery focused sample | FAIL / mostly passing | 7 of 10 files and 60 of 66 assertions passed | Six stale or mismatched assertions still block CI. |
| External public links | PARTIAL | Canonical sitemap passed; `wireline.com` proved wrong for BotBound | Drive links, app-store links, provider consoles, and mailto delivery not exhaustively probed. |

## Remotion and media evidence

Registered composition IDs:

| ID | Canvas | Frames | Runtime |
| --- | ---: | ---: | ---: |
| `BotBound-SecondRing-30s-4K` | 3840x2160 | 900 | 30s |
| `BotBound-SecondRing-15s-4K` | 3840x2160 | 450 | 15s |
| `BotBound-SecondRing-6s-4K` | 3840x2160 | 180 | 6s |
| `BotBound-SecondRing-15s-Vertical-4K` | 2160x3840 | 450 | 15s |
| `BotBound-SecondRing-6s-Vertical-4K` | 2160x3840 | 180 | 6s |
| `BotBound-SecondRing-10s-Square-4K` | 2160x2160 | 300 | 10s |

Selected review output metadata:

| File | Resolution | Duration | Bytes | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `botbound-second-ring-30s-4k.mp4` | 3840x2160 | 30.016s | 23,058,145 | Delivery manifest verified |
| `botbound-second-ring-6s-vertical-review.mp4` | 1080x1920 | 6.016s | 3,002,319 | `3a5f2539...` |
| `botbound-second-ring-10s-square-review.mp4` | 1080x1080 | 10.026667s | 2,059,562 | `bb302d3f...` |

All probed MP4 files were H.264 at 30 fps. Review contact sheets for the new vertical and square cuts were visually inspected during film-package creation. The ignored `out/` directory is reproducible review evidence, not a durable delivery source.

## Failure and recovery evidence

The clean-room focused run covered roster degradation, AgentMail and SMS error honesty, checkout recovery, chunk recovery, notification durability, sign-in failure durability, silent-failure controls, and Vapi degraded runtime.

Result: 7 files passed, 3 failed; 60 tests passed, 6 failed.

The six sampled failures are mostly contract drift rather than evidence that the runtime now fails open:

- AgentMail still logs and rethrows, but the test hard-codes the old catch-variable name.
- BotBound compliance copy is correct, but a test still demands Wireline text.
- Migration `0156_openai_runtime_cohesion` is journalled, but a test demands that `0155` remain last.
- Roster/UI tests demand removed surfaces or exact source strings after the workspace refactor.

These should be updated only after confirming the new behavior preserves the original fail-honest invariant.

## Repository failing test inventory

The 34 repository files failing in the full root run were:

1. `tests/agent-roster-degraded-contract.test.ts`
2. `tests/agentmail-inbox-error-honesty-contract.test.ts`
3. `tests/agentmail-mailbox-contract.test.ts`
4. `tests/ai-gateway-runtime.test.ts`
5. `tests/ai-supervisor-live-communication.test.ts`
6. `tests/auth-transition-case-contract.test.ts`
7. `tests/authenticated-agent-flow-contract.test.ts`
8. `tests/authenticated-responsive-polish-contract.test.ts`
9. `tests/authenticated-workspace-design-contract.test.ts`
10. `tests/call-ops-analytics-truth-contract.test.ts`
11. `tests/call-ops-metrics-truth-contract.test.ts`
12. `tests/canonical-phone-routes-contract.test.ts`
13. `tests/empty-state-route-hygiene-contract.test.ts`
14. `tests/full-surface-audit-fixes-contract.test.ts`
15. `tests/industry-leader-audit-contract.test.ts`
16. `tests/launch-readiness-finetune-2026-07-27-contract.test.ts`
17. `tests/launch-readiness-septuple-pass-2026-07-27-contract.test.ts`
18. `tests/launch-readiness-sextuple-pass-2026-07-27-contract.test.ts`
19. `tests/launch-regression-restoration-contract.test.ts`
20. `tests/marketing-centering-contract.test.ts`
21. `tests/marketing-copy-hyphen-contract.test.ts`
22. `tests/marketing-route-meta-contract.test.ts`
23. `tests/plan-economics-contract.test.ts`
24. `tests/product-doctrine-parity-contract.test.ts`
25. `tests/public-iphone-prestige-contract.test.ts`
26. `tests/safe-area-spacing-contract.test.ts`
27. `tests/silent-failure-round2-contract.test.ts`
28. `tests/sitemap-prerender-parity-contract.test.ts`
29. `tests/sms-trust-surface-contract.test.ts`
30. `tests/studio-canvas-vision-contract.test.ts`
31. `tests/wireline-design-vision-contract.test.ts`
32. `tests/design/authenticated-mobile-cleanup-contract.test.ts`
33. `tests/design/authenticated-seeded-visual-qa-contract.test.ts`
34. `tests/design/demand-driven-overview-contract.test.ts`

The assertion-level list was separately captured at `/tmp/botbound-product-failures.txt` during this audit.

## Exact command ledger

| Command or probe | Result |
| --- | --- |
| `npm run source-control:check` | PASS |
| `npm run workflow:syntax:check` | PASS, 13 workflows |
| `npm run route-registry:check` | PASS |
| `npm run security:routes:check` | PASS |
| `node scripts/check-accessibility-contract.mjs` | PASS |
| `node apps/browser-extension/scripts/build.mjs --check` | PASS |
| Browser-extension temporary build plus `diff`/`cmp` | PASS |
| `node scripts/check-native-release-horizon.mjs` | PASS, native surfaces remain gated by stated horizon |
| `npm run csp:check` | PASS |
| `npm run openapi:check` | PASS, 23 operations |
| `npm run docs:check` | PASS before adding this report |
| 12 targeted brand/domain tests | PASS, 11 assertions |
| 10 targeted launch/extension/native/callback tests | PASS, 57 assertions |
| 10 targeted failure/recovery files | FAIL, 7 files and 60 assertions pass; 3 files and 6 assertions fail |
| `npm run test:run -- --reporter=dot` | FAIL, 34 repository files and 50 assertions fail |
| Empty production environment gate | PASS fail-closed, exit 1 with 14 required variables |
| `sha256sum -c brand-work/SOURCE-SHA256SUMS.txt` | PASS, 50 of 50 |
| `sha256sum -c brand-work/DELIVERY-SHA256SUMS-R3.txt` | FAIL, 56 of 62 |
| Canonical sitemap HTTP probe | PASS, 30 of 30 returned 200 |
| Both public health endpoints | PASS, operational at deployed commit `8b4aa48...` |
| Local Playwright accessibility/responsive attempt | UNTESTED, browser launch blocked by missing Chromium executable |

## Untested launch dependencies

These require explicit post-merge or operator proof and were not inferred from source:

- Exact-head Vercel preview and production deployment.
- Google, Microsoft, Yahoo, Slack, Salesforce, HubSpot, Shopify, Meta, Square, X, Zoom, Teams, and Excel provider-console callbacks on `botbound.me`.
- Stripe live portal, catalog, webhook, checkout, cancellation, invoice, and payment-method flows.
- Twilio inbound/outbound voice, SMS, STOP/START/HELP, signatures, callbacks, and usage triggers.
- Resend sender-domain and webhook delivery.
- Supabase production schema and migration effects.
- Chrome, Edge, Opera, and Firefox installed-extension behavior and store review.
- iOS signing, TestFlight, PushKit, CallKit, Siri/App Intents, widgets, Live Activities, and physical-device acceptance.
- Android release signing, FCM, Telecom, device acceptance, and Play testing.
- Paid-media platform transcodes, loudness, caption ingestion, and final ad-placement safe areas.
- Google Drive Revision 4 upload completeness and permissions.

## Release order

1. Make the 34 repository test files green and isolate nested film dependencies from root Vitest.
2. Remove the visible Wireline leaks and strengthen the brand-sweep allowlist.
3. Decide the canonical-domain transition posture, then align certification and provider runbooks.
4. Re-review the six drifted creative files and publish a new immutable delivery manifest.
5. Add CI coverage for brand manifests, Remotion/captions, asset-only visual QA, and production visual QA on normal releases.
6. Run root CI, browser E2E, and exact-head preview verification.
7. Verify live provider, billing, voice, email, database, and OAuth paths.
8. Deploy the exact reviewed commit, verify both domains and source-commit headers, then certify the final Drive/media package.

No implementation or Git changes were made by this audit. This report is the only intended repository edit.
