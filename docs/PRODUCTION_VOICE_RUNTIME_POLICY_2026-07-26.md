# Production Voice Runtime Policy — 2026-08-30

Status: **Active launch policy**

The detailed implementation contract is
[`OPENAI_REALTIME_VOICE.md`](./OPENAI_REALTIME_VOICE.md). This file preserves the
stable policy path used by release checklists.

## Runtime boundary

| Surface              | Production path                                                          | Policy                                                                                                             |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Phone calls          | Twilio carrier/PSTN through signed BotBound routing to the admitted voice provider | OpenAI Realtime by default; registered numbers use xAI only with explicit configuration. The admitted call keeps its provider. |
| Browser/mobile voice | Authenticated same-origin BotBound SDP exchange → OpenAI Realtime WebRTC | Private Studio rehearsals and authenticated ChatGPT simulation only; public and guest audio/call demos are retired |
| SMS                  | Twilio signed webhooks and Messaging Service/number                      | Twilio owns sender and carrier delivery only                                                                       |
| Presenter/video      | Retired live-video compatibility surface                                 | Presenter identity never becomes the phone voice; phone fallback is OpenAI                                         |
| Studio speech        | OpenAI Realtime WebRTC                                                   | Same saved 10-voice catalog as phone calls                                                                         |

## Available phone voices

Customers select the built-in OpenAI Realtime voice roster:
`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`,
and `cedar`. `marin` is the default. The selected voice stays fixed during an
active session and may change between sessions. Invalid or historical voice ids
normalize at the application and database boundaries. Browser rehearsals use that OpenAI voice; registered opt-in xAI phone calls map the saved choice to the configured phone voice. `realtime-sip-target.ts` owns admission and `realtime-provider.ts` binds subsequent control to the call id. A new-call flag cannot switch an active call's provider.

## Built-in live voice and private-preview boundary

BotBound has no customer-selectable external voice catalog or live-call cloning
path. The disabled platform-admin private-preview foundation and ElevenLabs
read-only operator diagnostics are documented in
[`VOICE_CLONING_PILOT.md`](./VOICE_CLONING_PILOT.md); neither changes a saved
OpenAI voice or authorizes customer enrollment. Historical voice-provider rows
are removed by the release migration after a fail-closed empty-table assertion.
Customer custom voices remain a separate product decision requiring confirmed
provider rights/capability, explicit consent policy, privacy review, funded
usage, measured live quality and a new release review.

## Launch acceptance

Before general availability, prove all of the following on the exact release commit:

1. The OpenAI key, project id, signed Realtime webhook, certified model, and transcriber pass the read-only readiness probe.
2. Every offered Twilio voice number has signed routing to its intended configured provider and a verified fail-closed admission path. Unregistered numbers retain the default OpenAI path.
3. One inbound and one approved outbound call prove disclosure, interruption, voicemail policy, tool use, DNC, transfer, and hangup.
4. Inbound overflow and insolvency degrade safely instead of running an unmetered full Bot.
5. Live voice selection exposes the built-in roster and accurate configured phone mapping. The disabled-by-default platform-admin reference upload/recording and private-preview pilot remains separate; it cannot assign a reference to live calls.
6. Database RLS, grants, OpenAI normalization trigger, and tenant ownership are verified after migration.
7. Terms, Privacy, consent UI, audit records, usage limits, provider training controls, and deletion behavior receive final review.

The accurate product promise is:

> BotBound offers 10 built-in voice choices and keeps a consistent voice during each active session. Private browser rehearsal uses OpenAI Realtime. Phone admission defaults to OpenAI and may use registered opt-in xAI routing; each admitted call stays with its provider. Twilio provides carrier transport, numbers, and SMS. Private custom-voice previews are a separately gated operator pilot, not a live-call offer.
