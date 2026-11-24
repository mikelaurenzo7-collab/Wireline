# BotBound AI-native roadmap — November 24, 2026

Status: proposed implementation baseline; not evidence of deployed functionality. Supersedes the October 27 connector direction when approved and merged. Existing deployment, carrier, consent and database runbooks remain authoritative.

Re-checked on November 24, 2026 against `main` `b35b578`. Public `https://botbound.app/healthz` reports that commit with traffic enabled. The homepage and `/pricing` render with no console errors. Published plans are Lite $12, Starter $24, and Plus $49, with calls at $0.25/min, SMS at $0.04/segment, email at $0.02, and Computer at $0.20/min. BotBound's Render services are in workspace "My Workspace". "BEASTBOTS" is a different product. The ElevenLabs connector is not mounted in this session, so usage quota is still unread. The database has one ready ElevenLabs clone. That does not add a roadmap item. The phone runtime stays xAI, with OpenAI as the fallback.

## Release first
- [ ] Put API, voice, and both crons on one source, then complete the founder call. API, daily-brief, and jobs-sweep are live on `b35b578` (#1518). Voice is live on `8fc106624` (#1521) because auto-deploy is off. The gap is four voice files, including the `xai-carrier-audio` type fix. Replacing the worker requires the authenticated drain, and this environment does not have the worker secret, so voice was not deployed. #1517 is merged. A non-demo call past five minutes is still open: the last 14 days have 3 non-demo inbound and 4 non-demo outbound calls, and none of the 31 non-demo calls on record reached five minutes.
- [ ] Verify inbound call settlement, SMS carrier scope, email delivery and replies, billing, and Computer execution. Resend domains `botbound.app`, `botbound.me`, and `trywireline.com` are verified with sending enabled, and the negative-delivery webhook is enabled at `https://botbound.app/api/webhooks/resend`. Recent transactional mail is delivered. AgentMail is serving managed Bot mailboxes on `bots.botbound.app`. Stripe live mode on BOTBOUND LLC has 0 subscriptions and a $0 balance. One founder-related production row still stores an active `usage` entitlement through 2026-12-21 whose customer and subscription are not on that Stripe account. Computer tasks are 84: 48 completed, 19 stopped, 13 failed, 4 blocked.
- [ ] Retain exact-candidate command-level proof (`npm run verify:full`) for the voice promotion. GitHub Actions stays off by the founder's recorded choice. A skipped check is not a pass.

## Phase 0 — consolidate
- [ ] Confirm who owns the 13 production-classed accounts. Counts are still 131 test, 13 production, and 5 demo. The 13 production accounts use 7 email domains, so they are not yet shown to be one owner.
- [x] Legacy CRM and commerce routers, services, catalog tools, and dispatch are removed in #1518 and serving on the API.
- [ ] Remove legacy Slack, X, Zoom, Sheets, Teams, Excel, and Yahoo mail paths in a second reviewed change. Preserve Yahoo sign-in and supported Google and Microsoft mail and calendar. Those routers are still mounted. Deleting Slack, Sheets, Teams, and Excel removes connectors the product may offer again, so that part stays a founder decision.
- [ ] Preserve disconnect, revoke, historical receipts, account deletion, and audit until dependent data is shown to be absent. `wireline_crm_connections` has 0 rows. One Microsoft mail grant and one Microsoft calendar grant remain. Google grants are 0. The outward MCP server has 3 registered clients and 0 tokens.
- [ ] Only after deployed readers and writers are gone, review one append-only migration that drops legacy connections, agent teams, agent team members, and call queues. The team tables are empty. No destructive migration before approval.
- [ ] Declare the missing unique indexes and the migration-only tables in Drizzle, checked against the live catalog.
- [x] Retired Gemini runtime and `@google/genai` are removed. The server no longer imports them. `gemini_ground` stays so saved research selections still resolve.
- [ ] Separate sign-in and connector OAuth clients. Narrow Drive access to selected files where a file picker is enough. Keep restricted Gmail and Drive access behind Google's required verification.
- [ ] Archive superseded dated audits. Draft #1437 is closed and was not merged.

## Phase 1 — People and helpers
People is tenant-owned, with one person and multiple normalized identifiers, interaction provenance, follow-ups, reversible deduplication and explicit identity conflicts. Do not auto-merge ambiguous identities. Tenant RLS, server grants, deletion/export and cross-tenant tests are mandatory. Seed only verified founder/demo accounts; preserve channel receipts. Add permissioned find_person, record_interaction and update_person, UI timeline, and outward MCP people.read/people.write scopes. Keep customer records separate from model memory.

Helpers use one per-Bot toggle, initially thinking-only, at most one level and two calls per parent task, with bounded context/time/output. Parent authorization, environment, budget and cancellation apply. Existing explicit tool lists require a reviewed migration that preserves owner opt-outs. Record parent-child trace and usage without double billing. Slow work uses durable task handles; never block a live call indefinitely.

## Phase 2 — Connector Gateway
Reviewed catalog of native adapters and vetted remote MCP servers; official MCP SDK for client transport. Dedicated encrypted grants, per-Bot bindings, tool classification and authorization before every invocation. Recheck revocation and policy at execution, including approved retries. No arbitrary endpoints, dynamic unreviewed tools, model-visible tokens or unrestricted network access. Validate schemas, cap output, treat all external content as untrusted, and test prompt injection, SSRF, tenant isolation, idempotency and failure recovery. Reuse existing approvals, environment gates, audit and wallet. Reserve and settle usage once. Build Google/Microsoft adapters first, Slack write-first after vendor approval. Do not infer provider eligibility from code presence.

## Phase 3 — demand-driven
RCS after carrier and device eligibility proof; Apple Messages for Business research before any implementation; no unofficial Mac relay by default. A2A, CRM sync and other adapters require named pilot demand.

## Pilot exit criteria
Verified owner end-to-end voice, email, permitted messaging, Computer and billing; People history without duplicates; helper toggle on/off in rehearsal; connector policy and revoked-grant tests. Recruit 1–3 design partners without claiming unverified channels are ready. Maintain one execution trace and unified activity surface.
