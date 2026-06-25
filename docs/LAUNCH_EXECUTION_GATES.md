# Wireline Launch Execution Gates

This is the working contract for the current launch push. It replaces broad readiness language with gates that can be verified against the repo, Vercel, Supabase, and Stripe.

## Fixed live during this pass

- Supabase primary-key advisor cleanup was applied as migration `20260625022946_launch_primary_key_advisor_cleanup`.
- The four advisor tables now have primary keys:
  - `wireline_training_backup_20260609`
  - `wireline_onboarding_progress`
  - `wireline_quota_usage`
  - `wireline_oauth_pending_codes`
- Active non-Stripe subscription rows were verified as prelaunch demo grants with explicit `entitlement_source='demo'` and `grant_reason='prelaunch_demo_reset'`.

## Gates before launch traffic

| Gate | Status | Standard |
| --- | --- | --- |
| Vercel Node runtime | Open service setting | Vercel project setting must be Node 22.x, matching `package.json` and `vercel.json`. The repo already pins Node 22; the Vercel project setting still reports 20.x and must be corrected in Vercel. |
| Supabase leaked-password protection | Open service setting | Enable Supabase Auth leaked-password protection in Auth password security settings. Existing passwords can remain, but new/reset passwords must reject known-compromised passwords. |
| Supabase primary keys | Fixed live | No production table should appear in the Supabase `no_primary_key` advisor list. Backup tables may use surrogate keys. Counter/state tables should use composite keys matching write semantics. |
| Billing catalog truth | Guarded in code | Public plans must expose the platform-plus-Conversation-Balance model. Legacy personal plans may exist for compatibility but must not be sold as current public acquisition plans. |
| Entitlement provenance | Guarded in code and DB | Any active/trialing row without Stripe customer/subscription IDs must have an explicit allowed source and non-empty reason. Demo accounts are fine; silent unpaid active access is not. |
| Hard-cap claims | Guarded in code | Marketing and UI must not promise unlimited calls, included voice minutes, or no overages unless the runtime and billing contract actually enforce that promise. |
| Thin clients | Guarded in code | Browser extension, iOS, Android, and ChatGPT app stay client/control surfaces. Provider keys, billing authority, prompt construction, external actions, and tenant data policy remain server-owned. |

Run the local guard with:

```bash
node scripts/check-launch-blockers.mjs
```

For CI or production preflight, run strict mode:

```bash
PRODUCTION_CHECK=1 node scripts/check-launch-blockers.mjs
```

Strict mode fails when the live database URL is unavailable, because launch verification without the database is theater.

## Money loop proof

The minimum launch proof is not a polished screen. It is an observed, auditable loop:

1. New signup creates a user, account, settings row, trial/pending activation status, and selected wedge/plan intent.
2. User configures one assistant with phone routing, business context, voice, and at least one knowledge source.
3. First real conversation is completed through the production voice path, not a mock transcript.
4. Outcome is approved or rejected by the account holder and recorded as structured data.
5. If value exists, the user either tops up Conversation Balance through web Checkout or starts a paid business plan through Stripe Billing Checkout.
6. Subsequent usage consumes balance or emits Stripe metered overage exactly once, with no double-charge path.
7. Retained usage is visible in billing/usage, call history, knowledge, and follow-up surfaces.

## Knowledge ingestion standard

The current manual knowledge route is useful but not enough for launch-grade retrieval. The target ingestion system must support:

- `document`, `file`, `url`, and manual text source types.
- Source title, canonical URL, fetched timestamp, content hash, metadata, and owner scope.
- `agent` scope and `workspace` scope, with agent-scoped retrieval able to include workspace knowledge by policy.
- Deterministic chunking with source ID, chunk index, chunk count, hash, and recency metadata.
- Retrieval tests that prove newest source, exact-match source, and cross-agent/workspace scoping behavior.
- Runtime prompt injection from retrieved chunks, not merely the most recent 2000 rows.

## Voice provider standard

Wireline already has useful voice primitives: provider fields, per-agent voices, directional voices, cloned voices, pronunciation dictionaries, speed, and ElevenLabs tuning. The next step is not building a proprietary TTS model. The standard is:

- A provider abstraction that normalizes curated default voices, consented custom voice IDs, pronunciation dictionaries, fallback voices, and provider-specific settings.
- A per-agent voice fingerprint containing provider, voice ID, model, language behavior, speed, stability/similarity/style, speaker boost, dictionary IDs, and fallback plan.
- Latency and cost telemetry for each call: provider, model, time to first audio, total synthesis time if available, fallback used, and estimated TTS cost.
- Explicit consent records before customer-supplied cloned voices can be used.
- No client surface stores provider credentials or can launch a voice outside the server policy path.
