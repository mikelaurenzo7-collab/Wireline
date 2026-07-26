# Launch Readiness Audit — 2026-07-26 (round 4)

Status: **Active** — four-track deep audit (RLS/GDPR, TCPA gate, API honesty, audit-gate tooling) with verified code fixes shipped this pass.

## Track 1 — RLS / GDPR

1. **MCP tables `wireline_server` default-deny (0114's missed siblings).** `wireline_mcp_oauth_codes` / `wireline_mcp_access_tokens` / `wireline_mcp_refresh_tokens` had grants (0104) but no permissive policy, and `wireline_mcp_oauth_clients` had neither when created at runtime. Any tenant-context query — notably the GDPR purge's DELETEs — silently touched zero rows. Fixed three ways:
   - `0115_mcp_tables_wireline_server_policies.sql` — tenant-isolation policies on the token tables, full server access on the client registry. **Applied to the live Supabase DB and verified** (all four tables now show the `wireline_server` policy).
   - `ensureMcpSchema()` now self-grants + creates the policies after its `CREATE TABLE IF NOT EXISTS`, mirroring `browser-handoff-routes`.
   - Contract: `tests/rls-purge-tenant-context-contract.test.ts`.
2. **GDPR purge tenant-context immunity.** The manual jobs sweep and `POST /api/jobs/:id/run` execute job handlers inside the caller's `AsyncLocalStorage` tenant scope; `purgeAccount` there would silently no-op under RLS (or hard-fail on `wireline_oauth_pending_codes`, which is deliberately ungranted) while reporting a completed purge. `purgeAccount` + `releaseExternalResourcesForPurge` now run inside `tenantStore.exit(...)`, restoring cron-path semantics on every invocation path.

## Track 2 — TCPA / outbound gate

3. **Mid-call `send_text_message` third-party exemption abuse.** The Vapi tool asserted `isLiveSessionFollowUp` + `hasExpressWrittenConsent` unconditionally, but `to_number` is a model-supplied argument — an LLM-chosen third-party number got quiet hours, the 24h duplicate window, and express consent all waived. The exemptions now apply only when the destination equals the live-call counterpart; any other number clears the full gate. (Audit also confirmed all 11 outbound dial/SMS sites route through `evaluateOutboundDialGate` — no hard bypass exists.)

## Track 3 — API / consumer honesty

4. **SMS opt-in wiped manual/legal DNC rows.** The exact-keyword interceptor was already scoped, but bodies like `"yes please"` fall through to the base route's leading-word match, which deleted **every** DNC row for the number (manual, legal, agent opt-out). The base-route delete is now scoped to SMS-created suppressions (`reason='opt-out'`, source `twilio_advanced_opt_out|sms_opt_out`).
5. **Opt-out/opt-in confirmations over failed writes.** STOP/START/resubscribe replies no longer confirm when the DNC/consent write failed; STOP persistence failure pages ops via `reportError`.
6. **`add_to_dnc` false assurance.** On insert failure the agent no longer tells a live consumer "we'll make sure that's taken care of" — it admits the failure and asks them to repeat/contact.
7. **`update_lead_status` no-op success.** Reports honestly when there is no caller number or no matching lead row (checked via `.returning()`).
8. **Email unsubscribe honesty (CAN-SPAM).** `recordEmailSuppression` returns `false` instead of throwing; both endpoints discarded it. One-click POST now answers 503 (retryable) on a failed write instead of telling Gmail/Yahoo the opt-out was honored; the human GET renders an honest retry page instead of "You're unsubscribed".
9. **Meta data-deletion callback.** A failed `crm_connections` deactivation returned 200 + confirmation code — exactly what stops Facebook's retries, with nothing persisted for later. Now 503 so Facebook redelivers.
10. **Agent-cap race on the MCP draft path.** `createAgentDraft` ran count → check → insert as three independent statements; parallel MCP tool calls could exceed the plan cap. Now serialized in a transaction with `pg_advisory_xact_lock(hashtext(userId))`, same as `agent-routes-v2` / `mobile-routes`.
11. **`killCall` trusted a non-2xx terminate.** `fetchWithTimeout` doesn't throw on non-2xx, so a Vapi 500 still marked presence "terminated" while the agent kept talking (including the DNC-mid-call path). The presence update now requires `response.ok`.
12. **`tenant-quotas` stale "fail-OPEN" docstring** corrected (behavior is fail-closed-by-exception; `api-rate-limits.ts` is the layer that decides).

Contract: `tests/round6-honesty-compliance-contract.test.ts`; `tests/round5-finetune-fixes-contract.test.ts` updated to pin the stricter live-session contract.

## Track 4 — audit-gate tooling

13. The authz matrix generator and route-registry check were blind to ~21% of the mounted surface (sub-routers, `oauth/` directory, factory-handler regex swallowing, comment-before-path skips, unverified `MOUNTED_ELSEWHERE` claims). Both scripts hardened and `docs/AUTHZ_MATRIX.md` regenerated; every newly visible route verified gated (no live auth gap found).

## Verified-clean during this audit (no change needed)

- Route registry: no orphan route files; all 103 files mounted or reached via a mounted parent.
- Auth gates: no unauthenticated tenant-data handler on the mounted surface.
- Webhook signature verification (Twilio/Vapi/Stripe/Meta): fail-closed, no bypass.
- Stripe webhook idempotency, trial gate, spend guards, credit wallet locking, SSRF validators: all hardened as documented in prior rounds.

## Ops still open (unchanged from 2026-07-25)

Federal DNCScrub `loginId`, `WIRELINE_LAUNCH_DEMO_MODE`, `VITE_SENTRY_DSN`, Upstash rate-limit vars — see `LAUNCH_READINESS_AUDIT_2026-07-25.md`.
