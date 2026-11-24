# BotBound AI-native roadmap — November 23, 2026

Status: approved implementation baseline; not evidence of deployed functionality. Supersedes the October 27 connector direction. Existing deployment, carrier, consent and database runbooks remain authoritative.

## Release first
- [x] PR #1517 merged; all four Render services deployed on `917fde11dae757c3e40c53ebaed4efc99ada2ba8`; authenticated old-worker drain confirmed zero active and pending calls, replacement readiness returned HTTP 200.
- [ ] Complete full candidate verification/review and founder two-way live call; deployment and readiness alone do not prove carrier behavior.
- [ ] Verify inbound call settlement, SMS carrier scope, email delivery/replies, billing and Computer execution.
- [ ] Restore CI or retain exact-candidate command-level proof (npm run verify:full). No skipped check counts as success.

## Launch quality, not perfection

Release blockers are demonstrated material defects: security, consent, tenant isolation, financial integrity, data loss, broken essential journeys, misleading claims, material accessibility failures, or unrecoverable work. Keep these checks blocking. Visual composition, slogans, punctuation, mascot treatment, creative format, and editorial choices are review guidance, not universal release invariants. Marketing may iterate on these choices while maintaining accurate pricing, capability availability, accessible controls, valid routes and honest evidence. Retain historical evidence without treating old design decisions as permanent contracts. Prefer behavioral and rendered checks over exact source strings. Track residual noncritical findings with owner, impact and next review. Never count skipped validation as a pass.

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

## Pilot exit criteria
Verified owner end-to-end voice, email, permitted messaging, Computer and billing; People history without duplicates; helper toggle on/off in rehearsal; connector policy and revoked-grant tests. Recruit 1–3 design partners without claiming unverified channels are ready. Maintain one execution trace and unified activity surface.
