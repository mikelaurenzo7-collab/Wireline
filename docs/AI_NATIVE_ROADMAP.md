# BotBound launch plan and AI-native roadmap

Updated: November 23, 2026 (US Central; November 24 UTC).
Decision: **GO for controlled founder QA; NO-GO for unrestricted commercial launch.**
This is the current prioritized execution plan, not blanket certification. The deployment, carrier, consent, billing and database runbooks remain authoritative for their respective operations.

## 1. Verified release evidence

Production revision: `8fc1066241c7d435a67f5c53d4c05c60a6d1bfd8`.

| Render service | Deployment | Status |
| --- | --- | --- |
| API / website | dep-dc2gba8ae00c73dmmadg | Live |
| Voice worker | dep-dc2gcqrrjlhs73clcut0 | Live |
| Jobs sweep | dep-dc2gbagae00c73dmmckg | Live |
| Daily brief | dep-dc2gbagae00c73dmmcm0 | Live |

Authenticated pre-replacement voice drain confirmed zero active and pending calls; replacement readiness returned HTTP 200 and ready:true. All four latest deployment records were independently rechecked on the exact revision. A successful deploy is not proof of a successful customer interaction.

- [x] #1517: replace second ringing leg on answered xAI outbound calls with carrier audio bridge; improve opening playback and interruption handling.
- [x] #1519: merge AI-native roadmap and connector direction.
- [x] #1520: allow explicitly authorized, reviewed nonmarketing after-hours service calls.
- [x] #1521: extend timing authorization to reviewed Personal calls, clarify disabled Place Call states, use shared theme-aware checkbox, and preserve initial purpose.
- [ ] Execute exact-head full verification (npm run verify:full) and targeted regressions; hosted CI is not established. Previously written tests and deployment builds are not equivalent to full verification.
- [ ] Confirm dark/light rendered interaction, live carrier behavior, actual appointment outcomes and financial settlement. No successful post-repair call is evidenced in this session.

## 2. Launch-blocking acceptance work (P0)

| Workstream | Required acceptance | Current status |
| --- | --- | --- |
| Outbound voice | One authorized founder call: no secondary ringing, AI greeting heard, two-way speech, interruption recovery, hangup, accurate outcome and settled usage | Not verified after repair |
| Dial UI | Personal and service review in light/dark, mobile and desktop; correct enabled state, visible reason when blocked, keyboard and touch operation, no duplicate call | Changes deployed; rendered QA pending |
| Inbound voice | Owned number receives real call; greeting, useful response, handoff, transcript/outcome and settlement agree | Fresh end-to-end evidence required |
| Billing | Ordinary paid account: Stripe checkout, signed webhook, entitlement, usage, portal/cancellation and reconciliation | Fresh end-to-end evidence required |
| Messaging | Twilio campaign approval and approved scope, delivery and replies, STOP/HELP and suppression | Last known A2P campaign in review; automatic inbound replies remain off until approved and verified |
| Calling permissions | Confirm actual scope and timing authorization, nonmarketing versus marketing, suppression, applicable state/carrier restrictions, no misclassification or unsafe retry | Reviewed flow deployed; full policy and regression review pending |
| Email | Verify managed address, outbound delivery, inbound reply, signed feedback, thread and suppression | Fresh end-to-end evidence required |
| Computer and actions | Real controlled task, approval and takeover, clear completed/failed state, retry, no fabricated result | Fresh end-to-end evidence required |
| Security and operations | Tenant isolation, permission revocation, spend caps, idempotency, recovery, redacted error logs, alert delivery and backup/restore evidence | Exact-head and live evidence required |

Marketing/campaign outbound remains outside launch promotion until applicable screening and authorization are verified. Do not present a purpose label or owner attestation as evidence of permission that does not actually exist. Nonmarketing consent may be documented from a valid existing source; do not unnecessarily force a new signature. Review state and industry restrictions before general rollout.

## 3. Immediate test sequence

1. Refresh production on the latest revision. Verify dial dialog light/dark and narrow/wide layouts. Test missing permission, saved valid permission, personal/service timing confirmation, opt-out and unresolved-request recovery without contacting an unauthorized recipient.
2. Place one expressly authorized noncommercial founder test call. No real calendar booking unless the owner separately authorizes that action. Check connection, greeting, two-way audio, interruption, silence, objection, alternative mock appointment, confirmation and hangup.
3. Reconcile carrier status, transcript, summary, actual requested action, usage/wallet and cost; record call ID, revision and timestamp internally. Grade only observed evidence.
4. Run focused tests and exact-head full verification. Fix confirmed defects and retest; do not broaden into unrelated refactors.
5. Dogfood a clean paid account from signup through setup, rehearsal, phone identity, inbound, authorized outbound, email, Computer, approvals and billing. Open only channels with current evidence.

### Voice acceptance scorecard

| Dimension | Points |
| --- | ---: |
| Connection and greeting | 15 |
| Voice quality and naturalness | 15 |
| Responsiveness and latency | 15 |
| Listening and interruption | 10 |
| Conversation and adaptability | 15 |
| Appointment accuracy | 15 |
| Disclosure and consent | 5 |
| Summary, logging and settlement | 10 |
| Total | 100 |

Target: at least 90/100 with zero critical failures for the tested scenario. No score until an actual conversation is observed. Critical failures include no two-way audio, missing required disclosure, unauthorized action, incorrect booking confirmation, duplicate dispatch or material financial/data error. The score is an improvement target, not a demand for perfect delivery.

## 4. Launch quality, not perfection

Objective release blockers: security, privacy, consent, tenant isolation, financial integrity, data loss, broken essential journeys, material accessibility, inaccurate claims and unrecoverable work. Retain behavioral tests for these. Exact slogans, punctuation, hero composition, mascot placement, decorative hierarchy and creative format are editorial guidance, not universal blocking contracts. Prefer rendered usability, real product truth, conversion evidence and accessibility over exact source-string assertions. Preserve accurate pricing, channel availability, valid navigation and honest demo labeling. Existing creative-contract cleanup is unmerged; finish it independently with targeted verification. Archive outdated plans as history rather than erasing evidence.

## 5. Commercial rollout

Start with 1-3 tightly managed design partners; expand to 3-5 only when capacity and workflow evidence justify it. Prioritize missed calls, inbound support, scheduling and follow-up. Sell verified outcomes, not untested channels. Use current catalog terms and real product captures. Provide manual fallback, provider spend alerts, support owner, clear cancellation and recovery paths. Track activation, time to first successful task, call connection/greeting success, accurate completion, owner intervention, usage margin and retention. Scale only after the first controlled paid lifecycle and applicable channel checks pass.

## 6. Product direction

One primary Bot per customer workflow, with phone, permitted SMS, email, supervised Computer, knowledge, memory and approvals. Keep work, setup, rehearsal, history and recovery coherent. Continue the roadmap below after stabilizing the launch-critical paths; do not make speculative architecture a prerequisite for a useful initial Bot.

## Phase 0 — consolidate
- [ ] Verify ownership of production-classified accounts and recheck grants, queued jobs, historical records and dependencies.
- [ ] Remove legacy CRM/commerce routers, services, catalog tools and dispatch in one reviewed change.
- [ ] Remove legacy Slack/X/Zoom/Sheets/Teams/Excel/Yahoo mail paths in a second reviewed change; preserve Yahoo sign-in and supported Google/Microsoft mail/calendar.
- [ ] Preserve disconnect/revoke, historical receipts, account deletion and audit until absence of dependent data is established.
- [ ] Only after deployed readers/writers are gone, review append-only migration for legacy connections, agent teams/members and call queues. No destructive migration before approval.
- [ ] Reconcile missing schema indexes/tables against live catalog; remove retired Gemini runtime and dependency after reference audit.
- [ ] Separate sign-in and connector OAuth clients; narrow Drive access to selected files where feasible. Gate restricted Gmail/Drive access on required verification.
- [ ] Archive superseded audits and reconcile draft #1437.

## Phase 1 — People and helpers
People is tenant-owned, with one person and multiple normalized identifiers, interaction provenance, follow-ups, reversible deduplication and explicit identity conflicts. Do not auto-merge ambiguous identities. Tenant RLS, server grants, deletion/export and cross-tenant tests are mandatory. Seed only verified founder/demo accounts; preserve channel receipts. Add permissioned find_person, record_interaction and update_person, UI timeline, and outward MCP people.read/people.write scopes. Keep customer records separate from model memory.

Helpers use one per-Bot toggle, initially thinking-only, at most one level and two calls per parent task, with bounded context/time/output. Parent authorization, environment, budget and cancellation apply. Existing explicit tool lists require a reviewed migration that preserves owner opt-outs. Record parent-child trace and usage without double billing. Slow work uses durable task handles; never block a live call indefinitely.

## Phase 2 — Connector Gateway
Reviewed catalog of native adapters and vetted remote MCP servers; official MCP SDK for client transport. Dedicated encrypted grants, per-Bot bindings, tool classification and authorization before every invocation. Recheck revocation and policy at execution, including approved retries. No arbitrary endpoints, dynamic unreviewed tools, model-visible tokens or unrestricted network access. Validate schemas, cap output, treat all external content as untrusted, and test prompt injection, SSRF, tenant isolation, idempotency and failure recovery. Reuse existing approvals, environment gates, audit and wallet. Reserve and settle usage once. Build Google/Microsoft adapters first, Slack write-first after vendor approval. Do not infer provider eligibility from code presence.

## Phase 3 — demand-driven
RCS after carrier and device eligibility proof; Apple Messages for Business research before any implementation; no unofficial Mac relay by default. A2A, CRM sync and other adapters require named pilot demand.

## Roadmap expansion exit criteria
For the later People/helpers/gateway pilot, verify People history without duplicates, helper toggle on/off in rehearsal, connector policy and revoked-grant tests, and one unified activity trace. These are later feature-specific gates, not prerequisites to the initial voice-led assisted pilot.
