# E2E Test Infra: BotBound

## Test Philosophy
- **Opaque-box & Requirement-driven**: Tests validate system behavior through external entry points (CLI, HTTP webhooks, REST API endpoints, user contracts), independent of internal module implementation.
- **Methodology**: Systematic 4-tier approach (Category-Partition, Boundary Value Analysis, Pairwise Combinatorial, Real-World Workload Testing).

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|---------------------|:------:|:------:|:------:|:------:|
| F1 | Inbound & Outbound Voice Calls (Twilio SIP / AMD) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F2 | Inbound & Outbound SMS with Opt-Out (STOP/START/HELP) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F3 | Twilio Trust Hub & Toll-Free Verification (EIN 43-2610447) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F4 | Outbound Transactional Email Delivery (Resend) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F5 | AgentMail Managed Mailboxes & Message Handling | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F6 | Cloud Computer Browser Automation & Messaging Intertwining | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F7 | Design System Tokens & Workspace Polish | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Test Runner**: Node 22 execution via Vitest (`node node_modules/vitest/vitest.mjs run tests/e2e/...`)
- **Node 22 Path**: `C:\Users\MichaelLaurenzo\.cache\botbound-node22\node-v22.23.3-win-x64` (prepend `$env:PATH`)
- **Pass / Fail Semantics**: Zero test failures, exit code 0.
- **Directory Layout**: `tests/e2e/`
  - `tests/e2e/tier1-feature-coverage.test.ts`: Happy-path feature verification in isolation (≥35 tests)
  - `tests/e2e/tier2-boundary-corner.test.ts`: Boundaries, edge cases, invalid inputs, error handling (≥35 tests)
  - `tests/e2e/tier3-cross-feature.test.ts`: Pairwise cross-feature interactions (voice+browser, sms+email, etc.) (≥10 tests)
  - `tests/e2e/tier4-application-scenarios.test.ts`: End-to-end user journeys (appointment confirmation, urgent escalation, omnichannel triage) (≥5 tests)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Inbound Call with Autonomous Browser Lookup & SMS Followup | F1, F2, F6 | High |
| 2 | Toll-Free Profile Submission & Carrier Registration Verification | F3 | Medium |
| 3 | AgentMail Inbound Inquiry with AI Draft & Owner Approval | F4, F5 | Medium |
| 4 | SMS Opt-Out Lifecycle with DNC Enforcement & Quiet Hours | F2 | Medium |
| 5 | Omnichannel Escalation: Missed Call -> Resend Alert -> AgentMail Reply | F1, F4, F5 | High |

## Coverage Thresholds
- Tier 1: ≥35 test cases (≥5 per feature)
- Tier 2: ≥35 test cases (≥5 per feature)
- Tier 3: ≥10 test cases (pairwise coverage)
- Tier 4: ≥5 realistic application scenarios
- **Total Minimum Target**: ≥85 test cases
