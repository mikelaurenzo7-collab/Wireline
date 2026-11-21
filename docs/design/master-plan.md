# BotBound design master plan

Status: active queue reviewed November 20, 2026. Historical design investigations are available in [the preceding plan](https://github.com/mikelaurenzo7-collab/Wireline/blob/9918d3e76eb21527f6d832fcf77826744777bb84/docs/design/master-plan.md) and Git history. Their old source revisions, provider counts and open-PR labels are dated evidence, not current instructions.

## Direction and ownership

One BotBound product, one primary web workspace and one Bot conversation. Start with one focused job. Roles configure the same Bot; they do not create separate products or account modes. Prioritize useful calls, requested email and supervised browser work before adding another client or integration.

| Concern | Authority |
| --- | --- |
| Business and product focus | [One-Product Strategy](../ONE-AGENT-STRATEGY.md) |
| Current offer, identities, meters and caps | [Usage Billing](../USAGE_BILLING.md), `src/lib/usage-billing-catalog.ts` |
| Legacy subscriptions and entitlements | `src/lib/plan-catalog.ts`; preserve account-specific contracts |
| Client release boundaries | [Client surfaces](../CLIENT_SURFACES.md) |
| Permissions and external adapters | [Connectors](../CONNECTORS.md) |
| Phone runtime and release | [Runtime policy](../PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md), [Deployment Runbook](../DEPLOYMENT_RUNBOOK.md) |
| Creative delivery | [Current asset index](../../brand-work/CURRENT-ASSET-INDEX.md) |

Public pages may describe calls, SMS, email and browser capabilities. Activation still requires entitlement, funding, sender verification, recipient permission, carrier approval and provider readiness. Campaign calling stays outside launch promotion. Code support is not launch acceptance.

## Retained interface decisions

- Keep the BotBound wordmark, white light default, optional dark appearance, existing font roles, semantic tokens and shared primitives. Fix measured contrast or containment defects in their existing owners.
- The rail selects a Bot. Its header opens details and configuration; the main canvas holds conversation, task questions, progress and results. Knowledge remains available for the selected Bot. No separate roster dashboard is needed for ordinary work.
- One persistent composer supports messages, explicit **Use browser** requests and inline **Reply to task** answers. Drafts stay scoped to their Bot and task. Opening the browser view never starts work. Automatic natural-language browser-task routing remains unimplemented.
- Private rehearsal and live calls stay distinct. Microphone start is explicit. Hands-free shares the composer; physical routing, background operation and Meta acceptance are governed by [Hands-free](../HANDS_FREE.md).
- Keep one clear primary action for the current job, concise secondary controls, meaningful status, visible keyboard focus and comfortable touch targets. Do not shrink type or hide recovery to make a screenshot fit.
- Preserve separate save boundaries when their receipts differ. A failed, missing or mismatched save confirmation retains the draft; it must not look like a completed save.
- Keep current shared-work pricing visible without making the owner understand old package catalogs. Existing paid subscriptions keep their terms. Do not rewrite Stripe or database records as cosmetic cleanup.
- Preserve customer-authored text. Keep customer copy short, free of internal runtime/vendor language and unsupported completion claims. Call completion does not establish that the requested business action succeeded.
- Bot character catalog exploration, a general recurring browser-task scheduler, new mobile frameworks and voice-cloning expansion are deferred behind core acceptance. Live talking-head video remains retired. Remove unused prototypes that simulate live service state; do not erase historical customer or billing records.

## Retained completed work

The shared composer is implemented in [PR #1464](https://github.com/mikelaurenzo7-collab/Wireline/pull/1464), using the existing task controller. Settings receipts, Report Settings draft recovery, private text-rehearsal recovery, neutral terminal task labels and compact desktop navigation have landed. The preceding release passed the full local gate and matching Render source/readiness checks. Those receipts certify that release within their recorded scope; they do not certify a physical phone, every account or every provider workflow.

The old Flutter dashboard was a disconnected mock with fixed metrics and unsupported clone/dispatch claims. It is not an alternative to the native iOS and Android clients. Product and token-generation cleanup removes that duplicate surface rather than treating its sample data as integration evidence.

The launch report now validates each configured Shared Work tier through the existing checkout validator. Legacy price lookups use batches of at most ten keys. A failed tier, missing configuration, test-mode credential or partial lookup cannot certify a live catalog. This is a read-only reporting correction; it does not change a price, subscription or charge.

B6 was reproduced on November 20: a missed call displayed a completion placeholder and its attempt duration twice. Missing-transcript summaries now use neutral text, including the known historical placeholder at display time. Missed reports omit the duration badge; other reports show duration once. Call report headings follow the page hierarchy. Stored call data and outcome classification remain unchanged; this correction does not establish live call quality.

## Next work in order

| Priority | Work | Acceptance |
| --- | --- | --- |
| P1 | Complete genuine first-use acceptance. | Unseeded account creates its first Bot, saves setup, retains drafts through refresh/cancellation and reaches a successful private rehearsal. Compare the seeded workspace separately. The previously inspected zero-Bot state is not first-Bot completion. |
| P1 | Prove browser supervision end to end. | Deliberate task admission, progress, owner question, takeover, handback, Stop, terminal result, sources and usage receipt all agree for the same task. Viewing or navigation grants no action authority. |
| P1 | Measure live phone behavior. | One consented non-demo call exercises learned facts, a supported action, interruption, handoff and termination. Record first audio, response delay, playback and settlement evidence. Old call history and mocked speech do not establish current latency. |
| P1 | Verify the phone workspace in use. | Light/dark, 320/375/390px, enlarged text, keyboard open/closed, browser return, long history and notices keep the composer, navigation and recovery reachable. Physical iPhone/Bluetooth/Meta acceptance remains distinct from browser-width tests. |
| P1 | Complete controlled commercial proof. | Eligible new-plan checkout, ordinary paid activation, email send/receive callbacks, support handling, repeat usage and actual contribution margin have separate dated receipts. Readiness and sandbox arithmetic do not establish these outcomes. |
| P2 | Consider automatic browser-task routing. | Only after the explicit flow is proven. Reuse existing admission, receipts, billing, concurrency and recovery; clarify ambiguous intent. Do not create another executor or bypass permission checks. |

Keep expansion limited to evidence of customer need and completed workflow proof. BotBound owns a small appointment/People/approval core; it does not need a generic CRM or field-service platform clone. External adapters remain optional.

## Historical reports still requiring current evidence

The following reports are not accepted defects on current main. Reproduce before editing and retain their original identifiers when recording a result.

| Reports | Required check |
| --- | --- |
| D2, stale signup chip, Lite selection | Fresh and retained signup intent, delayed availability, direct entry, refresh and cancellation. Preserve deliberate plan selection. |
| CAP-01, one-Bot 402, B3 | Separate current Shared Work capacity from legacy subscriptions and identity slots. The old 120-picture ceiling is not a current Bot cap; never reinstate it. |
| Business Hours vs Calendar | Answering hours and booking availability are different settings. Inspect saved states; never rewrite an existing schedule merely to change a default. |
| B1/B2, VOICE-01/02/03 | Trace the particular call's source and saved inputs for a retired-price report. Preserve legitimate customer prices and never claim a historical root cause without evidence. |
| B7, team 503, D5, approvals | Capture the actual failed response, saved permission and dispatch path. Do not turn an unavailable team into an empty successful team or revive a disconnected grant. |
| B5, D3/4/6/7/8/9/11/12/17, Polish 1/2/3/4 | Recheck selected conversation, titles, save scope, navigation, channel state, glyphs, focus and controls on populated and empty workspaces. Preserve read-state and save side effects. |
| D10/14/16/18, PUB-01/02/03/04/05 | Measure current public hierarchy, pricing allowance, metadata, FAQ wording, links, manifest and footer behavior. The earlier storefront candidates are historical, not a plan to restore deleted UI. |
| Cookie/verification notices, Insights scroll, tiny targets, auth centering | Measure actual document/nested scroll bounds, target width and height, safe areas and keyboard reachability. Fix the owning component only. |
| D13 | Reconcile reported developer/pricing/Terms guarantee differences with the actual offer. Material legal promises require a deliberate business/legal decision; do not silently rewrite them. |
| OPS-01/02 | Provider setup, funded access, source parity and intended deployment control need current read-only evidence. October account totals and old auto-deploy listings are not current configuration. |

## Verification and delivery

Use the narrowest meaningful regression checks while implementing. Remove tests that only preserve a deleted mock, not independent billing, ownership or permission invariants. Do not weaken a failing guard to merge a cleanup.

For rendered changes, compare the same account, route, state and appearance before and after; inspect phone and desktop, keyboard/focus, enlarged text, reduced motion, axe and nested overflow. A seeded screenshot is not a genuine new-account journey. Keep generated evidence outside Git.

Before release, run the required exact-head checks in [Contributing](../../CONTRIBUTING.md), resolve review findings and follow the [Render release sequence](../DEPLOYMENT_RUNBOOK.md), including voice drain, matching service revisions, authenticated readiness and runtime-error review when applicable. No unverified provider configuration, database migration, external communication or charge is hidden in design work.
