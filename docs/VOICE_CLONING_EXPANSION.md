# Wireline Voice Cloning Expansion

## Current state

Wireline has a functional ElevenLabs-backed instant-cloning path, a private voice library UI, pronunciation dictionaries, preview support, and provider-facing voice infrastructure.

This capability should **not** be described as production-ready solely because cloning succeeds. Production readiness requires privacy isolation, authorization evidence, deletion integrity, cost controls, provider resilience, disclosure policy, evaluation coverage, and verified deployment checks.

## Trust foundation added in the verified-voice review branch

- Premade-only public voice previews.
- Tenant-private catalog isolation.
- Strict audio MIME, base64, and decoded-size validation.
- Versioned authorization attestation in the consent ledger.
- One-way source-audio fingerprint without database retention of the sample.
- Durable per-user clone quota serialized across serverless replicas.
- Provider metadata minimization.
- Compensation deletion when local persistence fails.
- Generic user-facing provider errors.
- Authorization revocation audit on deletion.
- Clearer verified-voice UI copy and regression contracts.

## Remaining production gates

1. Add a provider-neutral voice identity and adapter contract.
2. Add a second clone/TTS provider and complete failover benchmarks.
3. Introduce a durable Voice Passport with provider mappings, use scope, expiry, disclosure, and deletion state.
4. Replace delete-and-forget behavior with deletion-pending retries when a provider is unavailable.
5. Add provider request timeouts, normalized errors, circuit breakers, and cost telemetry.
6. Add identity verification for higher-risk third-party voice use.
7. Complete legal review for biometric privacy, synthetic voice disclosure, call recording, telemarketing, and retention.
8. Validate typecheck, automated tests, deployment health, and end-to-end authenticated UI behavior.

## Strategic direction

Voice cloning is one component of Wireline's moat, not the moat itself. The durable advantage is a **Verified Voice Operations** system combining permissioned identity, provider portability, business workflow execution, omnichannel memory, human control, and measurable outcomes.

See [`VERIFIED_VOICE_MOAT_AND_PARTNER_STRATEGY.md`](./VERIFIED_VOICE_MOAT_AND_PARTNER_STRATEGY.md) for the partner sequence, architecture, product roadmap, metrics, and 90-day execution plan.
