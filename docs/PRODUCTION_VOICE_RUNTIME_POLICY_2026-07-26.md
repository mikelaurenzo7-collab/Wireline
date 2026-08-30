# Production Voice Runtime Policy — 2026-08-30

Status: **Active launch policy**

The detailed implementation contract is
[`OPENAI_REALTIME_VOICE.md`](./OPENAI_REALTIME_VOICE.md). This file preserves the
stable policy path used by release checklists.

## Runtime boundary

| Surface | Production path | Policy |
| --- | --- | --- |
| Phone calls | Twilio carrier/PSTN → BotBound signed TwiML → OpenAI project SIP | OpenAI Realtime `gpt-realtime-2.1`; no alternate runtime or provider fallback |
| Browser/mobile voice | Same-origin BotBound SDP exchange → OpenAI Realtime WebRTC | Studio, ChatGPT, and guest demos share the managed phone policy |
| SMS | Twilio signed webhooks and Messaging Service/number | Twilio owns sender and carrier delivery only |
| Presenter/video | Retired live-video compatibility surface | Presenter identity never becomes the phone voice; phone fallback is OpenAI |
| Studio speech | Server-only ElevenLabs preview/cloning | Never a live phone provider |

## Available phone voices

Only OpenAI's documented Realtime voices may reach a phone or browser session:
`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`,
and `cedar`. `marin` is the default. Invalid, historical, or studio-only voice
ids normalize at both the application and database boundaries.

## Clone contract

1. The requester attests that they are the speaker or hold documented authorization and commercial-use rights.
2. The server validates base64, decoded size, MIME, file signature, and client-measured 10–90 second duration.
3. Before provider spend, BotBound reserves the sample fingerprint and records consent; concurrent duplicate requests cannot create twice.
4. Source audio is processed in memory and not retained. Only ownership, fingerprint, authorization, review, and audit evidence remain.
5. Provider creation is compensated with deletion if ownership finalization fails; unresolved deletion stays visible for an authorized retry.
6. New clones remain pending review until an authorized founder proof and approval.
7. Clone approval permits studio generation only. It does not change a Bot's live phone provider.
8. Revocation clears historical assignments and requests provider deletion without altering the OpenAI phone runtime.

## Launch acceptance

Before general availability, prove all of the following on the exact release commit:

1. The OpenAI key, project id, signed Realtime webhook, certified model, and transcriber pass the read-only readiness probe.
2. Every Twilio voice number points to the OpenAI inbound webhook and fail-closed fallback.
3. One inbound and one approved outbound call prove disclosure, interruption, voicemail policy, tool use, DNC, transfer, and hangup.
4. Inbound overflow and insolvency degrade safely instead of running an unmetered full Bot.
5. ElevenLabs preview and cloning pass separately; no studio voice is written as a phone runtime.
6. Database RLS, grants, OpenAI normalization trigger, and tenant ownership are verified after migration.
7. Terms, Privacy, consent UI, audit records, usage limits, provider training controls, and deletion behavior receive final review.

The accurate product promise is:

> Every BotBound phone and browser conversation runs on one managed OpenAI Realtime runtime, with Twilio for carrier transport, numbers, and SMS.
