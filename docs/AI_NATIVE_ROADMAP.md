# BotBound AI-native roadmap — November 24, 2026

Status: proposed implementation baseline; not evidence of deployed functionality. Supersedes the October 27 connector direction. Existing deployment, carrier, consent and database runbooks remain authoritative. Updated November 24 with the thesis, connector targets, the iMessage decision, research findings and the repo debt a code audit verified.

## Thesis
BotBound is the system of record for a small business's customer conversations. Calls, texts, emails and bookings land in one place and the Bot keeps it current. People is the AI-native CRM: no pipeline builder and no objects to configure, only one record per person, a timeline, and fields the Bot maintains with owner approval. It is exposed through MCP (people.read, people.write), webhooks and later an API, so owners and their own AI tools (Claude, ChatGPT) build their own views and automations on it instead of buying a legacy CRM. Connectors bring the owner's existing tools (Google Workspace, Microsoft 365, Slack, iMessage on their own Mac) into that record. BotBound does not clone them.

## Release first
- [x] Merge and deploy the answered-call audio repair from PR #1517.
- [ ] Verify an answered founder call with a greeting, two-way audio, interruption, and a matching Call/usage receipt. Align the four Render revisions through the authenticated voice drain before the next release.
- [ ] Verify inbound call settlement, SMS carrier scope, email delivery/replies, billing and Computer execution.
- [ ] Restore CI or retain exact-candidate command-level proof (npm run verify:full). No skipped check counts as success.
- [ ] Add a scheduled canary: one real test call and one test text to the founder's handset with the result emailed, plus external uptime checks and error alerts to the founder's phone. A plain uptime check cannot see a broken voice path.
- [ ] Day-zero activation: a test call to the owner's own Bot before texting approval arrives (carrier review takes days to weeks), with a registration status shown in the app while it waits.
- [ ] Billing trust: lower the default spend limit on small plans, warn at 80%, state the cancellation terms and the 30-day refund at checkout.

## Phase 0 — consolidate
- [x] Remove legacy CRM/commerce routers, services, catalog tools and dispatch (#1518: Salesforce, HubSpot, Apollo, Meta, Shopify, Square, the lead hunter, proactive lead enrichment and the role templates).
- [ ] Verify ownership of production-classified accounts and recheck grants, queued jobs, historical records and dependencies.
- [x] Remove the X, Zoom and Yahoo mail paths in reviewed changes. Slack, Google Sheets, Microsoft Teams and Excel are on the owner's November 24 keep list and stay, as do Yahoo sign-in and the supported Google/Microsoft mail and calendar paths.
- [ ] Preserve disconnect/revoke, historical receipts, account deletion and audit until absence of dependent data is established.
- [ ] Only after deployed readers/writers are gone, review append-only migration for legacy connections, agent teams/members and call queues. No destructive migration before approval.
- [ ] Reconcile missing schema indexes/tables against live catalog (the real-database lane documents 30 unique indexes absent from schema.ts); remove retired Gemini runtime and dependency after reference audit.
- [ ] Separate sign-in and connector OAuth clients; narrow Drive access to selected files where feasible. Gate restricted Gmail/Drive access on required verification.
- [ ] Archive superseded audits and reconcile draft #1437.

Repo debt the November 24 audit found and a second read of the tree confirmed:
- Rename `agent-routes-v2.ts`, `qa-routes-v2.ts` and `google-drive-sync-v2.ts`; no v1 exists for any of them.
- Retired Live Video: `src/lib/video-presenter/` (12 files), `LiveVideoPresenter.tsx`, `LiveVideoStudioPage.tsx`, `stripe-live-video-addon.ts`.
- No importer in `src/`: `voice/gemini-live-client.ts` (a test only) and `cloud-computer/trade-portal-mirroring.ts` (its own tests only). The `wireline_design_integrations` table is read only by the account-deletion registry. The `calendar_sync` and `google_drive_ingest` job types are declared in `job-queue-base.ts` with no producer.
- Vercel leftovers: the `api/` directory and `src/entrypoints/chatgpt-mcp-api.ts`, to remove once the rollback path is retired.
- Vapi-era naming: `vapiCallId` appears in 37 source files and the outbound webhook payload still carries `vapi_call_id`. Renaming needs an append-only migration and a versioned webhook payload.
- Docs to reconcile: `CODEBASE_HEALTH.md` cites `apps/desktop/`, which does not exist; confirm `OPENAI_REALTIME_VOICE.md` and `CODEBASE_HEALTH.md` agree with the code that xAI Grok Voice is the default phone provider; dated documents that still say "Status: Active".
- Retention: the 365-day purge deletes call logs, email, appointments and leads but not SMS. People must be exempt, and retention should be consistent per object.

## Phase 1 — People and helpers
People is tenant-owned, with one person and multiple normalized identifiers, interaction provenance, follow-ups, reversible deduplication and explicit identity conflicts. Do not auto-merge ambiguous identities. Tenant RLS, server grants, deletion/export and cross-tenant tests are mandatory. Seed only verified founder/demo accounts; preserve channel receipts. Add permissioned find_person, record_interaction and update_person, UI timeline, and outward MCP people.read/people.write scopes. Keep customer records separate from model memory.

Starting point, from the audit: every channel stores the customer as plain text (`customer_number` on calls and SMS threads, `customer_email` on email threads, `phone_number` on appointments) and records are matched by the last ten digits. Nothing links one person across channels, and no timeline exists. Design:
- Three tables: people (name, company, status, a Bot-maintained summary, owner custom fields, a reversible merge pointer), person identifiers (phone in E.164 or lowercased email, unique per tenant, with source and verified flag), and person events (notes, interactions, field changes, merges, with the actor).
- The timeline is a read-time union over the existing channel tables joined through identifiers. Nullable person ids on the large tables come later, only if the union proves slow.
- Live calls keep today's rule: no record reads while the caller is unverified. After the call, an internal update_person action (replacing the removed CRM update action) writes through the existing autonomy, draft and approval path.
- MCP people writes are an owner opt-in, like connected-app Training writes. No pipelines, deals or custom-object builder until owners ask.

Helpers use one per-Bot toggle, initially thinking-only, at most one level and two calls per parent task, with bounded context/time/output. Parent authorization, environment, budget and cancellation apply. Existing explicit tool lists require a reviewed migration that preserves owner opt-outs. Record parent-child trace and usage without double billing. Slow work uses durable task handles; never block a live call indefinitely.

## Phase 2 — Connector Gateway
Reviewed catalog of native adapters and vetted remote MCP servers; official MCP SDK for client transport. Dedicated encrypted grants, per-Bot bindings, tool classification and authorization before every invocation. Recheck revocation and policy at execution, including approved retries. No arbitrary endpoints, dynamic unreviewed tools, model-visible tokens or unrestricted network access. Validate schemas, cap output, treat all external content as untrusted, and test prompt injection, SSRF, tenant isolation, idempotency and failure recovery. Reuse existing approvals, environment gates, audit and wallet. Reserve and settle usage once. Build Google/Microsoft adapters first, then narrow the retained Slack adapter to reviewed write-first actions after vendor approval. Do not infer provider eligibility from code presence.

Catalog targets, in build order:
1. Google Workspace: Calendar and Contacts into People first (bookings and identities are the most value), then Gmail threads into the People timeline, then Drive, Docs and Sheets as files.
2. Microsoft 365: Outlook calendar, Outlook mail and contacts, then OneDrive.
3. Slack: notify first, then read threads with approval.
4. iMessage through BotBound for Mac (Phase 3).
5. Later and on demand: Stripe payment links for the owner's customers, QuickBooks, a scheduling tool, Jobber, Spectora or ISN.

What exists in this candidate (audit, November 24): per-tenant Google and Microsoft OAuth for mail and calendar, retained Slack/Sheets/Teams/Excel paths, and the iCloud mail path. X, Zoom and Yahoo mailbox paths are removed; Yahoo account sign-in remains. Gaps the gateway must close: mail and calendar sync run only when the user asks (no Gmail watch or Graph subscriptions, and no scheduler), Google has two separate grants, Drive import has no interface and reads only the email-account token, the Microsoft Files scope is requested but unused, and there is no Contacts API on either side. `docs/CONNECTORS.md` records what this candidate ships.

## Phase 3 — demand-driven
- **iMessage: BotBound for Mac.** Model it on Claude's own iMessage connector: a local companion on the owner's Mac that reads and sends through the Messages app with the owner's Apple ID, behind macOS Automation and Full Disk Access prompts, with no Apple credentials and no relay on BotBound's servers. Every send needs owner approval and never goes to an opted-out contact. Message content stays on the Mac unless the owner saves an interaction to People. Needs its own signing, notarization and update channel, and ships after the gateway. Apple Messages for Business remains a later official option for customer-started chat.
- RCS after carrier and device eligibility proof. A2A, CRM sync and other adapters require named pilot demand.

## Outbound positioning
Sell outbound as consent-first follow-up for people who asked to hear from the business: appointment and invoice reminders first, callbacks to leads only with written consent captured on the business's own form, no cold outreach, no uploaded lists, no AI-voice reactivation of past customers. Marketing texts need a separate Marketing or Mixed carrier campaign; the customer-care campaigns cannot carry them. Gates before any marketing outbound: a consent ledger with purpose and channel, opt-outs across text and voice (keyword or plain language), Do Not Call and reassigned-number checks, quiet hours by recipient state (Texas starts at 9 a.m., noon on Sunday), no more than three attempts per 24 hours, and an AI disclosure in the first sentence. If these cannot ship, launch outbound disabled. Avoid earnings or "100x" claims.

## Pilot exit criteria
Verified owner end-to-end voice, email, permitted messaging, Computer and billing; People history without duplicates; helper toggle on/off in rehearsal; connector policy and revoked-grant tests. Recruit 1–3 design partners without claiming unverified channels are ready. Maintain one execution trace and unified activity surface.
