# BotBound design master plan

Status: evidence-backed plan reviewed against origin/main at 36d4baac12426b8af265593887b12e6bd4bede5a on 27 October 2026. Original task start remains fba3eccd9a13bb35f30bce81793f98c03e9e9bd5. Public and authenticated visual verification, screenshots, axe, overflow and Lighthouse remain incomplete; this is not release certification.

## Decisions and scope

Keep BotBound’s company wordmark, warm light default, optional dark appearance, type families, semantic tokens and shared components. The owner dislikes the current abstract Bot marks and wants to explore an original, pre-made character catalog for individual Bot identities. Improve hierarchy and remove confirmed friction; do not introduce another theme, another polish stylesheet, or resurrect retired pages. Judge every surface by whether a small-business owner can understand its purpose and complete its task.

Owner instructions: market calls, SMS, email and Computer as capabilities ready to use. Customer copy never says Wireline, AI employee or fully autonomous. Preserve actual permission, consent and provider controls. Show Lite $12/month, Starter $24/month (default), Plus $49/month with $4/$14/$36 of included work. No free-plan or trial offer. Technical compatibility identifiers and historical subscriptions are not customer offers and must not be renamed or repriced cosmetically.

Owner-supplied Figma inspection lens (reference, not an attached source): ink/paper with violet action; Display Case titles and labels; one primary action per view; channel status in its owning row; one composer with Computer as a mode; no stacked panel chrome; secondary setup in a modal; one click to common tasks; Knowledge inside the Bot workspace; inline history actions; no instructional filler or hedge copy; icons only when they act; no Leaderboard; preserve the exact anchor, identity and voice lines. Keep existing font roles and tokens until the actual Figma artifact is available; do not infer new styling from the label “Display Case.” The owner’s current authenticated-design reference is the ChatGPT Desktop app: a focused canvas, quiet navigation, generous working space and a clear composer. Use those qualities as direction, not as a screen to copy; verify them against BotBound’s real workspace and tasks.

The owner subsequently authorized account configuration, merging and deploying verified work. That supersedes the original PR-only instruction, but not the quality gates or exclusions on billing logic, Stripe configuration, secrets, infrastructure, real payments, calls, SMS, email or voice cloning. No database changes are part of this design pass. Any eventual voice-service release requires its separate manual deployment and evidence.

## Connector and permissioned automation plan

P1 product foundation: keep the customer setup focused on Gmail/Google Workspace, Outlook/Microsoft 365, business calendars and file access. BotBound owns People, interaction history, follow-ups, approvals and its simple appointment flow. Do not expose a generic integration marketplace, duplicate full CRMs/team chat, or let a provider expand the agent's tools. The current code inventory and the source-backed connector market scan are in [docs/CONNECTORS.md](../CONNECTORS.md).

Build small, allowlisted adapters behind stable BotBound actions. Full access, Auto and Ask for approval are owner choices enforced by BotBound before each provider call; consent, account scope, carrier rules, revocation, audit and safe retries still apply. All current accounts are founder/test accounts, so they do not establish market demand. Choose any P2 vertical adapter only after validating a target segment, owner demand, non-beta write access, plan requirements, partner approval, fees and support burden.

P0 connector cleanup: remove customer-visible beta and retired offerings from setup and action catalogs, block new OAuth/action paths, and keep existing owners able to revoke saved grants. Do not erase historical records or change the database automatically. Report every retired or beta-marked item at the end. SMS and outbound remain marketed as ready; account setup and approval remain operational controls, not a roadmap or “coming soon” promise.

## Bot identity catalog redesign

P1 design exploration, owner-directed. The owner dislikes the current abstract marks and wants a pre-made catalog of companion characters as Bot identities. Keep the BotBound company mark distinct from each Bot’s personal identity. Design original BotBound-owned artwork here; do not reuse assets from ChatGPT Pets. The Pets plugin operates only on animated companions inside ChatGPT Work mode, exposes no BotBound API, and says not to use it for other apps; reuse rights are not established.

Current code stores a curated `mark_key` per Bot (`src/db/schema-base.ts`, `src/lib/bot-mark.ts`) and shows a two-part Symbol/Color picker (`src/components/BotMarkPicker.tsx`). Its 15 motifs × 8 palettes produce 120 stable identity keys; the database constraint and trigger recognize those values, and capacity tests rely on the same 120-choice set. This makes a BotBound-owned catalog technically feasible without database writes if it preserves those stable keys and 15×8 allocation shape while changing only the artwork and customer-facing labels. If the data shape or capacity changes, prepare an explicit migration for the owner to apply by hand; never update the database automatically. Preserve a readable fallback for stored identities during rollout.

Explore a single, visual catalog of 15 distinct character families with eight restrained colorways each, selected by owners and independent from role, connection, permissions, activity and runtime state. Use static art by default. Any motion must be subtle, tied to real activity, and reduced-motion safe. Before product code changes, present the character art direction and test recognizability, small-size legibility, professional fit for very small businesses, and mobile selection. This is a replacement candidate, not yet a production commitment.

## Evidence and DS-A correction

The starting HEAD already contains [DS-A PR #1407](https://github.com/mikelaurenzo7-collab/Wireline/pull/1407). Its parent is `ebb280bd6322401d85b70fb246ad662d4cc3c1f7`. The diff changes only 35 test files: 32 repaired, three deleted. Do not make a duplicate repair PR or delete passing coverage.

The original `uploads/ds-a-triage.md`, `visual-qa-public.md`, `findings.md` and Run 2 notes are not in this checkout or the supplied workspace. The PR body preserves the earlier audit reconciliation, but cannot substitute for independently checking the original list of 30 paths. A fresh literal-path inventory finds 55 absent source paths referenced across tests; many deliberately assert absence, and some are relative to other roots. This is not a count of broken suites. Never delete a test merely because a referenced path is absent. Earlier plan and walkthrough notes were subsequently recovered from [#1408](https://github.com/mikelaurenzo7-collab/Wireline/pull/1408) and [#1417](https://github.com/mikelaurenzo7-collab/Wireline/pull/1417); treat their observations as historical evidence, not a fresh walk of the candidate.

Reconstructed audit corrections from #1407, consistent with inspection of the current tests:

- KEEP absence guards, token parity, accessibility contracts, permission and provider boundaries.
- REPAIR positive reads of removed views by pinning the remaining implementation, not by requiring old pages to return. The old GUARD list included positive reads and was not wholly KEEP.
- CONDITIONAL receipt tests can be deleted only when their entire subject is retired. Three deleted receipts imported removed Activity, Learning Metrics and Voice Latency views.
- Keep the seven July pass suites' independent product invariants. Their names do not make them obsolete design receipts. Historical internal prices are not grounds to erase billing tests.
- Preserve the route-metadata parity test: its current pricing-title failure is a real product mismatch, not a stale assertion to delete.

Historical Node 22 baseline on the original review tree: 237/239 assertions passed across 37 design/brand/marketing files; the failures were a stale channel-plan expectation and the genuine pricing metadata mismatch. The full-suite run on that earlier tree reported 8,226 passed, 41 failed, 86 skipped, and two module-load failures. The 32 repaired DS-A suites had 266 passing assertions on that tree. On 36d4baac, a fresh full-suite run stalled in a worker for more than six minutes and was stopped before Vitest wrote its JSON summary. Current-main full-suite totals are therefore unknown; the earlier failures are historical context, not a current pass/fail report. Preserve failing contracts and classify them instead of weakening assertions.

## Verified work queue

Priorities: P0 blocks trustworthy purchase intent, account access or release; P1 is a material task or comprehension defect; P2 is refinement. The verified SMS configuration mismatch is a P0 operational readiness blocker; the coder does not change it. Product fixes are coder-owned; provider approval and manual account/database activation are owner-owned.

| Priority / ID | Verified finding and source | Smallest useful change |
| --- | --- | --- |
| P1 PUB-01 | `UsagePricingPanel.tsx` places each card's `includedWorkUsd` inside closed `details`; a separate long paragraph lists all amounts. | Put each plan's allowance next to its price in the always-visible card. Retain rates/reset details without repeating the amount. |
| P1 PUB-02 | `/pricing` PageMeta title is `Pricing \| Shared Work Allowance \| BotBound`; `marketing-route-meta.ts` prerenders a different title. | Align the prerendered title with the live page; retain parity coverage. |
| P2 PUB-03 | Legal FAQ in `src/data/vertical-wedges.ts` says “Refusal is enforced in the directive layer.” | Remove that internal implementation sentence; retain the clear attorney handoff and no-legal-advice explanation. |
| P2 PUB-04 | `public/site.webmanifest` uses an older tagline and dark `#0A0A0E`, while `index.html` and the default light canvas use `#F7F7F3`. | Use the current app name/description and default light canvas for launch chrome; preserve install identity, URLs and icons. |
| P1 PUB-05 | The home route currently places long, uneven channel copy, checklists and an Explore link below its four capability tabs, then mounts the always-expanded shared marketing footer. | The owner approved a focused home page: keep the four tabs, replace the copy block with one compact channel-specific visual demo, remove the home footer, and size the hero/showcase as a complete landing page. Preserve keyboard and touch behavior; prove mobile and desktop composition before release. |
| P1 QA-01 | `marketing-metadata-contract` and the channel-branch case in `usage-pricing-note.test.tsx` still require retired pricing UI. | Repair assertions to require the current three-tier shared-work offer, including when availability returns a legacy billing model. Do not reintroduce retired prices to satisfy tests. |
| P1 VOICE-01 | #1411's proposed price filter matches a customer's `$19/month`, `$190` and `$1900` prices. Seven failures reproduced in 17 focused regression cases. | Require an identifiable platform offer and complete amount; retain business facts beside retired offers in knowledge. Corrected on #1411 with phone/browser composition coverage. |
| P1 STUDIO-01 | Current main's ComputerPage.tsx:184–185 says the cloud computer turns on automatically and nothing is needed; StudioTaskChat.tsx:208 says Computer work is unavailable without a next action. #1420 has an unmerged candidate fix. | Rebase #1420 on 36d4baac. Keep one concise setup notice with a working next step; retain the standalone notice when chat does not own the state. Verify both surfaces and the 390px input width. |

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

## Run 3: owner-supplied findings re-triaged

The combined Oct 27 report is available in the conversation, not as its named files. Its IDs and observations are preserved below. “Source-confirmed” means the current tree supports the stated behavior; “reported” means the screenshot/account state still needs a current visual walk. The reported two passes were against the older 7df898e main and do not certify current 36d4baac. Priorities below are delivery priorities, not replacements for Broken/Drift/Polish labels.

| ID | Priority | Current evidence and disposition |
| --- | --- | --- |
| B1 | P1 | The live prompt composer includes saved Playbook text before current plan facts, and the Playbook says owner wording wins over general rules and knowledge. That creates conflicting instructions that could repeat a retired platform offer. The current founder Concierge Playbook, prompt override, knowledge and directives queried did not contain the reported $19/$12-shared text, so the historical call source remains unresolved. Sanitize only identifiable BotBound offers; preserve legitimate SMB prices. |
| B2 | P1 | Current initial-knowledge filtering uses an amount-based matcher that can suppress legitimate customer prices; saved Playbooks, directives, and knowledge search can still surface stale copy. The current founder Concierge knowledge/directives queried did not contain the reported launch-claim phrases. Add regression coverage at each prompt/search boundary; do not rewrite database rows. The open #1411 branch narrows the price matcher but is not yet on main. |
| B3 | P1 | The report's Scale/allowance/Bot counts may be a retained subscription. Scale remains a legacy catalog identity and Billing presents account-specific terms. Do not edit subscription rows or Stripe configuration. Reconcile the exact workspace against its saved account state before calling it a defect. |
| B4 | P1 | Fixed on current main by #1429; both Render API and voice services are live at 36d4baac. The current source uses a flush focus treatment. Capture current screenshots before closing the visual finding. |
| B5 | P2 | Inbox detail panes can show “Select a Conversation” while no thread is selected. The supplied report says messages were present; no current browser capture is available. Do not auto-select until read-state side effects are checked. |
| B6 | P1 | Source confirms an empty transcript is summarized as “Native voice call completed without a usable transcript,” while outcome logic can report “Missed.” Replace the completion implication with a neutral no-transcript summary and pin the outcome pairing. |
| B7 | P1 | GET /api/team returns 500 on query failure, not 503; the invitation POST can return 503 when its app URL is unavailable. No /api/team request or 503 appears in the last-day Render request-log query. Reproduce in a test workspace before changing the route. |
| B8 | P2 | The listed blank/dashed/placeholder states exist in source. Whether they waste space with populated data is a rendered question; keep the real next action and empty state distinct. |
| D1 | P1 | Fixed on current main by #1428; the public hero and header use “Get Started.” |
| D2 | P1 | The reported stale Starter chip still needs a fresh-storage, legacy-storage, delayed-availability and direct-URL browser check. Source already normalizes legacy intent after availability resolves. |
| D3 | P1 | The report says Inbox, Calls, Insights and Settings have DOM headings but no visible page title. Verify the rendered heading and back-navigation context before changing shell templates. |
| D4 | P2 | The five-save-buttons/dirty-state report needs a current Studio walk. Consolidate only after confirming the independent save boundaries and draft behavior. |
| D5 | P1 | Preselected permissions on disconnected integrations are a meaningful consent risk if they persist after connection. Verify storage and dispatch semantics; keep Full access / Auto / Ask behavior explicit. |
| D6 | P2 | No Leaderboard is a match. Per-tab control differences remain a refinement report until a current Insights walk confirms the mismatched actions and labels. |
| D7 | P2 | The duplicate Knowledge selector and full-page Settings navigation are reported. Recheck one-click paths and secondary-panel behavior against the owner’s rule before changing routes. |
| D8 | P1 | Fragmented phone/email state is reported across Bot header, Lines and Summary. Inspect one current test account and make channel state visible in its owning row without inventing a number. |
| D9 | P2 | #1427 is already on main and establishes one Studio composer. The two Calls > Outbound primaries still need a current click-through before removing either action. |
| D10 | P2 | Public title-axis, missing Contact/Support H1, footer width and casing differences are reported, not remeasured. Normalize only the specific templates that fail the four-width walk. |
| D11 | P2 | The link/button, chip and segmented-control inconsistency is reported. Reuse shared variants only after confirming the controls have the same action and hierarchy. |
| D12 | P2 | Reported off-system tints and billing-bar thickness require rendered comparison; no global recolor. |
| D13 | P1 | Developer tier names and the Terms money-back/campaign language may contradict the live offer. Source retains a 30-day guarantee absent from Pricing. Route legal terms to owner/counsel; do not silently edit legal promises. |
| D14 | P2 | Uneven SMS/Email capability cards and the clipped Explore Calls destination are reported. Check real content and sticky-header landing before changing the examples. |
| D15 | P1 | Remove internal implementation language from customer surfaces. “Runtime Balance” is absent from the reported /for/* FAQ source, but remains in several Billing, Trust, Security and error strings; replace user-facing wording without changing the ledger or billing behavior. |
| D16 | P2 | Footer duplication, subject placeholder and casing are source-level copy fixes where current text matches the report; check the rendered navigation before changing its collapsed behavior. |
| D17 | P2 | Generic integration glyphs are reported. Use official provider marks only where they improve recognition and have consistent licensed assets; otherwise keep functional neutral icons. |
| D18 | P2 | Source confirms the live /pricing PageMeta title differs from prerendered route metadata, so the browser title can change after load. #1409 contains a correction but is still open and based on the old tree; rebase and retest. |
| Polish 1 | P2 | Seven-card and Trust-pack dead-space patterns are reported; compare populated and zero-data states before changing grid rules. |
| Polish 2 | P2 | Hover, icon-label, bot-filter and persistent-action differences are reported; verify keyboard and touch equivalents with each state. |
| Polish 3 | P2 | DOM accessible-name spacing is a source-level markup check; inspect the actual accessible tree before altering text. |
| Polish 4 | P2 | Duplicate Identity and Set Up entry points are reported; preserve the faster route if both have distinct context. |

### Additional source and account checks

| Priority / ID | Evidence | Smallest useful action / owner |
| --- | --- | --- |
| P0 OPS-01 | Read-only BotBound database aggregate: all 142 settings rows have twilio_messaging_enabled=false; none has a Twilio messaging-service SID. Only two rows have an SMS number. DNC registration and attestation fields are empty across these rows; source says campaign outbound fails closed until required configuration is valid. | Owner/Twilio: finish approval and messaging-service/callback setup, then enable one designated test workspace and validate it without sending. Do not flip flags or update the database automatically. |
| P1 VOICE-02 | currentPricingPromptBlock() is appended unconditionally in the generic phone and browser prompt composers. This exposes BotBound plan facts to every Bot runtime, not only the BotBound Concierge. | Verify intended scope; likely restrict BotBound pricing facts to BotBound-owned showcase/Concierge prompts. Add a non-BotBound business fixture proving it never receives BotBound prices. |
| P1 VOICE-03 | The latest #1411 patch contains a narrow retired-price matcher but is not on main; current main's amount-based matcher can suppress customer prices. Across the database, $19 appears in 77 knowledge rows, 18 prompt overrides, five directives and two personality rows. The current founder Concierge Playbook, override, knowledge and directives queried contained none of the reported stale lines. | Keep platform identity and context in the classifier; never globally remove $19. Trace the historical live-call source through its exact deployed worker/input before claiming root cause. |
| P1 OPS-02 | Render reports auto-deploy enabled from main for both botbound-api and botbound-voice; both are live at 36d4baac. This conflicts with the earlier note that voice needs a manual deploy. | Owner: confirm intended release control. No deploy was triggered and no Render setting was changed. |

Source for account totals: read-only aggregate from the user-selected BotBound Supabase project on 27 Oct 2026. No row-level content, secrets, phone numbers, or user identifiers are included; only counts are recorded. The user's Run 3 screenshots and reports remain the evidence for layout claims; no current visual pass is claimed.

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
2. **Master plan and connector decision:** this PR contains the design plan plus the connector feature map, market scan and permissioned adapter contract in docs/CONNECTORS.md. The visual walk and full test evidence remain incomplete.
3. **Tokens/primitives:** inspect existing #1414; its width-based 44px height rule does not establish target width or rendered geometry. No additional speculative token PR.
4. **Public storefront:** continue #1409 for PUB-01–05 plus stale pricing tests. Do not merge overlapping #1418 without reconciling its content and evidence.
5. **Auth/onboarding; app shell/Studio; Insights; settings/billing/states:** review the existing area PRs below instead of duplicating them. Call out any permission, capacity, schedule or team behavior change explicitly.

### Existing PR disposition

| Priority | PR | Independent decision |
| --- | --- | --- |
| P2 | [#1408](https://github.com/mikelaurenzo7-collab/Wireline/pull/1408), [#1417](https://github.com/mikelaurenzo7-collab/Wireline/pull/1417) | Earlier plan and walkthrough recovered. This consolidated plan incorporates their existence and unresolved results; do not merge competing versions of the same document. |
| P1 | [#1409](https://github.com/mikelaurenzo7-collab/Wireline/pull/1409) | Open and based on the original review tree. Its description records eight affected files / 92 assertions for the follow-up, but screenshots are earlier evidence. Rebase on 36d4baac and rerun before accepting. |
| P1 | [#1410](https://github.com/mikelaurenzo7-collab/Wireline/pull/1410), [#1419](https://github.com/mikelaurenzo7-collab/Wireline/pull/1419) | Overlapping auth alternatives. #1419 clears plain signup intent to null while `recommendedPlanFromIntent(null)` still returns Personal. Require full default Starter persistence and explicit-tier tests before accepting it. |
| P1 | [#1411](https://github.com/mikelaurenzo7-collab/Wireline/pull/1411) | Open on the old tree. The pushed head narrows price filtering and adds weekday defaults, but the later local greeting/personality sanitizer is not in the PR branch. Ten-file / 90-test results are from that older head. Rebase, add prompt/search coverage, and keep existing empty schedules unchanged before accepting. |
| P1 | [#1412](https://github.com/mikelaurenzo7-collab/Wireline/pull/1412) | Two nested scroll owners removed; needs populated content and nested-container validation because flex/overflow-hidden wrappers remain. |
| P1 | [#1413](https://github.com/mikelaurenzo7-collab/Wireline/pull/1413) | Do not merge unchanged: unconditional outbound carrier-pending copy does not read account readiness; public readiness direction has been superseded; team “coming soon” is an unsupported future promise. |
| P1 | [#1414](https://github.com/mikelaurenzo7-collab/Wireline/pull/1414) | Measure width as well as height and enlarged-text layout. Source-string tests do not establish usable touch targets. |
| P1 | [#1415](https://github.com/mikelaurenzo7-collab/Wireline/pull/1415) | Retargets deleted footer checks; remains a dependency of #1418–20. Its two repaired suites do not resolve the full 28-file baseline. |
| P2 | [#1416](https://github.com/mikelaurenzo7-collab/Wireline/pull/1416) | A dev billing-response flag and POSIX-only npm command are not necessary to change production design. Prefer isolated test fixtures; retain the no-billing-change boundary. |
| P2 | [#1418](https://github.com/mikelaurenzo7-collab/Wireline/pull/1418) | Overlaps #1409, replaces concrete examples with decoration, and adds public carrier-pending copy. Needs reconciliation with purposeful graphics and the latest marketing direction. |
| P1 | [#1420](https://github.com/mikelaurenzo7-collab/Wireline/pull/1420) | Open, not on main, and based on cursor/fix-stale-marketing-contracts-a76e. Current main still promises automatic activation. Rebase onto 36d4baac, validate the help action, preserve the standalone notice, and capture the required screenshots before accepting. |

Merged #1426 and #1427 now provide Knowledge as the mobile dock entry and one Studio composer. Merged #1428 fixes the public hero CTA label; #1429 flushes icon-input focus. Render currently reports API and voice live at 36d4baac. The service listing also reports auto-deploy from main for both, which conflicts with the earlier manual-voice note; no setting was changed. Open #1430 adds file upload and a Connectors menu to Studio, but lacks behavior tests/screenshots and still needs keyboard/mobile, partial-upload and file-name telemetry review. The recovered #1417 walkthrough covers 390 and 1280 only. It reports a Billing `link-in-text-block` violation, an onboarding `scrollable-region-focusable` violation, and a setup input extending beyond the 390px viewport. These P1 items require reproduction and repair; the earlier walk is not a zero-violation release gate. Screenshots linked in #1409 provide historical before/after evidence but not certification of updated heads. No new screenshot, axe or Lighthouse result is claimed here.

For each product PR: capture untouched-base and final screenshots at 390 and 1280, walk 390/768/1280/1440, and count clicks to common tasks against the one-click law. Use the same route, appearance, account data and state; include light/dark, 200% text, keyboard/focus and reduced motion where affected. axe must report zero violations. Check document and nested container widths, not merely `body` overflow. Measure Lighthouse mobile under the same production-build conditions before/after; the supplied approximate 86/83/85 for home/pricing/signup are reference values, not a freshly measured baseline. Keep raw reports and screenshots outside Git and link review artifacts.

Use the owner’s/test demo account only for read-only inspection unless a specific harmless test action is explicitly authorized. Treat the shared database as production data: query only the necessary fields, redact identifiers, and never write it from an audit. Do not use or copy secrets. Exercise signup, selection, creation, setup, rehearsal entry, Insights, settings and cancellation entry without submitting a payment, cancellation of a real subscription, send, outbound call or clone. Fixture screenshots are useful component evidence but are not a successful authenticated account journey.

Run targeted behavioral tests first, then the repository's appropriate full verification on the exact candidate. GitHub Actions being unavailable does not waive local checks. Preserve unrelated baseline failures visibly. Merge/deploy authorization is present, but no candidate is releasable until its evidence passes. Re-read the deployment runbook at release time, verify web/worker source parity and health, and preserve a rollback point.

Current limitations: Browser Use exposes a public read-only run with an optional cost cap, but it has not been invoked without a fee allowance. The Browser extension's page-control JS tool is not exposed. No current screenshots, axe run, viewport overflow check, Lighthouse measurement or signed-in walkthrough are claimed. The owner-provided Run 3 summary is present in chat, while the original attachments and Run 2 notes are missing. Current account rows are owner/demo data, but no email, SMS, calls, purchases, or database changes were performed.
