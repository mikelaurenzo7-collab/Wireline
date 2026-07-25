# Wireline Level-Up Master Plan

Status: **Active canonical execution plan**. This plan sequences the approved audit recommendations into a flawless product, monorepo, and business operating system.

**Jul 2026 master plan:** Pricing lock + 90-day GTM (P0–P4) is captured in the Cursor master plan and operationalized here. Canonical commercial rates live in `docs/business-usage-pricing-decision.md` and `src/lib/plan-catalog.ts`. Operator proof: `docs/P0_BILLING_OPS_NOTE.md`.

## Principle

Wireline should feel broad in capability but narrow in first value: an owner creates an agent, trains it, wires it to real work, and runs calls/texts/follow-up safely. Every repo improvement should either strengthen that loop, protect trust, protect margin, or make the whole multi-surface product easier to operate.

## Phase 0 — Truth, deletion, and guardrails

1. Keep source-control hygiene in the normal `verify` gate.
2. Keep route-order invariants executable through `npm run route-registry:check`.
3. Keep canonical docs indexed through `npm run docs:check`.
4. Keep generated design-token outputs aligned through `npm run design:tokens:check`.
5. Resolve excluded/unmounted surfaces using `docs/EXCLUDED_SURFACES_AUDIT_2026-07-06.md` and showcase active/planned status through `docs/PRODUCT_SHOWCASE_MATRIX.md`.
6. Remove stale browser JWT fallbacks so the web app uses httpOnly cookies only.

Exit criteria:
- Normal verification catches local artifacts, route-order drift, docs-index drift, and token drift.
- Product claims distinguish live, beta, planned, and historical features.

## Phase 1 — Broad launch

Launch around the broad phone-agent promise: personal agents, sales agents, support agents, scheduling agents, call-center coverage, and vertical templates all feed the same Create -> Train -> Wire -> Run loop.

Must be excellent:
- First agent creation.
- Training facts and policies.
- Phone/voice wiring.
- Studio run loop.
- Call summaries and follow-up.
- Conversation Balance and spend safety.
- Trust pack and truthful product proof.

Exit criteria:
- A new qualified buyer can understand the product in one page, create one useful agent, wire it deliberately, and run/review real work.

## Phase 2 — Reliability and margin engine

Turn operating cost and runtime reliability into a product advantage.

Build:
- Founder launch readiness scorecard.
- Voice/AI/telephony margin cockpit.
- Vendor spend caps and alerts.
- Webhook replay and failure dashboards.
- Account-level gross margin by plan/add-on.
- Twilio number inventory review.

Exit criteria:
- Wireline can answer “Is it safe and profitable to sell today?” from one internal cockpit.

## Phase 3 — Multi-surface excellence

Make every app surface serve a distinct job and release from an explicit tier boundary. `docs/CLIENT_SURFACES.md` is the canonical release-boundary contract; this plan tracks the execution intent.

| Tier | Launch status | Product job | Release gate |
| --- | --- | --- | --- |
| Web/API | **Live** | Complete command center, setup workbench, billing, voice/integration runtime, mobile adapters, MCP, and presenter APIs. | `npm run verify`, `npm run verify:full` for release/sensitive changes, `npm run verify:contracts`, targeted provider smoke, and read-only DB health when schema assumptions change. |
| Browser extension | **Beta** | Explicit page-context handoff to Studio through Wireline Command. | Extension build `--check`, Chromium/Firefox packaging, manual browser smoke, permissions review, and explicit-action context handoff verification. |
| iOS | **Planned** | Urgent owner control for calls, approvals, notifications, handoff, wallet, widgets, and review. | XcodeGen, simulator build, physical-device PushKit/CallKit, App Privacy/account deletion, and mobile API smoke. |
| Android | **Beta** | Urgent owner control for calls, approvals, notifications, handoff, wallet, widgets, and review. | Gradle compile, emulator smoke, physical-device Telecom/FCM, Play Data safety/account deletion, and release signing verification. |
| ChatGPT App | **Beta** | Private account-bound drafting, refinement, simulation, and account-aware workflow assistance. | MCP discovery/tool/resource probe, OAuth PKCE reviewer flow, private simulation boundary test, and no-side-effect tool review. |
| Video presenter | **Planned/Beta add-on** | Optional consent-gated visual presenter layer for business agents. | Consent/fallback smoke, provider readiness, cost/metering review, customer-copy review, and support/pricing gate. |

Exit criteria:
- Native clients use a complete `/api/mobile/*` adapter surface except auth.
- Browser extension remains explicit-user-action only: no silent browsing, broad host permissions, background page harvesting, token storage, or independent outbound execution.
- ChatGPT tools cannot bypass Wireline authorization, provision numbers, dial, launch agents, change billing, or claim external actions happened unless Wireline performed them through approved server workflows.
- Video presenters ship only as consent-gated add-ons with server-owned credentials, fallback behavior, truthful customer copy, pricing, and rollback criteria.
- Each tier has documented owning files/directories, required checks, non-goals, security/privacy constraints, and rollback criteria in `docs/CLIENT_SURFACES.md`.

## Phase 4 — Expansion

Expand only after **20+ paying Team/Business accounts or $2k MRR** and 14 days of clean webhook/ledger reconciliation (see `docs/P0_BILLING_OPS_NOTE.md`).

Expansion lanes:
- CRM/email/calendar automations.
- Vertical templates and certified setup playbooks.
- Live video presenter add-on after consent, fallback, pricing, provider-readiness, privacy, and rollback gates are satisfied.
- Enterprise package: SSO, security review, custom telephony, dedicated support, and negotiated volume economics.
- Richer analytics, QA, leaderboard, and insight surfaces once rebuilt on the current runtime.

Exit criteria:
- Every expansion feature has a live/beta/planned state, owner, pricing posture, support posture, and verification path.

## Non-negotiables

- No client-owned provider secrets.
- No browser-stored JWTs.
- No silent browser harvesting; browser context must remain explicit-user-action only.
- No inactive endpoint claims in public contracts.
- No vendor-name leakage in customer-facing presenter copy.
- No expensive usage without metering, gating, and account-level visibility.
- No ChatGPT App ability to provision numbers, dial, launch agents, change billing, or perform outbound actions.
- No new canonical doc without `docs/README.md` linkage.
