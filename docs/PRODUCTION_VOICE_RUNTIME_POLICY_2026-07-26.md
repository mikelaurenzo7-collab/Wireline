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
| Studio speech | OpenAI Realtime WebRTC | Same saved 10-voice catalog as phone calls |

## Available phone voices

Only OpenAI's documented Realtime voices may reach a phone or browser session:
`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`,
and `cedar`. `marin` is the default. The selected voice stays fixed during an
active session and may change between sessions. Invalid or historical voice ids
normalize at the application and database boundaries.

## OpenAI-only speech boundary

BotBound has no external voice catalog, cloning provider, or customer
voice-upload path. Historical voice-provider rows are removed by the release
migration after a fail-closed empty-table assertion. Reintroducing custom voices
would be a separate product decision requiring an approved provider capability,
explicit consent policy, privacy review, and a new release review.

## Launch acceptance

Before general availability, prove all of the following on the exact release commit:

1. The OpenAI key, project id, signed Realtime webhook, certified model, and transcriber pass the read-only readiness probe.
2. Every Twilio voice number points to the OpenAI inbound webhook and fail-closed fallback.
3. One inbound and one approved outbound call prove disclosure, interruption, voicemail policy, tool use, DNC, transfer, and hangup.
4. Inbound overflow and insolvency degrade safely instead of running an unmetered full Bot.
5. Studio and Quick Deploy expose exactly the 10 built-in OpenAI voices; no external provider record, upload route, or cloning surface remains selectable.
6. Database RLS, grants, OpenAI normalization trigger, and tenant ownership are verified after migration.
7. Terms, Privacy, consent UI, audit records, usage limits, provider training controls, and deletion behavior receive final review.

The accurate product promise is:

> Every BotBound phone and browser conversation runs on OpenAI Realtime, with 10 selectable built-in voices and one consistent saved voice per active session. Twilio provides carrier transport, numbers, and SMS.
