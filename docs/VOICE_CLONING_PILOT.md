# Voice cloning: private preview pilot

## Product decision

Keep all ten managed OpenAI voices as the default for browser rehearsals and
phone calls. OpenAI continues to perform conversation reasoning and business
actions. Voice references are an independent, opt-in speech capability; creating,
reviewing, previewing or deleting one must never change a Bot's selected call
voice.

This implementation is a **private platform-admin pilot**, disabled by default.
It is not a customer voice-cloning launch or a second live-call runtime.

The native enrollment experience records or uploads a 6-20 second mono PCM16 WAV,
plays it locally, requires explicit self-speaker permission, and saves an
encrypted reference. Review is a separate owner attestation tied to the exact
recording fingerprint and version. It is not identity verification or a measured
similarity certification. Only approved references can generate private previews.
The speech model is licensed open source, self-hosted separately; BotBound did not
train its foundation weights.

## Boundaries and controls

- UI: `SimpleVoicePicker` retains the built-in choices; `VoiceClonePanel` is keyed
  by owner and Bot. A closed capability hides the pilot. Microphone and paid
  inference begin only after explicit actions.
- Registry: `wireline_voice_assets`, append-only migration
  `0179_inhouse_voice_assets.sql`; no provider voice ID or live-call assignment.
- Vault: AES-256-GCM with tenant/asset/MIME-bound authenticated data using
  `WIRELINE_DATA_KEY`. Source audio is not returned in the list or account export.
- Permission: current self-speaker consent version is separate from general
  account terms. A name, upload, or admin role is not proof of another speaker's
  authorization. Only the speaker's own recording is admitted in this pilot.
- Limits: five retained references per account; 2,000,000 decoded bytes each;
  strict PCM parser, canonical Base64, authenticated rate-limited routes.
- Lifecycle: pending review -> approved -> revoked/deleted. Source identity and
  consent are immutable; changing a recording requires a new reference. Every
  mutation advances the version. Delete clears active ciphertext and prevents
  future synthesis. A late in-flight result is discarded after a version change.
- Inference: fresh readiness validates pinned engine/model/source, watermark and
  limits before each attempt. The app requires the worker's actual hard deadline
  to be exactly 60 seconds; client timeout is 65 seconds. No automatic retries.
- Accounting: the private pilot reserves 75 seconds of compute at the configured
  positive rate against the managed allowance. Successful or uncertain work
  retains that conservative reservation; a definite precompute rejection releases
  it. This is not measured final compute settlement or a published retail price.
- Privacy: no request audio/text logging, public reference URLs, shared voice
  catalog, identification use, or training on references. Temporary reference
  files and in-memory conditioning are cleared after requests. Account erasure
  and secret-redacted export include the new registry.

## Local evidence, October 17, 2026

Real pinned Nano weights loaded on the founder workstation's CPU with four
threads. Built-in model conditioning was used; no human voice was enrolled.

| Measurement                                       | Result                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| Cold model load                                   | 43.15 seconds                                                        |
| 62-character reply                                | 45.85 seconds to produce 3.2 seconds of audio                        |
| 97-character reply                                | 29.97 seconds to produce 5.6 seconds of audio                        |
| Separate real HTTP reference-conditioning request | 28.13 seconds for 2.04 seconds of audio, using a synthetic reference |
| HTTP model-process peak working set               | 4.105 GiB on this workstation; not a certified minimum               |

Evidence: ignored local `output/audio/inhouse-voice-baseline/benchmark.json` and
generated WAVs. The separate authenticated worker check is recorded in
`output/audio/inhouse-voice-http/http-smoke.json`; it used a loop of model-generated
speech, not a human sample. These are three samples on one host, not latency
percentiles or a production capacity test. The original baseline script's final
Windows peak-memory field was unavailable; the HTTP benchmark fixed that
measurement and observed 4,407,480,320 bytes in the model subprocess.

**Decision: this measured CPU configuration is unsuitable for conversational
phone turns.** Do not move live calls onto it. Private previews can tolerate
longer waits. A faster self-hosted configuration requires separate measurement;
the vendor's performance claims are not BotBound evidence. Real speaker
similarity, pronunciation and quality remain untested without a consented sample.

## Commercial direction: optional Brand Voice

Retain standard OpenAI voices within existing offers. Prefer a separately priced
Brand Voice option over raising every customer's base price. Customers should see
the complete expected cost before enabling or testing it, with a spend limit and
their existing built-in voice available as a fallback.

The initial **price hypothesis** is $9/month per workspace for one active custom
voice, with bounded previews and separately metered custom speech. This is a
candidate to validate, **not an activated or advertised offer**. Avoid unlimited
generation, a paid add-on for an unavailable capability, or assuming self-hosting
has zero marginal/idle cost. Do not charge twice for the same speech component.
The retail usage rate and included quantity remain unset until full-call COGS
and the speech vendor's commercial rights are verified. Revisit the hypothesis
if verification/support or reserved hosting costs dominate.

ElevenLabs' published API page currently lists Speech Engine at $0.08 per minute
and $0.16 burst pricing, and low-latency TTS at $0.04 per 1,000 characters. Those
are different products and billing units. Speech Engine costs do not by themselves
represent BotBound's full call cost: telephony, OpenAI reasoning, tools, minimums,
failed attempts and support must also be accounted for. A creator subscription
does not by itself establish OEM rights. The October 17 automated support reply
did not interpret BotBound's customer-SaaS rights. The authorized human
clarification follow-up is in that same thread; a written applicability answer
is still required. Do not buy Creator on the assumption that it resolves OEM
permission.

The current source catalog's $0.128 blended voice reserve is for the existing
OpenAI call path. It is not a measured cloned-call rate. No Stripe products,
subscription prices, customer entitlements or Render billing variables are changed
by this pilot.

## Promotion checklist

### Independent ElevenLabs lane

The ElevenLabs transport also has bounded account/subscription readers and a
separate recording preparation contract. It does not use or relax the Nano
registry's pinned engine, two-megabyte limit or consent version. Preparation
accepts 10 to 120 seconds of mono PCM16 WAV, up to 6,000,000 bytes, validates the
selected recording fingerprint and strips arbitrary RIFF metadata from the
upload copy. Signal diagnostics flag amplitude problems; they do not identify
the speaker, verify speech or certify voice similarity. Longer recordings will
need a bounded multipart route rather than increasing the global JSON limit.

The operator-only `GET /api/voice/elevenlabs/status` checks configuration without
provider I/O while `BOTBOUND_ELEVENLABS_VOICE_ENABLED` is absent or false. An
explicitly enabled check can read a bounded account snapshot. The separate
operator action `POST /api/voice/elevenlabs/verify` performs those read-only checks
without changing that flag and records a redacted audit receipt. It is not a
customer voice feature. Both routes require authenticated platform-admin access
and share a fail-closed three-checks-per-minute rate limit.

#### Operator verification, before any enrollment

1. Keep the integration and private-preview flags disabled. Use the existing
   dedicated staged `BOTBOUND_ELEVENLABS_VOICE_API_KEY` in Render; do not copy it
   into local development, a browser body or a report. Read provider workspace
   identity in the authorized provider context and pin
   `BOTBOUND_ELEVENLABS_WORKSPACE_ID` deliberately. Never automatically adopt an
   unexpected workspace.
2. From the authenticated operator context on the intended exact release, send
   `POST /api/voice/elevenlabs/verify` with no credentials or override values in
   its body. The service uses only production configuration. An explicit check
   may read the staged key while the feature remains disabled; passive GET status
   retains its no-provider-I/O off-switch behavior.
3. Require `accountCheck=succeeded` and `workspaceBinding=matched`. Only after an
   exact workspace match does the service issue one bounded `/v2/voices` GET.
   Require `voicesReadCheck=succeeded`; no voice IDs, names or pagination tokens
   are returned or retained. A successful list proves read permission, not
   ownership, consent, clone/delete permission or speech-generation access.
4. Record the returned receipt ID, checked time and exact source commit. The
   existing tenant-scoped audit log stores only allowlisted diagnostic statuses,
   plan/capability labels and remaining workspace capacity. Missing receipt
   storage returns an actionable error; do not claim a completed verification.
   A null source commit is unknown/local provenance, not production-release proof.
   Missing or mismatched configuration stays an explicit blocker.
5. Review workspace credits, voice slots and optional add/edit headroom as
   workspace counters, not the restricted key's own remaining allowance. Unknown
   limits stay unknown. Optional overages are not prepaid headroom. Verify the
   key's credit cap/scopes separately in the provider console; do not expand
   permissions or buy credits merely to make diagnostics green.

The diagnostic always leaves mutation-scope, USD-funding, customer-SaaS-rights,
enrollment and live-call readiness unverified/false. It never uploads recordings,
creates or deletes provider assets, renders speech, changes a selected OpenAI
voice, or applies migration 0179. A new failed check does not revoke or rewrite
an earlier receipt; retain dated evidence and recheck after configuration changes.
Never adopt a provider voice by its display name.

On October 17, the founder's Starter dashboard showed 30,000 credits with none
used. The approved restricted pilot key has a 5,000-credit refresh-period cap and
was staged on Render's API service with the integration disabled. No automatic
top-up, additional subscription or Render compute upgrade was configured.

Before adding ElevenLabs enrollment, implement a separate durable tenant asset
and operation ledger, explicit provider-destination permission, retention and
provider deletion receipts. Record an operation before sending paid or mutating
work; preserve unknown outcomes for reconciliation instead of blindly retrying.
The current native panel is the independent in-house preview pilot, not an
ElevenLabs upload or a cloned-call setting.

### Release and enrollment gates

1. Keep `VOICE_CLONE_PILOT_ENABLED=false` while prerequisites are unresolved.
2. Run the exact-source release suite and independent application/schema review.
   Follow `DATABASE_OPERATIONS.md`; run `npm run db:health` in the authorized
   configured environment. A missing local database URL is not a production
   database failure. Confirm the live ledger and apply only the reviewed migration
   through the controlled promotion path. Do not use `db:push`.
3. Before collecting any real pilot/customer reference, finalize the public
   voice-data retention schedule, backup erasure and automated expiry behavior,
   and obtain an appropriately scoped written speaker release. Have the Illinois
   voiceprint/BIPA applicability reviewed; a generic checkbox or self-attestation
   is not a certification that this requirement is satisfied. An employee's or
   other person's voice requires a separate future authorization workflow.
4. Test a deliberately supplied, consented recording: speaker similarity, text
   fidelity, names/numbers, silence/noise rejection, reference isolation, retries,
   cancellation, deletion and browser cleanup. Do not repurpose call recordings.
5. Choose a private preview host only after pricing CPU/RAM/idle cost and measuring
   it. A dedicated paid resource requires a founder spending decision. Configure
   `VOICE_ENGINE_URL`, `VOICE_ENGINE_SERVICE_TOKEN` and positive
   `VOICE_ENGINE_COMPUTE_USD_PER_MINUTE` in Render's secret store. Do not copy
   production credentials to local development.
6. For cloned **live calls**, independently build and validate streaming,
   interruption, turn detection, STT, stable voice identity, pronunciation,
   fallback, recording/AI disclosures, tenant provider receipts, revocation and
   final usage settlement. The complete-WAV preview endpoint is not that runtime.
7. Compare a measured faster self-hosted speech service with ElevenLabs Speech
   Engine using the same OpenAI business logic. OpenAI's recording-based custom
   voices require organization eligibility, which is not confirmed for BotBound.
8. Only after that release is proven, reconcile a single reviewed add-on contract
   across catalog, Stripe products/prices/webhooks/portal, entitlement admission,
   UI, invoices, allowance reservations and Render IDs. Existing subscriptions
   require an explicit migration decision. Do not publish a purchase button early.

## Primary references

- [Pinned Chatterbox source](https://github.com/resemble-ai/chatterbox/tree/5de7a54aa4e5e2baadb0182dde554908b48b85c2)
- [Nano model card](https://huggingface.co/ResembleAI/chatterbox-nano)
- [OpenAI Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [OpenAI custom voices](https://developers.openai.com/api/docs/guides/custom-voices)
- [ElevenLabs API pricing](https://elevenlabs.io/pricing/api)
- [ElevenLabs account/workspace response](https://elevenlabs.io/docs/api-reference/user/get)
- [ElevenLabs bounded voice search](https://elevenlabs.io/docs/api-reference/voices/search)
- [ElevenLabs API security](https://elevenlabs.io/docs/eleven-api/guides/how-to/best-practices/security)
- [ElevenLabs Customer Applications terms](https://elevenlabs.io/elevenapi-terms)
- [ElevenLabs OEM terms](https://elevenlabs.io/oem-terms)
- [Illinois BIPA definitions](https://my.ilga.gov/legislation/ilcs/fulltext?DocName=074000140K10)
- [Illinois BIPA retention and release requirements](https://www.ilga.gov/legislation/ilcs/fulltext?DocName=074000140K15)
