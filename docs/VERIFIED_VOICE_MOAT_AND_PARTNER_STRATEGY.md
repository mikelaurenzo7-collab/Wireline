# Wireline Verified Voice Moat & Partner Strategy

**Status:** Product and architecture direction  
**Date:** 2026-08-01  
**Decision owner:** Wireline

## Executive decision

Voice cloning is a feature, not a durable moat. Model quality, latency, and cloning fidelity will continue to commoditize as large model, cloud, and contact-center vendors ship comparable capabilities.

Wireline should position itself as the **verified voice operations layer for real businesses**:

> A trusted assistant platform that can sound on-brand, act under explicit rules, complete work across voice, text, and email, prove authorization, survive provider failures, and measure business outcomes.

The moat is the compound system:

1. **Verified Voice Identity** — authorization, provenance, use scope, revocation, disclosure, and audit evidence.
2. **Provider-Neutral Voice Fabric** — quality/cost/latency routing, fallback, portability, and controlled vendor exposure.
3. **Conversation-to-Outcome Engine** — every interaction can book, qualify, collect, update, schedule, escalate, and follow up.
4. **Vertical Operating Memory** — terminology, policies, objections, workflows, and integrations improve by industry and tenant.
5. **Reliability and Evaluation Data** — latency, interruption quality, task completion, transfer success, conversion, and customer satisfaction become proprietary operating data.
6. **Omnichannel Continuity** — the same assistant and customer context continue across phone, SMS, email, web, and mobile.

## Current review findings

The referenced product lineage already contains meaningful strengths: cloned voices, pronunciation dictionaries, provider catalogs, voice observability, human handoff, omnichannel records, goals, spend controls, and audit infrastructure.

The strict review also identified material gaps that must be closed before voice cloning can be marketed as a trust advantage:

- Public preview resolution accepted arbitrary provider voice IDs even though comments claimed tenant clones were protected.
- The authenticated catalog filtered only `cloned` voices, leaving other private/generated provider categories at risk of cross-tenant exposure.
- Consent was a request boolean rather than durable, versioned evidence.
- The clone limiter was process-local and IP-scoped despite being described as per-user; this is unreliable on serverless infrastructure.
- Uploaded audio was size-checked by base64 string length but not strictly decoded or MIME-allowlisted.
- Provider metadata included the internal Wireline user UUID.
- A successful provider clone followed by failed local persistence could leave an orphaned paid resource.
- Raw provider error details could be returned to the account holder.
- The existing expansion document called the implementation “production-ready” without recording these limitations or verification gates.

## Implemented trust foundation in this branch

- Public preview is restricted to provider-premade voices.
- Authenticated catalogs include the tenant’s own clones plus premade voices only.
- Audio MIME, base64 integrity, decoded size, and minimum payload are validated server-side.
- File signatures are matched to the declared audio MIME before provider processing.
- A versioned speaker-authorization attestation is persisted to the consent ledger.
- A SHA-256 source fingerprint is recorded; Wireline does not persist source audio in its database.
- Clone requests are reserved inside a database transaction with a per-user PostgreSQL advisory lock and a durable 24-hour audit-ledger quota.
- Internal tenant IDs are removed from provider voice descriptions.
- Provider clones are deleted as compensation when local ownership persistence fails.
- Provider failure details remain in server logs and are not returned to users.
- Voice deletion records an authorization-revocation event.
- New clones remain private until a founder listens to a fresh Flash 2.5 proof and approves them.
- Provider-verification requirements fail closed; revoked voices are removed from every live agent.
- Inbound and outbound calls share one managed runtime with a different-provider Vapi fallback.
- The product UI explains authorization evidence, source handling, permitted formats, and revocation.
- Regression contracts protect the above behaviors.

## Product positioning

### Category

**Verified AI Assistants for Customer Conversations**

### Core promise

Wireline assistants handle voice, text, and email conversations under the account holder’s rules, using authorized brand voices and completing work in the systems the business already uses.

### What not to lead with

- “The most realistic AI voice.” Vendors can copy or outperform that claim.
- “Create a clone in seconds.” This attracts abuse and reduces enterprise trust.
- “Unlimited agents/minutes.” This weakens margins and obscures outcomes.
- A long vendor list. Customers purchase dependable results, not infrastructure trivia.

### What to lead with

- **Sound like your business—used with permission.**
- **Turn conversations into completed work.**
- **One assistant context across voice, text, and email.**
- **Human control, visible rules, and complete audit history.**
- **Provider resilience without customer reconfiguration.**

## Partner and integration sequence

The order matters. Do not integrate every vendor simultaneously. Each partner must improve resilience, trust, distribution, workflow depth, or unit economics.

| Priority | Partner / category                           | Role for Wireline                                        | Why it matters                                                                                                         | Integration gate                                                                                                                                |
| -------- | -------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **ElevenLabs**                               | Primary expressive TTS and current cloning provider      | Existing implementation, strong voice quality, broad creation options                                                  | Keep behind Wireline provider contract; remove hard-coded assumptions and benchmark quarterly                                                   |
| 1        | **Cartesia**                                 | Secondary cloning/TTS lane                               | Creates an immediate second-source path and supports private cloned voices                                             | Ship only after capability contract, consent parity, deletion parity, latency/cost benchmarks, and failover tests                               |
| 1        | **LiveKit**                                  | Provider-neutral realtime orchestration evaluation       | Open framework, telephony, handoffs, interruption handling, testing, and broad model plugins reduce runtime lock-in    | Build a controlled spike; do not replace Vapi until call completion, latency, observability, and operating cost are proven                      |
| 1        | **Deepgram**                                 | Full-pipeline benchmark and emergency voice runtime      | One WebSocket can cover listening, reasoning integration, speaking, function calling, multi-agent flows, and telephony | Benchmark as a fallback lane and enterprise deployment option; preserve Wireline tools and memory as the control plane                          |
| 1        | **Telnyx or Bandwidth**                      | Secondary telephony carrier                              | Carrier redundancy, number portability, routing control, and margin leverage                                           | Abstract phone-number inventory and routing before adding; test emergency reroute and webhook parity                                            |
| 1        | **Jobber or Housecall Pro**                  | First vertical system-of-record wedge                    | Home-service businesses have clear call-to-booking workflows and measurable revenue outcomes                           | Select one based on API access and design-partner demand; complete booking, customer, job, quote, and status loops                              |
| 2        | **Microsoft Azure Personal Voice**           | Regulated/enterprise personal voice lane                 | Microsoft requires approved use cases and recorded verbal consent, which aligns with a verified-voice enterprise offer | Pursue after identity verification and consent artifact storage are production-ready                                                            |
| 2        | **Resemble AI**                              | Deepfake detection, watermarking, and provenance partner | Trust tooling can differentiate Wireline as synthetic voice becomes easier to produce                                  | Begin with outbound watermark/provenance evaluation and high-risk inbound-call detection; treat vendor performance claims as claims to validate |
| 2        | **Pindrop**                                  | Enterprise contact-center fraud/deepfake layer           | Strong fit for financial services and large contact centers that need authentication and fraud controls                | Partner only when enterprise pipeline warrants integration and procurement cost                                                                 |
| 2        | **ServiceTitan**                             | Higher-ACV field-service system of record                | Deep workflow and revenue value for mature service businesses                                                          | Enter after the first SMB field-service integration proves activation and retention                                                             |
| 2        | **Genesys Cloud / Amazon Connect / Five9**   | Enterprise distribution and contact-center embedding     | Lets Wireline become an intelligence/action layer instead of replacing mature telephony estates                        | Package as an adapter and supervised assistant offering, not a second full product                                                              |
| 3        | **Rime, Hume, or specialized voice vendors** | Specialty timbre, emotion, or vertical voice quality     | Can win specific languages, accents, or expressive use cases                                                           | Add only through measured provider scorecards and customer demand                                                                               |
| 3        | **Persona / Stripe Identity / equivalent**   | Speaker identity and authorization verification          | Supports higher-risk cloning use cases and enterprise evidence                                                         | Required before third-party celebrity, executive, employee, healthcare, or financial voice programs                                             |

## Provider architecture

Create a single internal `VoiceProvider` capability contract. The contract should describe capabilities rather than mirror any vendor API.

```ts
type VoiceProviderCapabilities = {
  instantClone: boolean;
  professionalClone: boolean;
  streamingTts: boolean;
  telephonyFormats: boolean;
  pronunciationDictionaries: boolean;
  watermarking: boolean;
  deleteVoice: boolean;
  dataResidency: string[];
  zeroRetentionOption: boolean;
};
```

Every provider adapter must implement:

- Create, list, preview, synthesize, and delete operations.
- Stable normalized errors.
- Explicit timeouts and cancellation.
- Request idempotency where supported.
- Cost and latency telemetry.
- Consent-policy compatibility.
- Data retention and residency metadata.
- Health checks and circuit-breaker state.
- A portability record linking Wireline voice identity to provider voice IDs.

### Upload transport constraint

The current synchronous cloning path is intentionally limited to compressed
samples under 3 MiB — enough for a clean 30–90 second MP3 or M4A sample —
which keeps the feature deployable on the present Vercel architecture.
Larger or lossless samples must not be enabled by raising Express's JSON
limit; Vercel rejects the request before Express receives it. The scalable
path is a short-lived, tenant-scoped client upload to dedicated object
storage, followed by a small authenticated clone request referencing the
object; a worker fetches, validates, hashes, isolates, clones, and deletes
the temporary object under a retention SLA. (Folded in from the retired
`VOICE_CLONING_EXPANSION.md`.)

### Routing policy

Route by declared policy, not hard-coded vendor names:

- `quality_first`
- `latency_first`
- `cost_guarded`
- `regulated_region`
- `brand_voice_required`
- `fallback_only`

A failed private voice may fall back to a clearly generic managed voice so the
call can continue, but Wireline must never present that fallback as the cloned
speaker or silently substitute another person's identity. An identity-preserving
fallback requires a separately authorized equivalent voice.

## Verified Voice Passport

The durable voice object should evolve beyond `voiceId`, `userId`, and `name`.

Minimum future record:

- Wireline voice UUID independent of provider.
- Provider and provider voice ID mappings.
- Speaker identity state: self-attested, verified, enterprise-admin verified.
- Consent statement/version and timestamp.
- Permitted account, channels, campaigns, geographies, and purposes.
- Source-audio fingerprint and collection method.
- Retention policy and provider data-processing terms snapshot.
- Expiration and renewal requirement.
- Revoked, suspended, deletion-pending, and deleted states.
- Disclosure policy.
- Watermark/provenance policy.
- Every synthesis and campaign use linked to the passport.

The passport—not the cloned model—is the differentiating customer asset.

## Outcome moat

Wireline should optimize for **completed business outcomes**, not minutes or calls.

Primary product metrics:

- First useful production call and time-to-activation.
- Caller goal completion rate.
- Appointment/booking conversion.
- Qualified-lead rate.
- Revenue or pipeline influenced.
- Follow-up completion across SMS/email.
- Correct CRM/job-record mutation rate.
- Human transfer attempt and success rate.
- Containment rate with quality threshold.
- CSAT and complaint/opt-out rate.
- P50/P95 time to first audio and interruption recovery.
- Tool-call failure rate.
- Provider fallback rate and recovery time.
- Gross margin per completed outcome.
- Consent coverage and revocation SLA.

### Product surfaces to prioritize

1. **Outcome dashboard:** “Booked 14 jobs, recovered 8 missed calls, created $18,400 estimated pipeline.”
2. **Conversation timeline:** voice → SMS confirmation → email recap → CRM update in one thread.
3. **Rules and approvals:** visible autonomy level, action policy, escalation conditions, prohibited claims, and approval queue.
4. **Voice passport:** authorization status, use scope, provider mappings, expiry, disclosure, and deletion.
5. **Reliability console:** provider health, fallback reason, latency, tool failures, and carrier events.
6. **Vertical setup:** operating hours, service area, pricing guardrails, scheduling rules, emergency conditions, and terminology.
7. **Test lab:** scripted and adversarial calls scored before deployment.

## Ninety-day execution plan

### Days 0–30: Trust and portability foundation

- Merge the security foundation only after typecheck, tests, and deployment checks pass.
- Introduce provider-neutral voice identity and capability interfaces.
- Remove hard-coded vendor default voice assumptions from deployment logic.
- Add request timeouts, normalized provider errors, health telemetry, and circuit breakers.
- Add voice passport schema and migration.
- Add mandatory AI disclosure policy with configurable lawful exceptions reviewed by counsel.
- Add deletion-pending state and retry job instead of dropping local ownership when provider deletion fails.
- Publish voice privacy, consent, retention, and acceptable-use policies.
- Obtain counsel review for biometric privacy, TCPA/telemarketing, call recording, state disclosure, and international transparency obligations.

### Days 31–60: Second source and outcome proof

- Implement Cartesia behind the provider contract.
- Benchmark ElevenLabs and Cartesia by voice fidelity, P95 first audio, interruption recovery, telephony quality, cost, failure rate, language, and deletion behavior.
- Run a LiveKit orchestration spike against the same Wireline tools and scripted call suite.
- Add provider selection/fallback policies to admin operations, not end-user complexity.
- Select Jobber or Housecall Pro and complete one end-to-end booking workflow.
- Ship the outcome dashboard and activation funnel instrumentation.

### Days 61–90: Trust differentiation and distribution

- Pilot Resemble watermark/provenance or detection on defined high-risk flows.
- Add identity verification for higher-risk third-party voice cloning.
- Create a “Verified by Wireline” enterprise packet: authorization evidence, deletion proof, disclosure policy, provider data map, and audit export.
- Add a second telephony carrier behind routing abstraction.
- Launch with 5–10 design partners in one vertical and publish quantified case studies.
- Start marketplace/distribution applications only after activation and retention evidence exists.

## Build-versus-buy boundary

### Wireline must own

- Tenant rules, memory, tools, workflow graph, and customer context.
- Voice passport, consent ledger, disclosure, revocation, and audit experience.
- Provider routing and portability.
- Evaluation harness and outcome scoring.
- Omnichannel timeline and human-control surfaces.
- Vertical templates and system-of-record actions.
- Billing, budgets, margin controls, and customer-facing reliability.

### Vendors can supply

- Speech recognition and synthesis models.
- Voice cloning primitives.
- Realtime media transport.
- Carrier connectivity.
- Deepfake detection and identity verification.
- CRM/field-service systems of record.

Never let a vendor become the sole source of Wireline’s customer memory, rules, action history, or voice authorization record.

## Partnership outreach package

For each priority vendor, prepare:

- One-page Wireline overview and vertical wedge.
- Current architecture and monthly usage range.
- Exact integration request: API access, startup credits, partner tier, co-selling, marketplace, SLA, data residency, or deletion guarantees.
- Joint value proposition and named launch customer profile.
- Benchmark plan and success criteria.
- Security/data-processing questionnaire.
- Commercial ask: committed-use discount, referral margin, or design-partner support.

The strongest message is not “we need your voice API.” It is:

> Wireline is building the verified operating layer that turns your realtime voice capability into measurable work across phone, text, email, and business systems. We can bring a repeatable vertical workflow, consent provenance, evaluation data, and distribution.

## Required legal and trust review

This document is product strategy, not legal advice. Before broad launch, qualified counsel should review:

- Biometric/voiceprint consent and retention requirements.
- Telephone Consumer Protection Act and state telemarketing rules.
- Do-not-call, quiet-hour, caller-ID, and prerecorded/artificial voice requirements.
- Two-party call-recording consent jurisdictions.
- AI identity and synthetic-media disclosure requirements.
- Children/minors and protected-person voice cloning.
- Employment and contractor voice rights.
- Cross-border data transfer, data residency, and deletion obligations.
- Vendor terms governing cloning, commercial use, and prohibited content.

## Source references

- ElevenLabs TTS and voice options: https://elevenlabs.io/docs/overview/capabilities/text-to-speech
- Cartesia clone voice API: https://docs.cartesia.ai/api-reference/voices/clone
- LiveKit Agents framework: https://docs.livekit.io/agents/
- Deepgram Voice Agent: https://developers.deepgram.com/docs/voice-agent
- Microsoft Personal Voice: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/personal-voice-overview
- Resemble Detect: https://www.resemble.ai/products/detect
- Pindrop Pulse: https://www.pindrop.com/product/pindrop-pulse/
- EU Artificial Intelligence Act: https://eur-lex.europa.eu/eli/reg/2024/1689/oj
- Illinois Biometric Information Privacy Act: https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=3004&ChapterID=57
- FCC artificial/generated voice TCPA ruling: https://www.fcc.gov/document/fcc-makes-ai-generated-voices-robocalls-illegal
