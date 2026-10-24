# Production Voice Runtime Policy — 2026-08-30

Status: **Active launch policy**

The detailed implementation contract is
[`OPENAI_REALTIME_VOICE.md`](./OPENAI_REALTIME_VOICE.md). This file preserves the
stable policy path used by release checklists.

## Runtime boundary

| Surface              | Production path                                                                    | Policy                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone calls          | Twilio carrier/PSTN through signed BotBound routing to the admitted voice provider | xAI voice by default for every number; lines register with xAI automatically and OpenAI Realtime is the fallback. The admitted call keeps its provider. |
| Browser/mobile voice | Authenticated same-origin BotBound SDP exchange → OpenAI Realtime WebRTC           | Private Studio rehearsals and authenticated ChatGPT simulation only; public and guest audio/call demos are retired                                      |
| SMS                  | Twilio signed webhooks and Messaging Service/number                                | Twilio owns sender and carrier delivery only                                                                                                            |
| Presenter/video      | Retired live-video compatibility surface                                           | Presenter identity never becomes the phone voice; phone fallback is OpenAI                                                                              |
| Studio speech        | OpenAI Realtime WebRTC                                                             | Same saved 10-voice catalog as phone calls                                                                                                              |

## Available phone voices

Customers select the built-in OpenAI Realtime voice roster:
`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`,
and `cedar`. `marin` is the default. The selected voice stays fixed during an
active session and may change between sessions. Invalid or historical voice ids
normalize at the application and database boundaries. Browser rehearsals use that OpenAI voice; xAI phone calls (the default) map the saved choice to the matching xAI phone voice, or speak the Bot's consented cloned voice when one is selected. `realtime-sip-target.ts` owns admission and `realtime-provider.ts` binds subsequent control to the call id. A new-call flag cannot switch an active call's provider.

## Cloned live voices

Customers may clone their own voice (or a speaker who authorized it) and use it
on live xAI phone calls. The flow requires an explicit consent record
(`live-voice-clone-consent-v1-2026-10-24`), passes a local quality check, and
creates the voice natively at the voice provider; BotBound stores only the
provider voice id, a SHA-256 of the reference, its duration and quality score,
never the reference audio. Each account may keep two cloned voices. Deleting a
voice, or the account, deletes it at the provider. If a cloned voice errors or
misses the reply budget twice in a row on a call, that call switches silently to
the Bot's stock voice and is logged; the call is never dropped. Calls that fall
back to OpenAI speak the stock voice.

The disabled platform-admin private-preview foundation and ElevenLabs
read-only operator diagnostics remain documented in
[`VOICE_CLONING_PILOT.md`](./VOICE_CLONING_PILOT.md); neither changes a saved
OpenAI voice or authorizes customer enrollment.

## Launch acceptance

Before general availability, prove all of the following on the exact release commit:

1. The OpenAI key, project id, signed Realtime webhook, certified model, and transcriber pass the read-only readiness probe.
2. Every offered Twilio voice number has signed routing to xAI voice (self-registering on first call) and a verified fail-closed admission path. A line that has not finished registering answers on the OpenAI fallback.
3. One inbound and one approved outbound call prove disclosure, interruption, voicemail policy, tool use, DNC, transfer, and hangup.
4. Inbound overflow and insolvency degrade safely instead of running an unmetered full Bot.
5. Live voice selection exposes the built-in roster, accurate phone mapping, and consented cloned voices with a one-tap switch back to stock. The disabled-by-default platform-admin private-preview pilot remains separate.
6. Database RLS, grants, OpenAI normalization trigger, and tenant ownership are verified after migration.
7. Terms, Privacy, consent UI, audit records, usage limits, provider training controls, and deletion behavior receive final review.

The accurate product promise is:

> BotBound offers 10 built-in voice choices and keeps a consistent voice during each active session. Private browser rehearsal uses OpenAI Realtime. Phone calls run on xAI voice by default with OpenAI Realtime as the fallback; each admitted call stays with its provider. Customers can clone a consented voice for live calls, with an automatic switch to the stock voice if it misbehaves. Twilio provides carrier transport, numbers, and SMS.
