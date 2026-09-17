# BotBound route, UX, and design implementation review — 2026-09-17

Status: **Source pass and fixes; visual/live certification incomplete.** Continuation of draft PR #1222, based on recovery head `b07109c77d176a00848e690021a2a935a05d044b`.

## Scope and evidence boundaries

The request includes design system, UI/UX, information architecture, aesthetics, functionality, and simplicity across every page, route, and flow. This record maps **79 route declarations across 42 direct entry modules**, follows the shared authentication/landing/admin implementations, and reviews key delegated flows. Route declarations include aliases and wildcards; they are not 79 distinct screens.

All mapped page entries were evaluated in source for purpose, navigation, state handling, semantics, shared layout use, and recovery. The table records what was checked and where fixes were made. Nested components and every possible account/provider state have **not** all been executed. Source inspection and mocked component tests do not certify live integrations or rendered aesthetics.

Cloud Browser explicitly rejected the local preview under its URL security policy. No alternative browser, proxy, or screenshot mechanism was used to bypass that restriction. No valid screenshots were captured in this pass. Visual contrast, composition, clipping, actual touch geometry, responsive behavior, and authenticated visual quality therefore remain unverified.

The founder expects to settle the Vercel invoice Friday, September 18. The known Vercel account deployment block is an operational dependency, not proof of an application defect. No purchase, hosting migration, deployment, production data write, or customer communication was performed. The existing Letterpress design system is preserved.

## Confirmed changes

| Area | Defect or gap | Change |
| --- | --- | --- |
| Support and Contact | Analytics exceptions could turn confirmed delivery into failure; transport errors automatically opened email and claimed success opening it; same-render events could duplicate delivery. | Isolated optional analytics, fenced submissions, retained drafts, explicit prepared-email action, live success status, mobile textarea type size. |
| Invitation acceptance | Any failure deleted the pending token; switching email did not sign out or retain the return path; blocked storage could crash. | Retain credential until confirmed acceptance, retry, sign out before switching with preserved return, handle storage failures, validate success, explicit continuation. |
| Team and Admin invites | HTTP success was shown as email delivery even when `email_sent` was false. | Separate saved invitation from delivered email; provide retry guidance; disable premature/duplicate Team submissions. |
| Knowledge | Invalid links or unresolved Bot state could mount editing/import controls with the wrong or unavailable target. | Hide write controls until a valid available Bot is selected; preserve an invalid link as an explicit recovery state. |
| Inbox | A scoped link temporarily or permanently broadened to every conversation when Bot/mailbox resolution failed. | Preserve scope through loading and errors; require explicit selection or Show all conversations. |
| Password reset | Missing returned user or local hydration failure left an endless Signing in success screen; late responses could sign in after departure. | Usable workspace/sign-in continuation, submission fence, and unmount guard. |
| Cookie authentication | Retired local-storage cleanup could block valid cookie sessions; failed sign-out still appeared successful. | Best-effort legacy/preference cleanup, cookie hydration proceeds, server sign-out must succeed before local session clearing. |
| Public dynamic routes | `/solutions/toString`, `/solutions/constructor`, and inherited trust-pack keys crashed when prototype properties were treated as content. | Own-property lookups and meaningful not-found recovery. |
| Developer endpoint | Clipboard failures were unhandled and reported Copied; opening an anchor triggered copying. | Await copy result, show manual-copy recovery, copy only on user action, clean timer lifecycle. |
| Admin operations | Number claim/assignment ignored HTTP failures; failed initial load exposed editable default configuration; follow-up sign-out failure could misreport an accepted deletion request as failed. | Check operation results; withhold editable settings on load failure and offer retry; preserve the confirmed deletion status with sign-out recovery guidance. |
| Phone lines | Lookup failure could display No line yet; unconfirmed/degraded routing was shown as Active. | Explicit unavailable state and retry, no setup controls during unknown state, authoritative routing status/error, refresh after assignment. |
| Salesforce | Failed status check looked disconnected/paused. | Unavailable state distinct from disconnected, no reconnect instruction from an unknown check, lock preference while refreshing. |
| Appointments | Failed load had no local retry action. | Retry without leaving the page. |
| Route accessibility | Focus and loaded announcement ran before lazy content existed. | Observe actual content readiness, avoid fallback content, stop on user interaction/unmount, retain focus for query-only changes. |
| Error transitions | Empty busy labels still rendered a spinner on terminal handoff errors. | Hide busy status when absent and provide recovery destinations. |
| Navigation and controls | A dormant shared CTA pointed to removed `/pipeline`; Knowledge was labeled as a voice destination; comparison scroll lacked keyboard access. | Canonical Lead Hunt path, accurate Knowledge wording, focusable comparison region and table scopes, 44px pricing controls. |

## Page and route coverage

Every row below is a **source evaluation**, with visual verification pending under the common boundary above. Static legal/security copy was reviewed for UI structure and navigation, not independently certified for legal or operational accuracy.

| Entry module | Declared routes | Evaluation |
| --- | --- | --- |
| [App](../../src/App.tsx) | `/billing`, `/solutions`, `/use-cases`, `/use-cases/*`, `/for/personal`, `/for/*`, `/blog/*`, `/login`, `/reset`, `/*` | Public routes, preserved redirects, authenticated fallback, viewport mode, and lazy-loading marker reviewed. |
| [AuthPortalRoute](../../src/AuthPortalRoute.tsx) | `/signin/*`, `/signup/*`, `/get-started`, `/auth` | Resolved through AuthPortal and AuthAccessPanel; signup/sign-in/reset, consent, OAuth availability, validation, and redirects reviewed. |
| [ContactPage](../../src/components/ContactPage.tsx) | `/contact` | Fixed delivery/analytics isolation, duplicate submission, explicit email fallback, and announced success. |
| [LegalPage](../../src/components/LegalPage.tsx) | `/terms` | Reviewed structure, headings, document navigation, and Privacy links. No legal opinion or revision of terms. |
| [PrivacyPolicyPage](../../src/components/PrivacyPolicyPage.tsx) | `/privacy` | Reviewed structure, choices, GPC disabling, default-off storage fallback, and privacy anchors. No legal opinion. |
| [PublicChangelog](../../src/components/PublicChangelog.tsx) | `/changelog` | Reviewed ordered entries, headings, tags, motion wrapper, and roadmap separation. Historical release claims not independently re-certified. |
| [Security](../../src/components/Security.tsx) | `/security`, `/trust` | Reviewed separate Security/Trust canonicals, section hierarchy, trust-pack navigation, and contact paths. Attestation/vendor claims require operational evidence. |
| [SupportPage](../../src/components/SupportPage.tsx) | `/support` | Fixed delivery/analytics isolation, duplicate submission, explicit email fallback, and announced success. |
| [TrustPackPage](../../src/components/TrustPackPage.tsx) | `/trust/:vertical` | Fixed prototype-key route crashes and supplied a heading and usable recovery link for missing packs. |
| [About](../../src/pages/About.tsx) | `/about` | Reviewed independent-founder positioning, numbered content hierarchy, support link, and shared marketing frame. |
| [AcceptInvite](../../src/pages/AcceptInvite.tsx) | `/accept-invite` | Fixed retry-token loss, storage exceptions, wrong-account sign-in path, malformed success, and explicit workspace continuation. |
| [AgentStudioHome](../../src/pages/AgentStudioHome.tsx) | `/studio`, `/studio/*` | Reviewed create intent, fragment clearing, signed handoff recovery, identity bootstrap, and activation-wizard handoff. Existing voice/identity fixes are retained. |
| [ApprovalsPage](../../src/pages/ApprovalsPage.tsx) | `/approvals` | Reviewed entry/frame plus task approve/reject error handling and evidence labels in ApprovalInbox; live action execution remains unverified. |
| [BillingSettings](../../src/pages/BillingSettings.tsx) | `/settings/billing` | Reviewed checkout-return reconciliation, unknown/expired proof, balance eligibility, top-up action, failure notices, and Settings placement. Prior billing regressions retained. |
| [Blog](../../src/pages/Blog.tsx) | `/blog` | Reviewed inline notes, stable anchors, structure, and signup/features CTAs; legacy article URLs redirect to the notes index. |
| [BrowserCommandInstallPage](../../src/pages/BrowserCommandInstallPage.tsx) | `/settings/apps/command` | Reviewed download paths, desktop setup sequence, temporary Firefox limitation, privacy explanation, and Back to Apps. |
| [BrowserHandoffBridge](../../src/pages/BrowserHandoffBridge.tsx) | `/studio/handoff` | Fixed terminal error spinner and added recovery actions; reviewed capture validation/exchange and auth return. Extension handoff needs a real client check. |
| [ClientAppsPage](../../src/pages/ClientAppsPage.tsx) | `/settings/apps` | Reviewed product availability labels, setup anchor, external/document routing, install links, and MCP scope boundaries. |
| [Compare](../../src/pages/Compare.tsx) | `/compare` | Added keyboard access to horizontal comparison and row/column header scopes. Earlier source/price-date corrections remain. |
| [ComplianceCenterPage](../../src/pages/ComplianceCenterPage.tsx) | `/settings/compliance` | Reviewed Settings placement plus compliance status, export error handling, and DNC delegation. No production export or campaign attempted. |
| [ConnectionsPage](../../src/pages/ConnectionsPage.tsx) | `/connections` | Reviewed mailbox/CRM grouping plus availability, popup-blocked error, reconnect, and disconnect handlers. Provider round trips are unverified. |
| [CustomizationSettings](../../src/pages/CustomizationSettings.tsx) | `/settings/customization` | Corrected Knowledge destination wording; reviewed appearance/branding placement and secondary destination links. |
| [Developers](../../src/pages/Developers.tsx) | `/developers` | Fixed false Copied feedback and unhandled clipboard rejection; removed copy-on-navigation and retained explicit copy control. |
| [EmailPage](../../src/pages/EmailPage.tsx) | `/inbox` | Fixed scoped links broadening to all conversations during loading/failure/missing selections; reviewed channel/filter changes and thread request fencing. |
| [Features](../../src/pages/Features.tsx) | `/features` | Reviewed channel/feature hierarchy, route CTAs, shared controls, and mobile grid declarations. |
| [InsightsPage](../../src/pages/InsightsPage.tsx) | `/insights` | Reviewed Activity route groups, secondary views, date selection, export placement, widget boundaries, and first-run state; data accuracy needs fixtures. |
| [KnowledgePage](../../src/pages/KnowledgePage.tsx) | `/knowledge` | Fixed loading/degraded/missing-Bot writes; explicit selection, stable target, knowledge/report tabs, and legacy training redirects reviewed. |
| [LandingPage](../../src/pages/LandingPage.tsx) | `/` | Resolved through WireAgentLanding and AuthAccessPanel; reviewed signup role intent, plan CTAs, mobile entrance, hierarchy, and shared branding. Visual composition is unverified. |
| [OAuthComplete](../../src/pages/OAuthComplete.tsx) | `/auth/oauth-complete`, `/oauth-complete` | Reviewed fragment removal, one-time exchange, returned user validation, onboarding destination, and error recovery. Real provider callback remains unverified. |
| [OnboardingFlow](../../src/pages/OnboardingFlow.tsx) | `/onboarding` | Reviewed redirect to Studio creation and timed fallback links. |
| [PhonePage](../../src/pages/PhonePage.tsx) | `/phone` | Reviewed tabs, legacy outbound views, Bot filter, history loading/error recovery, setup/assignment, appointments, and outbound delegation. Fixed line-status truth and added appointment retry. |
| [Pricing](../../src/pages/Pricing.tsx) | `/pricing` | Reviewed monthly/annual selection and signup intent, capacity/rates from catalog, enterprise CTA, FAQs, and table hierarchy; increased interactive touch targets. |
| [PublicNotFound](../../src/pages/PublicNotFound.tsx) | `/404`, `/not-found` | Reviewed no-index metadata, marketing frame, and shared public recovery component. |
| [ResetPassword](../../src/pages/ResetPassword.tsx) | `/reset-password` | Fixed unusable success state, duplicate submission, late sign-in after unmount, and fallback continuation after missing/local session failure. |
| [SalesforceIntegrationPage](../../src/pages/SalesforceIntegrationPage.tsx) | `/connections/salesforce` | Separated unavailable status from disconnected/paused claims, disabled editing during refresh, and reviewed preference save/revert and back navigation. |
| [SettingsPage](../../src/pages/SettingsPage.tsx) | `/settings` | Reviewed profile, password-reset request, sign-out feedback, deletion/cancel workflow, and Settings hierarchy. Cookie sign-out now fails honestly. |
| [Showcase](../../src/pages/Showcase.tsx) | `/showcase` | Reviewed deliberate redirect into Free Builder signup; no retired public demo exposed. |
| [SolutionsPage](../../src/pages/SolutionsPage.tsx) | `/solutions/:wedge` | Fixed inherited-object-key crash; reviewed sales/support selection, signup intent, content hierarchy, and unknown-wedge fallback. |
| [TeamSettings](../../src/pages/TeamSettings.tsx) | `/settings/team` | Fixed loading-time invite availability, duplicate invites, and saved-versus-delivered feedback; reviewed invite dialog labels/focus and roster states. |
| [TemplatesPage](../../src/pages/TemplatesPage.tsx) | `/templates` | Reviewed wrapper plus gallery search/category, availability gating, deployment response handling, and Studio setup handoff. |
| [VerticalLanding](../../src/pages/VerticalLanding.tsx) | `/for/everyday`, `/for/home-services`, `/for/medical`, `/for/legal`, `/for/real-estate`, `/for/insurance`, `/for/restaurants`, `/for/sales` | Reviewed all eight configured route slugs through shared renderer, template-driven CTAs, FAQ semantics, and canonical Everyday alias. |
| [AppRoutes](../../src/routes/AppRoutes.tsx) | `/`, `/overview`, `/studio/live-video`, `/agents`, `/call-logs`, `/logs`, `/email`, `/apps`, `/apps/command`, `/settings/phone`, `/dnc`, `/audit`, `/admin`, `/admin/*`, `*` | Reviewed canonical workspace routes, preserved query/hash redirects, admin wrapper, and authenticated 404. Admin load defaults and operation-result feedback fixed. |

## Flow evaluation and remaining execution

| Flow | Source/isolated evidence | Live execution still needed |
| --- | --- | --- |
| Discover → pricing/role → signup | All public entries, configured verticals, intent handoff, annual/monthly paths, CTA destinations, consent/validation. | Keyboard, mobile, fresh signup, email delivery, actual provider availability. |
| Sign in / OAuth / reset / sign out | Auth panel/provider/callback/reset paths; cookie-storage and recovery behavior tests. Earlier reset/MCP atomicity regressions retained. | Real cookies, two accounts, provider redirects, token expiry, slow network. |
| Invite → authenticate → accept → workspace | Token retention, wrong-account recovery, malformed success and storage failure tested with controlled responses. | Certified shared-workspace access, both roles, accepted/expired/revoked invite, uncertain server completion. |
| Create Bot → setup → private test → activate | Create-dialog query cleanup, template deploy, Studio selection/inspector, wizard and identity bootstrap inspected. Earlier private voice and paid identity regressions retained. | Credentialed creation/training, accessible dialog/focus, real private session, paid activation in an approved environment. |
| Billing → checkout → return → balance | Return reconciliation, proof retention, subscription eligibility, and previous Stripe recovery tests. | Sandbox Checkout and webhooks; no real charge was made. |
| Knowledge/import → test | Target selection, unresolved/degraded state, report tabs, legacy redirects; component regression cases. | Document/website import, actual persistence, screen reader output, selected-Bot isolation. |
| Calls → line setup → assign → call/history | Parent tabs/filters, history recovery, setup/provision/assign and authoritative status; line failure tests. | Carrier routing, recording/transcript links, call quality, inbound/outbound execution. |
| Outbound → campaigns/sequences/callbacks | Parent tab/URL wiring, dispatch entry, lead-intake and dial delegation inspected. | Real queue states, suppression/calling-hours, approvals, retries and provider outcomes. |
| Inbox → filter → detail → outcome/handoff | Scoped loading/failure/invalid target behavior tests; child request cancellation/operation fences and outcomes inspected. | Multi-mailbox fixtures, SMS, sync, threads, actual handoff and notification persistence. |
| Approvals → review → approve/reject | Parent hierarchy, evidence, operation error handling and refresh path inspected. | Concurrent reviewers, stale task, actual action execution and failure recovery. |
| Connections → OAuth → preferences/disconnect | Mailbox popup/error/availability, CRM availability helpers, Salesforce save/revert and status truth inspected. | Each configured provider round trip, popup blocking, expired grant, disconnect and reconnect. |
| Activity → filter/view → export | Group/view resolution, empty/error boundaries, date controls, export placement inspected. | Seeded data totals, empty/degraded series, download correctness and chart readability. |
| Settings → profile/security/appearance/compliance/apps/admin | Shared navigation, permission/error states, export/deletion, install paths, confirmations and admin failure behavior reviewed. | Real roles, deletion cancellation, export, theme persistence, all admin panels with fixtures, extension clients. |

## Design disposition

Keep the existing typography roles, spacing tokens, violet action color, monochrome surfaces, public/workspace layout distinction, and canonical Studio/Calls/Inbox/Activity/Connections/Settings navigation. The changes improve clarity and consistency within that system: honest states, explicit next actions, recoverable errors, stable filters, consistent touch targets, semantic headings, and keyboard focus.

No visual redesign or aesthetic approval is claimed. The remaining review needs accepted screenshots and interaction on public and authenticated pages at 320/390/768/1280px, both themes, representative long/empty/error content, zoom, reduced motion, and keyboard-only navigation. Inspect text contrast, grid density, wrapping, table affordances, sticky/safe-area behavior, focus visibility, and modal recovery before visual sign-off.

## First-pass verification record (`dd22f463`)

- New component regression file: 46 cases. The final focused run passed 79 checks across 6 files, including Studio preferences, route focus, and responsive/source contracts.
- Before-fix countercheck for the first 26 cases reproduced 23 failures against the previously saved source; all 26 passed after fixes. Later cases cover admin, lazy focus, cookie storage/sign-out, line-status and inbox-scope behavior.
- Static internal-link inventory inspected 326 literal destinations across source, excluding API/MCP endpoints. Generic catch-all routes were excluded from resolution. One dormant removed-route CTA was corrected. Dynamic URLs and vendor destinations require separate execution.
- Current-source coverage: **565 files / 3,700 tests passed**. Repository line coverage is **36.24%**; passing tests are not complete behavioral coverage. The initial full run exposed three stale source contracts and four outdated DOM mocks; these were updated to preserve their original assertions while allowing the new recovery actions and readiness observer, then the complete coverage run passed.
- Available non-browser checks passed: all three TypeScript configurations, ESLint, design/tokens, source-control hygiene, workflow syntax, route registry/precedence, authorization (385 routes; 0 violations), tenant inserts, docs/OpenAPI, billing catalog, server bootstrap, tsconfig exclusions, CSP, runtime policy, and API-error contracts. CSP was rerun directly after its orchestration process stalled; it passed. These are command-level results, not a new complete `verify:full` invocation.
- Dependency audit: 397 installed production package versions across 381 packages, no unaccepted high/critical advisories. Production build (41 marketing route shells), no-database server import smoke, and browser-extension policy checks passed. Generated download archives were restored after the build.
- Prior saved head `b07109c` passed full verification: 3,654 tests, 82 browser checks; 6 credentialed visual checks skipped. That prior result is **not** an exact-head browser result for these new UI changes.
- Current-head browser/E2E and live/provider checks are **not run**, under the stated preview restriction. Draft status and deployment gates remain in force; no merge or production promotion.

## Second pass — follow-up to `dd22f463`

Rechecked the saved changes and adjacent phone setup, onboarding, roster, team, and Inbox paths against their server response contracts. Both the draft PR and main branch were unchanged at the start. This pass uses source inspection and controlled component/service responses; the visual and live-provider boundaries above still apply.

| Area | Reproduced gap | Correction |
| --- | --- | --- |
| New phone line | Choosing another Bot snapped back to the existing line's Bot; rapid events could submit duplicate activation or assignment requests; malformed responses could confirm an unacknowledged assignment. | Preserve a valid draft selection, fence simultaneous mutations before React rerenders, and require explicit operation acknowledgement. Block changes while the Bot roster is unavailable. |
| Setup guide | Activation could begin before the initial line check, proceed after unknown/degraded status, or finish without a returned assigned line. | Require a completed valid check, provide local status retry, require explicit activation acknowledgement and a returned line, prevent duplicate requests/dismissal during activation, and distinguish access denial from an expired session. |
| Number picker | Duplicate claim events could submit twice; malformed success responses triggered confirmation; refreshing inventory erased the claim error; reused lines were reported as the requested number instead of the returned number. | Fence claims, require explicit success and a returned number on claim/provision paths, preserve the actual returned identity, and retain the operation error after inventory refresh. |
| Team | Access denial was mislabeled as a paid-plan limitation; failure/malformed data could show an inferred Owner row. | Describe access restrictions accurately, withhold the member list when unavailable, reject malformed results, and offer local retry. Remove internal certification wording from customer guidance. |
| Shared roster | Malformed successful responses looked like an empty roster; degraded or malformed phone lookup looked like no line. | Validate response shape, retain the last known roster on malformed refresh, and propagate phone lookup uncertainty. |
| Scoped Inbox | A degraded roster could still mount the scoped inbox or claim that its selected Bot no longer existed. | Preserve the requested scope in an unavailable state with roster retry. |

Added **28 regression cases**, bringing the UI recovery file to 74 cases. Before application changes, the first 22 new cases all failed against the saved source. After fixes, the focused run passed **108 checks across 5 files**, including successful recovery to a confirmed assigned line, the area-code search path, and reuse of a different existing number. One existing source contract was tightened so onboarding completion requires a returned line as well as a successful refresh.

Second-pass broad verification passed: **565 files / 3,728 tests**, application TypeScript, repository ESLint, design checks, production build, and no-database server import smoke. Line coverage is **36.83%**. The first full run identified two additional stale source assertions for null-safe response access and customer-facing availability wording; those assertions were updated without changing the underlying recovery or certification gates. Their 8 checks passed separately, then the complete coverage suite passed. Generated download archives were restored after building.

These are command-level results, not a new full browser-inclusive `verify:full` invocation. Current-head visual/browser execution and live-provider calls remain unrun; the PR stays in draft and no production settings were changed.

## Integration and calendar continuation — follow-up to `b21d239`

Rechecked the remaining calendar, Salesforce preference, notification destination, and connected-mailbox recovery paths. Server response contracts were inspected alongside the components. This continuation retains the same source/component evidence boundary and existing design system.

| Area | Reproduced gap | Correction |
| --- | --- | --- |
| Appointments | A failed or slow calendar lookup hid valid appointments. Unknown calendar state suggested reconnecting, and malformed appointment data looked like an empty schedule. | Load appointments independently, validate the collection, distinguish checking/unavailable/disconnected calendar states, and retry calendar status without reloading appointments. Ignore responses after departure. |
| Salesforce | Malformed status looked disconnected; same-render preference events duplicated requests; status refresh and preference writes could overtake one another. A null save payload exposed an internal error. | Validate the connection flag, serialize refresh and preference writes, require a returned boolean preference, retain rollback/retry, and ignore late results. Remove a dangling description reference from the switch. |
| Teams destination | Splitting the selected value at `:` truncated channel IDs such as `19:alerts@thread.tacv2`. | Resolve the full selected option and send its intact team/channel IDs and names. Update the visible selection only after acknowledgement. |
| Slack/Teams recovery | Channel network errors were unhandled; HTTP failures looked like empty lists; destination saves ignored failures and allowed overlapping updates. | Separate unavailable lists from confirmed empty lists, add local channel retries, fence destination changes, require explicit acknowledgement, preserve the prior selection on failure, and show save errors. |
| Integration/mailbox status | Malformed status responses looked empty or unavailable by provider; old mailbox refreshes could replace newer data; responses could update state after departure. | Validate collection/provider status shapes, offer the existing status retry, and discard obsolete or post-unmount results. |

Added **29 regression cases**, bringing the UI recovery file to **103 cases**. The first 22 cases all failed against the saved source before application fixes. Final focused verification passed **148 checks across 6 files**, including successful retries, preserved appointment visibility, full Teams channel IDs, acknowledged destination changes, preference rollback/retry, response ordering, and departure guards. These tests use controlled responses and do not contact providers.

Broad verification passed on the first run: **565 files / 3,757 tests**, application TypeScript, repository ESLint, design checks, production build, and no-database server import smoke. Repository line coverage is **37.49%**; this is not complete behavioral coverage. Generated download archives were restored after building. Documentation/local-link and source-control hygiene checks also passed.

These are command-level results, not a new full browser-inclusive `verify:full` invocation. Current-head browser/visual and live-provider verification remain pending; no merge, deployment, purchase, or production service change was performed.
