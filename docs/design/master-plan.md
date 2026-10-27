# BotBound design master plan

Status: evidence-backed source plan; rendered verification incomplete. Started 27 October 2026 from `origin/main` at `fba3eccd9a13bb35f30bce81793f98c03e9e9bd5`. This document does not certify a release.

## Decisions and scope

Keep the existing BotBound identity, warm light default, optional dark appearance, type families, semantic tokens and shared components. Improve hierarchy and remove confirmed friction; do not introduce a replacement theme, another polish stylesheet, or resurrect retired pages. Judge every surface by whether a small-business owner can understand its purpose and complete its task.

Owner instructions: market calls, SMS, email and Computer as capabilities ready to use. Customer copy never says Wireline, AI employee or fully autonomous. Preserve actual permission, consent and provider controls. Show Lite $12/month, Starter $24/month (default), Plus $49/month with $4/$14/$36 of included work. No free-plan or trial offer. Technical compatibility identifiers and historical subscriptions are not customer offers and must not be renamed or repriced cosmetically.

The owner subsequently authorized account configuration, merging and deploying verified work. That supersedes the original PR-only instruction, but not the quality gates or exclusions on billing logic, Stripe configuration, secrets, infrastructure, real payments, calls, SMS, email or voice cloning. No database changes are part of this design pass. Any eventual voice-service release requires its separate manual deployment and evidence.

## Evidence and DS-A correction

The starting HEAD already contains [DS-A PR #1407](https://github.com/mikelaurenzo7-collab/Wireline/pull/1407). Its parent is `ebb280bd6322401d85b70fb246ad662d4cc3c1f7`. The diff changes only 35 test files: 32 repaired, three deleted. Do not make a duplicate repair PR or delete passing coverage.

The original `uploads/ds-a-triage.md`, `visual-qa-public.md`, `findings.md` and Run 2 notes are not in this checkout or the supplied workspace. The PR body preserves the earlier audit reconciliation, but cannot substitute for independently checking the original list of 30 paths. A fresh literal-path inventory finds 55 absent source paths referenced across tests; many deliberately assert absence, and some are relative to other roots. This is not a count of broken suites. Never delete a test merely because a referenced path is absent.

Reconstructed audit corrections from #1407, consistent with inspection of the current tests:

- KEEP absence guards, token parity, accessibility contracts, permission and provider boundaries.
- REPAIR positive reads of removed views by pinning the remaining implementation, not by requiring old pages to return. The old GUARD list included positive reads and was not wholly KEEP.
- CONDITIONAL receipt tests can be deleted only when their entire subject is retired. Three deleted receipts imported removed Activity, Learning Metrics and Voice Latency views.
- Keep the seven July pass suites' independent product invariants. Their names do not make them obsolete design receipts. Historical internal prices are not grounds to erase billing tests.
- Preserve the route-metadata parity test: its current pricing-title failure is a real product mismatch, not a stale assertion to delete.

Fresh Node 22 baseline across 37 design/brand/marketing files: 237/239 assertions passed. Failures: `marketing-metadata-contract` still expects the removed channel-plan Pricing UI; `marketing-route-meta-contract` correctly detects a pricing-title mismatch. The core design contracts pass. The full Node 22 unit baseline completed: 8,226 passed, 41 failed, 86 skipped, plus two files failing to load (missing CallOpsOverview and Cadences imports). All 266 assertions in the exact 32 repaired DS-A suites pass. Other failures span stale pricing/navigation tests, route focus, channel notices, extension download freshness, and usage billing validation. They are release blockers requiring separate classification, not permission to weaken assertions. Full JSON and an independent audit are retained outside Git.

## Verified work queue

Priorities: P0 blocks trustworthy purchase intent, account access or release; P1 is a material task or comprehension defect; P2 is refinement. No P0 product defect has yet been established by this source review. Missing release evidence remains a release blocker, not an invented product bug. All code items below are owned by the coder.

| Priority / ID | Verified finding and source | Smallest useful change |
| --- | --- | --- |
| P1 PUB-01 | `UsagePricingPanel.tsx` places each card's `includedWorkUsd` inside closed `details`; a separate long paragraph lists all amounts. | Put each plan's allowance next to its price in the always-visible card. Retain rates/reset details without repeating the amount. |
| P1 PUB-02 | `/pricing` PageMeta title is `Pricing \| Shared Work Allowance \| BotBound`; `marketing-route-meta.ts` prerenders a different title. | Align the prerendered title with the live page; retain parity coverage. |
| P2 PUB-03 | Legal FAQ in `src/data/vertical-wedges.ts` says “Refusal is enforced in the directive layer.” | Remove that internal implementation sentence; retain the clear attorney handoff and no-legal-advice explanation. |
| P2 PUB-04 | `public/site.webmanifest` uses an older tagline and dark `#0A0A0E`, while `index.html` and the default light canvas use `#F7F7F3`. | Use the current app name/description and default light canvas for launch chrome; preserve install identity, URLs and icons. |
| P1 QA-01 | `marketing-metadata-contract` and the channel-branch case in `usage-pricing-note.test.tsx` still require retired pricing UI. | Repair assertions to require the current three-tier shared-work offer, including when availability returns a legacy billing model. Do not reintroduce retired prices to satisfy tests. |

## Reported items requiring no blind rewrite

These are verification tasks, not accepted fixes. Original VQ/DF IDs must be attached when the missing reports arrive; do not invent mappings.

| Priority | Reported issue | Current evidence and next decision |
| --- | --- | --- |
| P1 | Stale signup chip | `AuthAccessPanel` already converts stored legacy intent after usage availability resolves. Reproduce with fresh storage, retired storage, delayed availability and direct/signup navigation before changing it. |
| P1 | `?plan=lite` saves Starter | `usageTierFromPlanSlug` explicitly maps Lite; `signup-intent-contract` covers it. Verify persistence and signup end to end; do not replace the working parser speculatively. |
| P1 | One-Bot 402 after form | `USAGE_PLAN.unlimitedBots` is true; its capacity is the identity ceiling. Verify new usage accounts separately from retained subscriptions. Never add a universal one-Bot limit. |
| P1 | Business Hours vs Calendar | Business Hours uses null as unrestricted answering, with Mon–Fri 9–5 as the editable schedule. Calendar is booking availability. Verify both saved states together; clarify the distinction before changing defaults that could reject calls. No existing customer schedule may be rewritten. |
| P1 | AI Spend exposes tokens | `AISpendView.tsx` is deleted; Insights no longer mounts it. Search remaining user-visible spend surfaces and server errors. Keep internal cost controls intact. |
| P1 | `/api/team` 503 | GET handler in `team-routes.ts` returns 500 on query failure; 503 is in invite setup. Requires the actual response and safe test-account reproduction to identify middleware/configuration/schema cause. Do not turn errors into empty successful teams. |
| P1 | Nested mobile Insights scroll | Outer and view scrollers now use `md:overflow-y-auto`. The content wrapper still has `overflow-hidden`. Measure all nested containers at 390/768 before editing; test tab and period changes with long content. |
| P1 | Cookie banner 21%, verify banner 30% | Cookie notice reserves document space and verify banner already uses compact styling inside workspace flow. Measure current geometry and keyboard reachability; preserve explicit accept/reject and verification state. Do not hide required actions to reduce height. |
| P2 | Auth card 20px off center | Auth has height-dependent and mobile top-alignment rules in `precision-auth.css`. Measure visible card bounds, scrollbars and keyboard state before removing intentional short-screen behavior. |
| P1 | Tiny targets | Tokens specify 40/44/48px and coarse-pointer rules exist. Measure each reported target, including consent, dismiss, tab and menu actions; fix only actual undersized controls. |
| P1 | Runtime Balance in `/for/*` | No such literal remains in `vertical-wedges.ts`; internal directive wording does remain (PUB-03). Check rendered FAQ dependencies. Legacy billing/service errors still contain Runtime Balance; billing internals are outside this pass. |
| P1 | Live Bot says $19/month | No literal `$19` appears in current `src` or `public`. Historical docs/catalog compatibility remain. Trace the specific call's deployed worker SHA and saved Bot knowledge read-only; do not claim its source is found or alter legacy billing rows. No new call is required. |
| P1 | Excess approvals | `bot-permission.ts` already implements Full access / Auto / Ask. Full executes, Auto requests approval for customer-facing sends, Ask waits. Verify UI labels, saved settings and action dispatch together; preserve consent and provider gates. |

## System and component plan

| Priority | Area | Retain / refine |
| --- | --- | --- |
| P2 | Type | Keep Inter Tight display, Inter body, IBM Plex Mono metadata. Existing scale: display 56/60, h1 40/46, h2 30/36, h3 22/30, body 16/26, caption 13/19. Use existing responsive hero rules; never shrink text to conceal overflow. |
| P2 | Space | Use existing 4/8/12/16/24/32/48/64px rhythm; one gutter owner per page. Public rails remain centered; workspace content and labels remain left aligned. Remove stacked container padding only after a measured failure. |
| P2 | Color | Keep light canvas `#F7F7F3`, violet action `#7040D7`, and corresponding dark semantic values. No raw recolor sweep. Verify text contrast on actual surfaces and preserve status colors. |
| P2 | Radius/elevation | Existing controls use 12px; use semantic 6/8/10/12/20/28px tokens for their intended surfaces. Reserve elevation for floating UI; do not add shadows to every card. |
| P1 | Interaction | Keep 44px coarse-pointer targets, visible 2px focus and disabled/busy states. Never remove focus rings for appearance. |
| P2 | Motion | Use existing 120/200/300ms tokens for feedback. Runtime activity must correspond to real activity; idle UI stays still. Use static states with reduced motion, no new autoplay media or decorative chart library. |

Component cleanup is deliberately bounded: (P1) `UsagePricingPanel` owns allowance visibility; (P2) `MarketingPageFrame` and route metadata own public hierarchy; (P1) `CookieConsent` and `EmailVerifyBanner` retain their state machines while measured layout fixes stay in their existing owners; (P2) auth centering stays in `AuthPortal`/`precision-auth.css`; (P1) Insights scroll ownership stays in `InsightsPage`/`InsightsView`. Keep canonical Button, Card, EmptyState, StatusNotice and skeleton primitives. Dialog convergence and broad CSS consolidation are not approved work without fresh evidence of a problem.

## Page templates and before/after intent

| Priority | Surface | Before / current | After intent and verification |
| --- | --- | --- | --- |
| P2 | `/`, `/features`, `/compare`, `/for/*`, solutions | Existing branded hero and page rails; FAQ jargon confirmed. | Preserve identity; one primary action, consistent authored punctuation and casing, one-line guidance where needed. Remove verified internal wording. Compare each real page at all four widths before normalizing headings. |
| P1 | `/pricing` | Allowance hidden within each card; stale prerender title. | Price, allowance and included identities readable without expansion. Detail disclosure carries reset and rate terms. Default Starter stays unchanged. |
| P1 | `/signup`, `/signin`, reset, onboarding | Shared auth card, persisted plan intent, existing short-height rules. | Selected plan survives refresh/navigation; no stale offer flash, accessible validation, reachable submit on short screens. Center when content fits; scroll when it does not. |
| P1 | App shell / Studio / setup | One workspace and implemented permission model. | Clear page title, one primary task, compact non-obscuring notices; permission choice explains its real effects in one sentence. Retain drafts and focus across tabs and dialogs. |
| P1 | Insights, all remaining tabs | Retired spend views gone; responsive scrollers present. | One mobile page scroll, readable labels and useful periods; preserve genuine empty, unavailable and populated states. No token/model-spend UI. |
| P1 | Settings, Calendar, Phone, team, billing display | Separate availability meanings and legacy plan compatibility. | Explain answering vs booking hours, reflect actual account state, actionable errors, transparent current allowances. No billing-engine or Stripe change. |
| P1 | Empty/loading/error states, every route | Shared primitives already exist. | Empty: one relevant next action; loading: stable skeleton plus busy/status semantics; error: plain cause and retry without pretending data is empty. Preserve previously entered data. |

Copy diet (P1): short labels; one sentence of direction; keep terms needed to understand cost or permission. Examples: “Included work”, “Business hours”, “Booking hours”, “Try again”. Avoid “directive layer”, “Runtime Balance”, “visual consistency pass” and internal vendor/token language in new customer copy. Do not turn data-dependent restrictions into “not in your plan” without entitlement evidence. Customer text keeps the customer's casing.

## Delivery and release evidence

1. **DS-A:** already merged as #1407 before this task. Reverify its exact changed suites and tests-only scope; report corrections rather than repeat it.
2. **Master plan:** documentation PR containing this plan and its single index link. Remains incomplete until missing reports and real walkthrough are incorporated.
3. **Tokens/primitives:** no speculative PR. Open only for a measured target, contrast or layout defect.
4. **Public storefront:** PUB-01–04 plus stale pricing test repair. Keep this independent of auth, settings and infrastructure.
5. **Auth/onboarding; app shell/Studio; Insights; settings/billing/states:** separate PRs only after their current defects are reproduced. Call out any permission, capacity, schedule or team behavior change explicitly.

For each product PR: capture untouched-base and final screenshots at 390 and 1280, and walk 390/768/1280/1440. Use the same route, appearance, account data and state; include light/dark, 200% text, keyboard/focus and reduced motion where affected. axe must report zero violations. Check document and nested container widths, not merely `body` overflow. Measure Lighthouse mobile under the same production-build conditions before/after; the supplied approximate 86/83/85 for home/pricing/signup are reference values, not a freshly measured baseline. Keep raw reports and screenshots outside Git and link review artifacts.

Use a fresh isolated local/test account with provider side effects disabled. Do not use or copy production secrets or treat the shared database as a test database. Exercise signup, selection, creation, setup, rehearsal entry, Insights, settings and cancellation entry without submitting a payment, cancellation of a real subscription, send, outbound call or clone. Fixture screenshots are useful component evidence but are not a successful authenticated account journey.

Run targeted behavioral tests first, then the repository's appropriate full verification on the exact candidate. GitHub Actions being unavailable does not waive local checks. Preserve unrelated baseline failures visibly. Merge/deploy authorization is present, but no candidate is releasable until its evidence passes. Re-read the deployment runbook at release time, verify web/worker source parity and health, and preserve a rollback point.

Current limitations: no Browser control tool is exposed in this session, no dedicated authenticated test environment has been established, and the named attachments are missing. No current screenshots, axe run, Lighthouse measurement or real signed-in walkthrough are claimed. These are outstanding work, not completed checks.
