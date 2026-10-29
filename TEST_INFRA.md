# E2E Test Infra: BotBound Lean 4 Pillars

## Test Philosophy
- **Opaque-box & Requirement-driven**: Tests validate system behavior through external entry points (CLI, HTTP webhooks, REST API endpoints, user contracts, and event streams), independent of internal module implementation.
- **Progressive Testability & Independence**: Each test sets up its own isolated state, avoids execution-order coupling, and is verifiable against authoritative interface contracts from `PROJECT.md` and `ORIGINAL_REQUEST.md`.
- **Systematic 4-Tier Hierarchy**:
  - **Tier 1 (Feature Coverage in Isolation)**: Happy-path verification for every Lean Pillar in isolation.
  - **Tier 2 (Boundary Value & Corner Cases)**: Buffer boundaries, hold expiration TTL, budget caps, invalid tokens, replay attacks, concurrent booking collisions.
  - **Tier 3 (Cross-Feature Combinations)**: Pairwise and multi-feature pipeline integration (Calendar soft hold + Stripe SMS deposit + Webhook confirmation + RFC 5545 .ics invite + trade portal mirroring).
  - **Tier 4 (Real-World Application Scenarios)**: Complete end-to-end operational SMB workflows (emergency plumbing call, disputed surcharge retention, 2FA owner takeover, soft hold expiration lifecycle, reply cancellation).

---

## Feature Inventory Coverage Mapping

| # | Feature / Pillar | Requirements Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|------------------|---------------------|:------:|:------:|:------:|:------:|
| **P1** | **Zero-Conflict Calendar Engine**<br>• Location-aware travel buffers (15-60m)<br>• Ephemeral 5-minute soft holds (300s TTL)<br>• RFC 5545 `.ics` invite generation<br>• Background trade portal mirroring hook | `ORIGINAL_REQUEST.md` §R4<br>`PROJECT.md` Features 10-13, 5 | 10 | 9 | ✓ | ✓ |
| **P2** | **In-Call Stripe Settlements & Autonomous Goodwill Wallets**<br>• Mid-call SMS text-to-pay deposit link<br>• Live webhook voice session event registry<br>• Autonomous goodwill wallet policy ($100/mo, $25/res)<br>• Apple Pay / Google Pay support | `ORIGINAL_REQUEST.md` §R3<br>`PROJECT.md` Features 6-9 | 10 | 9 | ✓ | ✓ |
| **P3** | **Voice-to-Browserbase Real-Time Bridge**<br>• Non-blocking async tool execution<br>• Conversational fillers during 3-8s latency<br>• Ingestion of portal results into live conversation<br>• 2FA / CAPTCHA takeover alert via AgentMail & SMS | `ORIGINAL_REQUEST.md` §R2<br>`PROJECT.md` Features 1-4 | 9 | 9 | ✓ | ✓ |
| **P4** | **Branded Bot Email Identity via AgentMail**<br>• Dedicated inbox provisioning on `bots.botbound.app`<br>• Deterministic `client_id` & structured metadata<br>• Transactional confirmation emails with `.ics` & receipts<br>• Inbound reply triage & human escalation routing | `ORIGINAL_REQUEST.md` §R7<br>`PROJECT.md` Features 14-16 | 9 | 9 | ✓ | ✓ |

*(Note: Synthetic Rehearsal Suite R5 and SMS Camera Vision Modal R6 are pruned per user directives. Conceptual note on direct wearable streaming is preserved.)*

---

## Test Architecture

- **Test Runner**: Node 22 execution via Vitest (`node node_modules/vitest/vitest.mjs run tests/e2e/`)
- **Node 22 Path**: `C:\Users\MichaelLaurenzo\.cache\botbound-node22\node-v22.23.3-win-x64`
- **Pass / Fail Semantics**: Zero test failures, exit code 0.
- **Directory Layout**:
  - `tests/e2e/helpers/lean4-pillar-harness.ts`: Authoritative interface contracts, reference models, and test oracles.
  - `tests/e2e/tier1-feature-coverage.test.ts`: Isolated happy paths across all 4 pillars (38 tests).
  - `tests/e2e/tier2-boundary-corner.test.ts`: Boundaries, TTL limits, budget caps, concurrency collisions, SSRF protection (36 tests).
  - `tests/e2e/tier3-cross-feature.test.ts`: Pairwise & multi-pillar integration interactions (10 tests).
  - `tests/e2e/tier4-application-scenarios.test.ts`: End-to-end customer emergency and operational journeys (5 tests).

---

## Real-World Application Scenarios (Tier 4)

| # | Scenario | Pillars Exercised | Complexity |
|---|----------|-------------------|------------|
| 1 | **Emergency Plumbing Booking Flow**: Caller requests appointment, slot soft-held for 5 mins, SMS deposit sent and paid via Apple Pay, webhook confirms booking with 30-min travel buffer, AgentMail `.ics` confirmation dispatched, trade portal mirrored | P1, P2, P3, P4 | Critical |
| 2 | **Goodwill Wallet Customer Retention**: Caller disputes trip fee; bot validates $100/mo budget and $25 cap, issues $20 credit, logs ledger entry, and sends AgentMail receipt | P2, P4 | High |
| 3 | **Trade Portal Lookup with Latency Fillers & 2FA Takeover**: Async parts lookup streams conversational fillers during 6.5s latency, hits 2FA barrier, and fires owner takeover alert via AgentMail (`agent_attach_human`) and SMS | P3, P4 | High |
| 4 | **Concurrent Booking Collision & Soft Hold Expiration**: Caller A holds slot, Caller B rejected due to collision, Caller A abandons call, hold auto-expires at 300s TTL, slot returns to availability | P1 | High |
| 5 | **Inbound Email Reply Triage with Cancellation**: Customer replies to cancel appointment, webhook verifies signature, triage classifies `cancel`, slot & travel buffers released | P1, P4 | Medium |

---

## Coverage Thresholds & Target Counts
- **Tier 1 Target**: ≥ 35 test cases (Authored: **38**)
- **Tier 2 Target**: ≥ 35 test cases (Authored: **36**)
- **Tier 3 Target**: ≥ 10 test cases (Authored: **10**)
- **Tier 4 Target**: ≥ 5 realistic application scenarios (Authored: **5**)
- **Total Minimum Target**: ≥ 85 test cases (Authored & Verified: **89**)
- **Pass Rate**: **100% (89/89)**
