# Supabase Advisor Posture - 2026-07-07

Last refreshed: **2026-09-01** via Supabase MCP against project `ogenlhodmwvyacvnrsnj` (`us-east-2`, `ACTIVE_HEALTHY`, Postgres 17.6.1).

## Security

Supabase security advisors currently report one warning:

- `auth_leaked_password_protection` - Supabase Auth leaked-password protection is disabled.

Wireline does not use Supabase Auth for sign-up, sign-in, password reset, session minting, or session verification. The active password-verification path is Wireline-owned custom auth with Have I Been Pwned k-anonymity screening, documented in `docs/security/auth-password-controls.md`.

Decision: keep Wireline's custom breached-password control as the production control. Enabling Supabase Auth leaked-password protection is still acceptable as a defense-in-depth dashboard setting, but it is not the active app control and the current connector does not expose an Auth config write.

Remediation reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Live privilege follow-up on 2026-08-18: `wireline_reclaim_abandoned_stripe_event_claim` and `wireline_set_subscription_entitlement_source` were invoker trigger functions that still inherited `PUBLIC EXECUTE`. Migration `0155_hot_path_knowledge_and_jobs_indexes` revokes that grant. They are not `SECURITY DEFINER`.

## Performance

Supabase performance advisors report `unused_index` infos across low-traffic and future-path tables. The 2026-07-10 table inventory confirmed the application tables are present and RLS-enabled, including `wireline_deletion_queue`, `wireline_jobs`, `wireline_call_logs`, `wireline_audit_log`, `wireline_users`, Stripe/billing tables, SMS/email tables, MCP tables, and browser handoff tables.

Decision: do not drop these indexes from a live shared production database solely because the advisor has not observed traffic. Treat each candidate as traffic-evidence work:

- Verify production query plans and call frequency for the owning feature.
- Keep indexes that protect latency on rare but important flows, including auth, OAuth, callbacks, handoff, billing, audit, recovery, DNC, compliance, and account-deletion paths.
- Remove only indexes with a clear write-amplification cost and no current or roadmap-backed read path.
- Never drop an index during a repo cleanup pass unless the exact feature owner, query plan, and rollback path are documented in a migration.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

The 2026-08-18 live audit found the opposite defect: schema-declared hot-path indexes were **missing**, not unused. `pg_stat_statements` showed `wireline_knowledge` tenant recency and agent+user lookups plus `wireline_jobs` retention deletes without covering indexes. Those names were authored in unjournalled `0018_add_more_performance_indexes.sql` and never reached this database. Journalled migration `0155_hot_path_knowledge_and_jobs_indexes` installs them. Other schema-declared indexes that are still absent sit on tiny or empty tables, or are left-prefixes of covering indexes that already exist; they are deferred until a matching query plan appears.

Production artifact builds are read-only. The explicit exact-SHA schema-promotion path is authoritative for the committed Drizzle journal; an authenticated Supabase migration operation is reserved for the documented urgent path and must receive the same committed SQL plus live effect verification. On 2026-09-01, the application ledger and catalog effects were verified through `0172_remove_retired_xai_voice_bindings`. The separate Supabase dashboard ledger is not BotBound's application migration authority and must never be "tidied" by replaying historical migrations.

## Current external posture

- Project status: active healthy.
- Security advisor posture: one warning, accepted because custom auth owns the relevant control.
- Performance advisor posture: informational unused-index notices remain evidence-gated; missing hot-path indexes were applied in `0155`, and the new `0171` send-operation indexes are expected to remain unused until that path receives traffic.
- Data safety posture: no unused-index drops, no leftover Lovable `kv_store_64639c03` drop, and no drop of `wireline_training_backup_20260609`.
