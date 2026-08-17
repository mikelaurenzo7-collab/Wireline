# Production Voice Runtime Policy — 2026-08-01

Status: **Active launch policy**

## Runtime boundary

| Surface              | Production path                                                                                        | Policy                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Phone calls          | Twilio carrier → xAI Direct SIP Speech-to-Speech (`grok-voice-think-fast-2.0`) | Native Eve/Ara/Rex/Sal/Leo voices. Direct `/v1/tts` is not the PSTN engine. Grok 4.6 is structured-only. Vapi is rollback-only. |
| Browser/mobile voice | Native xAI Speech-to-Speech using the same model as PSTN | ChatGPT widget stays OpenAI Realtime. No separate test brain. |
| Video presenter      | LiveAvatar/HeyGen catalog                                                                              | Presenter identity does not silently become the phone voice.                                          |
| Marketing audio      | Approved generation tools                                                                              | Rendered assets are not a live-call runtime.                                                          |

## Available phone voices

- Included Wireline Phone voices use native xAI Speech-to-Speech (Eve, Ara, Rex, Sal, Leo).
- Wireline Studio exposes only three curated ElevenLabs voices (`eleven_flash_v2_5`) plus private clones owned by the authenticated founder account.
- Private voice creation, review, approval, and deletion are platform-admin only.
- A private voice cannot enter an agent configuration or call payload until Postgres records `approved` status.
- If provider access, ownership, approval, or voice identity cannot be proven, the runtime falls back to Savannah.

## Clone contract

1. The requester attests that they are the speaker or hold documented authorization and commercial-use rights.
2. The server validates base64, decoded size, declared MIME, file signature, and client-measured 10–90 second duration.
3. Before provider spend, Wireline atomically reserves the sample fingerprint and records consent; concurrent duplicate requests cannot create twice.
4. Wireline processes the upload in memory, stores no source file, and retains only the fingerprint, authorization, ownership, review, and audit evidence.
5. Provider creation is compensated with provider deletion if ownership finalization fails; a failed compensation remains `deletion_pending` for an authorized retry.
6. New clones remain `pending_review`; the founder must play a full Flash 2.5 proof and approve them.
7. Provider verification, when required, blocks approval.
8. Revocation immediately removes live assignments and requests provider deletion. Failed provider deletion remains visible as `deletion_pending` for an authorized retry.

## Call and legal guardrails

- AI and cloned voices are artificial voices. Calling consent, DNC, calling-hours, recording, identification, and disclosure rules still apply.
- Outbound native SIP speaks identity, a grouped callback number, and — for marketing — the voice-activated opt-out. Twilio AMD drops marketing answering machines without a message; service voicemail is identity and callback only.
- After-hours inbound PSTN degrades to take-a-message instead of running the full agent.
- Do not clone minors, political candidates or officials, celebrities, public figures, or other high-risk voices.
- Do not use synthetic voices for impersonation, deception, fraud, harassment, voter influence, unauthorized transactions, or harm.
- Never expose the founder provider key, private provider inventory, provider errors, or internal tenant identifiers to the client.
- Noise cleanup is opt-in only for noisy samples; it is not applied blindly to clean audio.

## Launch acceptance

Before general availability, prove all of the following on the exact release commit:

1. Native xAI SIP (`XAI_API_KEY`, `XAI_SIP_ALLOWED_ADDRESSES`) and Twilio credentials pass the read-only readiness probe.
2. One inbound and one outbound native SIP call prove disclosure, interruption, voicemail, tool use, DNC, and transfer.
3. Inbound overflow and insolvency degrade to take-a-message instead of hanging up or running the full agent.
4. ElevenLabs production key and curated inventory pass the read-only readiness probe for Studio TTS / cloning.
5. A founder-owned sample completes create → proof → approve → assign → call → revoke → provider-delete.
6. Database RLS, grants, approval constraints, revocation trigger, and tenant ownership are verified after migration.
7. Terms, Privacy Policy, consent UI, audit records, usage limits, provider training controls, and deletion behavior receive final review.

Do not market custom cloning as generally available while the control remains founder-only. The accurate product promise is:

> Polished live voices on native xAI Speech-to-Speech. Authorized private Studio voices are reviewed before they can be used for generated audio.
