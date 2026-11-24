# BotBound AI-native roadmap — November 24, 2026

Status: execution plan for Wireline `main`, checked against `b35b578b` and read-only production records on November 24. A checked item means merged code, a completed change in this branch, or a finished investigation; it does not certify a live customer journey. Existing deployment, carrier, consent and database runbooks remain authoritative.

## Verified progress and decisions

- [x] PR #1518 merged at `b35b578b`: CRM/commerce/prospecting connector code and role templates removed; marketing wording pins loosened; the browser specialist remains the only subagent.
- [x] PR #1517 merged; Render API is live at `b35b578b` and voice is live at `8fc10662`. Both include #1517. A founder two-way call after the repair remains unverified.
- [x] Locate Render services: `botbound-api`, `botbound-voice` and both cron jobs are in **My Workspace**.
- [x] Recheck legacy table rows: `wireline_crm_connections`, `wireline_agent_teams`, `wireline_agent_team_members` and `wireline_call_queues` each contain zero rows. This does not establish ownership of the 13 production-classified accounts.
- [x] Retire the unused Gemini Live client and `@google/genai` dependency in the Phase 0 cleanup change. Keep historical model prices, saved voice mappings, 410 tombstones and the `gemini_ground` research tool where they still serve compatibility.

The October 27 connector audit is historical. The reviewed Connector Gateway direction in `docs/CONNECTORS.md` governs future work. The owner chose to keep all seven surviving legacy paths: Slack, X, Zoom, Google Sheets, Microsoft Teams, Excel and Yahoo mail. This cancels the second deletion PR. Their current wiring still uses `wireline_crm_connections`, so that table stays until replacement grants are built and a deployed reader/writer cutover is verified. Keeping code is not certification of provider readiness or permission to expose beta actions broadly.

## Release first
- [ ] Exact-candidate full verification, authenticated old-worker drain where a voice release is needed, coordinated API/voice/cron readiness and founder two-way live call. #1517 is merged and deployed to voice; that does not prove the call works end to end.
- [ ] Verify inbound call settlement, SMS carrier scope, email delivery/replies, billing and Computer execution.
- [ ] Restore CI or retain exact-candidate command-level proof (npm run verify:full). No skipped check counts as success.

## Phase 0 — consolidate
- [ ] Verify ownership of production-classified accounts and recheck grants, queued jobs, historical records and dependencies.
- [x] Remove legacy CRM/commerce routers, services, catalog tools and dispatch (#1518).
- [x] Settle the surviving provider list: retain Slack, X, Zoom, Google Sheets, Microsoft Teams, Excel and Yahoo mail, as well as Yahoo sign-in and supported Google/Microsoft mail/calendar. The proposed second deletion PR is cancelled.
- [ ] Preserve disconnect/revoke, historical receipts, account deletion and audit until absence of dependent data is established.
- [ ] Review an append-only migration for the empty agent teams/members and call queues after confirming no deployed reader/writer remains. Keep `wireline_crm_connections` while the seven retained connectors use it. No destructive migration before the documented promotion review.
- [ ] Reconcile missing schema indexes/tables against live catalog.
- [x] Remove retired Gemini Live runtime and dependency after reference audit (in the Phase 0 cleanup change).
- [ ] Separate sign-in and connector OAuth clients; narrow Drive access to selected files where feasible. Gate restricted Gmail/Drive access on required verification.
- [x] Close obsolete draft #1437; #1518 and the current Connector Gateway direction supersede its partial retirement approach. Dated audits remain indexed as historical evidence in `docs/AUDIT_INDEX.md`.

## Phase 1 — People
People is tenant-owned, with one person and multiple normalized identifiers, interaction provenance, follow-ups, reversible deduplication and explicit identity conflicts. Do not auto-merge ambiguous identities. Tenant RLS, server grants, deletion/export and cross-tenant tests are mandatory. Seed only verified founder/demo accounts; preserve channel receipts. Add permissioned find_person, record_interaction and update_person, UI timeline, and outward MCP people.read/people.write scopes. Keep customer records separate from model memory.

The existing `delegate_specialist` helper is confined to asynchronous Computer tasks. It has no tools, at most two calls per task, bounded context and output, and uses the parent's spend and cancellation gates. No general phone/text helper or new per-Bot helper switch is planned. Phone and text Bots already start Computer tasks for work that cannot finish within a live turn. Keep helper work visible in the task trace and preserve the no-tools boundary; giving a helper connector tools would be a separate product and authorization decision.

## Phase 2 — Connector Gateway
Reviewed catalog of native adapters and vetted remote MCP servers; official MCP SDK for client transport. Dedicated encrypted grants, per-Bot bindings, tool classification and authorization before every invocation. Recheck revocation and policy at execution, including approved retries. No arbitrary endpoints, dynamic unreviewed tools, model-visible tokens or unrestricted network access. Validate schemas, cap output, treat all external content as untrusted, and test prompt injection, SSRF, tenant isolation, idempotency and failure recovery. Reuse existing approvals, environment gates, audit and wallet. Reserve and settle usage once. Build Google/Microsoft adapters first, Slack write-first after vendor approval. Do not infer provider eligibility from code presence.

## Phase 3 — demand-driven
RCS after carrier and device eligibility proof; Apple Messages for Business research before any implementation; no unofficial Mac relay by default. A2A, CRM sync and other adapters require named pilot demand.

## Pilot exit criteria
Verified owner end-to-end voice, email, permitted messaging, Computer and billing; People history without duplicates; connector policy and revoked-grant tests. Recruit 1–3 design partners without claiming unverified channels are ready. Maintain one execution trace and unified activity surface.
