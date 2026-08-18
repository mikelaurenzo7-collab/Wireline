# Production Voice Runtime Policy - 2026-08-17

Status: **Active launch policy**

## Runtime boundary

| Surface | Production path | Policy |
| --- | --- | --- |
| Phone calls | Twilio carrier -> xAI Direct SIP Voice Agent API | xAI currently routes registered SIP sessions through Think Fast 2.0. The SIP `call_id` join is provider-bound and is not version-pinned by Wireline. Native xAI voices are the phone roster. Grok 4.6 is structured-only. Vapi is rollback-only. |
| Browser/mobile voice | Direct xAI Speech-to-Speech pinned to `grok-voice-think-fast-2.0` | Server-minted ephemeral client secrets. Same Wireline instructions, tools, voice mapping, and safety policy as PSTN. ChatGPT widget stays OpenAI Realtime and is not a Studio backup. |
| Studio generated audio | Curated ElevenLabs TTS plus authorized private voices | Generated audio is separate from live PSTN. Private voice creation and review remain founder/admin controlled. |
| Video presenter | Retired | Identity badges stay. Checkout and provider session minting remain closed. No video-file or substitute clip-script product is offered. |
| Marketing audio | Approved generation tools | Rendered assets are not a live-call runtime. |

## Available phone voices

- Live PSTN uses the native xAI Voice Agent roster configured in `src/lib/voice/grok-voice-config.ts` and `src/lib/voice-catalog.ts`.
- Studio browser conversations use the same xAI voice mapping on the version-pinned direct WebSocket path.
- Curated ElevenLabs voices and approved private voices may generate Studio audio, but they do not silently replace the native PSTN voice.
- Vapi voices remain available only for explicitly quarantined rollback paths.
- If native provider access, line ownership, encrypted registration evidence, or activation cannot be proven, phone activation fails closed. It does not silently move a tenant call to another provider.

## Authorized private-voice contract

1. The requester attests that they are the speaker or hold documented authorization and commercial-use rights.
2. The server validates base64, decoded size, declared MIME, file signature, and client-measured duration.
3. Before provider spend, Wireline atomically reserves the sample fingerprint and records consent; concurrent duplicate requests cannot create twice.
4. Wireline processes the upload in memory, stores no source file, and retains only the fingerprint, authorization, ownership, review, and audit evidence.
5. Provider creation is compensated with provider deletion if ownership finalization fails; a failed compensation remains `deletion_pending` for an authorized retry.
6. New private voices remain `pending_review`; the founder/admin must play a complete proof and approve them.
7. Provider verification, when required, blocks approval.
8. Revocation immediately removes assignments and requests provider deletion. Failed provider deletion remains visible as `deletion_pending` for an authorized retry.
9. Approval authorizes generated Studio audio only unless a separate native-phone compatibility review explicitly certifies that voice for the current PSTN runtime.

## Call and legal guardrails

- AI and private voices are artificial voices. Calling consent, tenant DNC, federal DNC, calling-hours, recording, identification, and disclosure rules still apply.
- Marketing and campaign outbound remain blocked until federal Do Not Call registration is complete and the screening provider is configured.
- Outbound native SIP speaks identity, a grouped callback number, and, for marketing, the voice-activated opt-out. Twilio AMD drops marketing answering machines, fax, and unclassified answers without a message. Service voicemail is identity and callback only. Busy and no-answer campaign dials use the configured attempt budget. A spoken stop-calling request hangs up the native SIP session immediately.
- After-hours inbound PSTN degrades to take-a-message instead of running the full agent.
- Do not clone minors, political candidates or officials, celebrities, public figures, or other high-risk voices.
- Do not use synthetic voices for impersonation, deception, fraud, harassment, voter influence, unauthorized transactions, or harm.
- Never expose provider credentials, private provider inventory, provider errors, or internal tenant identifiers to the client.
- Noise cleanup is opt-in only for noisy samples; it is not applied blindly to clean audio.

## Native SIP registration and ownership

- Twilio owns the carrier number and Elastic SIP trunk association.
- xAI BYO-trunk registration returns a phone registration ID, webhook ID, and one-time signing secret. Wireline encrypts the signing secret before persistence.
- The database claim boundary locks the E.164 number and assigned phone row before proving tenant/agent ownership or transferring a retired registration.
- A non-idempotent xAI registration with an ambiguous outcome blocks automatic retry until provider state is reconciled.
- xAI currently documents phone registration but no deletion endpoint. Retired registration records remain in the provider ledger so the one-time verification secret is not lost while a provider registration may still exist.
- Releasing a native number detaches the Twilio trunk association before releasing the number and only then removes local ownership state.

## Launch acceptance

Before general availability, prove all of the following on the exact release commit:

1. Native xAI SIP (`XAI_API_KEY`, `XAI_SIP_ALLOWED_ADDRESSES`) and Twilio credentials pass the read-only readiness probe.
2. Pending native migrations `0152` and `0153` apply cleanly and their table, grants, RLS policy, indexes, and claim function match source.
3. One inbound and one outbound native SIP call prove disclosure, interruption, voicemail, tool use, DNC, transfer, settlement, and usage accounting.
4. A provider-bound PSTN call and a version-pinned Studio test are compared for the current Think Fast release. Any provider alias change requires recertification.
5. Inbound overflow and insolvency degrade to take-a-message instead of hanging up or running the full agent.
6. ElevenLabs production access and curated inventory pass the read-only readiness probe for Studio TTS and private-voice workflows.
7. A founder-owned sample completes create -> proof -> approve -> assign -> generate -> revoke -> provider-delete.
8. Database RLS, grants, approval constraints, revocation triggers, and tenant ownership are verified after migration.
9. Terms, Privacy Policy, consent UI, audit records, usage limits, provider training controls, and deletion behavior receive final review.
10. Federal DNC registration and the non-billable screening probe pass before marketing/campaign outbound is opened.

Do not market private cloning as generally available while the control remains founder/admin-only. The accurate product promise is:

> Polished live phone voices through Wireline's native xAI SIP runtime. Authorized private Studio voices are reviewed before they can generate audio.
