# Wireline Launch Execution Gates

This is the current launch contract for `main`. It keeps the product direction tight: Create -> Train -> Run, Wireline Command, native thin clients, ChatGPT App, Stripe-backed Team/Business capacity, and Personal live work funded through Conversation Balance.

## Live audit snapshot

- GitHub `main` is at `43fc4da9c750b0ef280988fcc0a45a5b8b10f623` (`Polish create-train-run activation flow`).
- Vercel project `wireline` is deploying from `main` and the latest production deployment is `READY`.
- Vercel production runtime logs showed no `error` or `fatal` entries in the last 24 hours during this audit.
- Vercel project setting still reports Node `20.x`; repo `vercel.json` pins build env `NODE_VERSION=22`.
- Supabase security advisor still reports leaked-password protection disabled.
- Supabase performance advisor is informational unused-index noise only; no primary-key launch finding is currently reported.
- Supabase migration `20260626171500_harden_conversation_balance_ledger` is applied.
- Stripe live catalog has the desired active products for Team, Business, Enterprise, Personal, and Conversation Balance. Active legacy recurring prices still exist and should remain hidden from public acquisition paths until a deliberate archive/migration pass.

## Gates before launch traffic

| Gate | Status | Standard |
| --- | --- | --- |
| Vercel Node runtime | Open service setting | Vercel project setting must be Node 22.x. Repo build env already pins Node 22, but project-level `nodeVersion` still reports `20.x`. |
| Supabase leaked-password protection | Open service setting | Enable Supabase Auth leaked-password protection in Auth password security settings. |
| Supabase primary keys | Guarded | No production table should appear in primary-key advisor findings. Launch tables and ledger tables must have primary keys. |
| Conversation Balance ledger | Guarded | Top-ups, reversals, and burns must remain append-only, idempotent, and serialized per user. No partial balance burn may be paired with Stripe metering for the same usage. |
| Billing catalog truth | Guarded | Public recurring plans must expose the capacity plus Conversation Balance model. Personal is top-up-led, not a recurring public acquisition plan. |
| Stripe catalog cleanup | Manual approval required | Do not mutate live products/prices without confirming env mappings and active checkout paths. Archive only retired legacy prices after proving no route references them. |
| Entitlement provenance | Guarded | Any active/trialing row without Stripe customer/subscription IDs must have an explicit allowed source and non-empty reason. |
| Hard-cap claims | Guarded | Marketing and UI must not promise unlimited calls, included voice minutes, or no overages unless runtime and billing enforce that promise. |
| Thin clients | Guarded | Browser Command, iOS, Android, widgets, and ChatGPT App remain control surfaces. Provider keys, billing authority, prompt construction, external actions, and tenant policy stay server-owned. |

Run the local guard with:

```bash
npm run launch:check
```

For CI or production preflight, run strict mode:

```bash
PRODUCTION_CHECK=1 npm run launch:check
```

Strict mode fails when the live database URL is unavailable because production launch verification without database checks is not meaningful.

## Money Loop Proof

The minimum launch proof is an observed, auditable loop:

1. New signup persists user, account, settings, selected workspace mode, and preferred plan intent.
2. User creates one agent through the short intake.
3. User trains that agent with rules, sources, voice, test calls, and memory.
4. User runs the agent through Studio, completing a real provider-backed conversation.
5. Outcome is approved, rejected, or handed off and recorded as structured data.
6. If value exists, the user either tops up Conversation Balance or starts a Team/Business subscription through Stripe Checkout.
7. Subsequent usage consumes balance or emits Stripe metered overage exactly once.
8. Usage and payment state are visible in billing, ledger, call history, inbox, and follow-up surfaces.

## Voice Provider Standard

Wireline should not synthesize its own production TTS model before launch. The launch-grade path is a provider abstraction:

- Curated default voices plus consented custom voice IDs.
- Per-agent fingerprint: provider, voice ID, model, language behavior, speed, stability/similarity/style, dictionary IDs, fallback plan.
- Latency and cost telemetry per call: provider, model, time to first audio, synthesis time if available, fallback used, estimated TTS cost.
- Explicit consent records before customer-supplied cloned voices can be used.
- No client surface stores provider credentials or can launch voice outside the server policy path.

## Knowledge Ingestion Standard

Manual training remains useful, but launch-grade retrieval needs deterministic ingestion:

- Source types: document, file, URL, and manual text.
- Source title, canonical URL, fetched timestamp, content hash, metadata, and owner scope.
- Agent scope and workspace scope with policy-controlled inheritance.
- Deterministic chunks with source ID, chunk index/count, hash, and recency metadata.
- Retrieval tests for newest-source, exact-match, and cross-agent/workspace scoping behavior.
- Runtime prompt injection from retrieved chunks, not a broad row dump.
