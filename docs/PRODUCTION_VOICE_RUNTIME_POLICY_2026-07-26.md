# Production Voice Runtime Policy — 2026-08-01

Status: **Active launch policy**

## Runtime boundary

| Surface              | Production path                                                                                        | Policy                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Phone calls          | Twilio carrier → Vapi orchestration → Deepgram STT → xAI Grok 4.3 call model → xAI or ElevenLabs TTS | xAI voices use Vapi `voice.provider: "xai"`. ElevenLabs uses `eleven_flash_v2_5` through Vapi. Every ElevenLabs and xAI voice has a curated Vapi fallback. Grok 4.6 is structured-only. |
| Browser/mobile voice | Vapi web using the same xAI Grok 4.3 + xAI voices as PSTN | OpenAI Realtime is automatic backup only. No separate test brain. |
| Video presenter      | LiveAvatar/HeyGen catalog                                                                              | Presenter identity does not silently become the phone voice.                                          |
| Marketing audio      | Approved generation tools                                                                              | Rendered assets are not a live-call runtime.                                                          |

## Available phone voices

- Included Wireline Phone voices use Vapi's xAI roster (Eve, Ara, Rex, Sal, Leo) with a curated Vapi fallback.
- Wireline Studio exposes only three curated ElevenLabs voices plus private clones owned by the authenticated founder account.
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
- Do not clone minors, political candidates or officials, celebrities, public figures, or other high-risk voices.
- Do not use synthetic voices for impersonation, deception, fraud, harassment, voter influence, unauthorized transactions, or harm.
- Never expose the founder provider key, private provider inventory, provider errors, or internal tenant identifiers to the client.
- Noise cleanup is opt-in only for noisy samples; it is not applied blindly to clean audio.

## Launch acceptance

Before general availability, prove all of the following on the exact release commit:

1. ElevenLabs production key and curated inventory pass the read-only readiness probe.
2. The same ElevenLabs key is configured in Vapi Integrations.
3. One inbound and one outbound call use a curated Studio voice with acceptable first-audio latency, interruption, voicemail, tool use, and transfer.
4. A controlled provider-failure test switches to the Vapi fallback without ending the call.
5. A founder-owned sample completes create → proof → approve → assign → call → revoke → provider-delete.
6. Database RLS, grants, approval constraints, revocation trigger, and tenant ownership are verified after migration.
7. Terms, Privacy Policy, consent UI, audit records, usage limits, provider training controls, and deletion behavior receive final review.

Do not market custom cloning as generally available while the control remains founder-only. The accurate product promise is:

> Polished live voices with managed fallback. Authorized private voices are reviewed before they can answer a call.
