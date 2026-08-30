# OpenAI Realtime Voice — Browser and Twilio PSTN

**Status:** Canonical production voice policy  
**Updated:** August 30, 2026

BotBound uses one live-conversation runtime: OpenAI Realtime on
`gpt-realtime-2.1`. This applies to customer Bots, the founder showcase fleet,
Studio tests, ChatGPT private simulation, guest demos, inbound phone calls, and
outbound phone calls. Twilio owns carrier transport, phone numbers, PSTN/SIP,
and SMS. No alternate voice provider or automatic model fallback is permitted.

## Transport map

| Surface | Transport | Runtime |
| --- | --- | --- |
| Studio / ChatGPT / guest demo | Browser WebRTC offer sent to a same-origin BotBound route | OpenAI Realtime |
| Inbound phone | Twilio signed webhook → BotBound TwiML → OpenAI project SIP URI | OpenAI Realtime |
| Outbound phone | Twilio customer leg + AMD → attempt-bound BotBound TwiML → OpenAI project SIP URI | OpenAI Realtime |
| SMS | Twilio signed webhook and Messaging Service/number | BotBound messaging runtime |

The OpenAI project SIP URI is:

```text
sip:<OPENAI_PROJECT_ID>@sip.api.openai.com;transport=tls
```

OpenAI sends signed `realtime.call.incoming` events to:

```text
https://botbound.me/api/webhooks/openai/realtime
```

BotBound accepts the call with the tenant-scoped Bot configuration and then
opens the server-side sideband WebSocket using the OpenAI call id. Tool calls,
knowledge lookup, transfer, hangup, compliance state, and post-call persistence
remain on the server.

## Required production configuration

- `OPENAI_API_KEY`: scoped to the BotBound OpenAI API project.
- `OPENAI_PROJECT_ID`: the `proj_...` project used in the SIP URI.
- `OPENAI_WEBHOOK_SECRET`: signing secret for the Realtime webhook endpoint.
- `OPENAI_REALTIME_MODEL=gpt-realtime-2.1`.
- `OPENAI_REALTIME_TRANSCRIBER=gpt-4o-mini-transcribe`.
- `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` for signed callback validation.
- A scoped Twilio API key/secret for REST operations when configured.
- `TWILIO_WEBHOOK_BASE_URL=https://botbound.me` when canonical signature
  reconstruction cannot rely on the incoming host.

Every Twilio voice-capable number must use
`https://botbound.me/api/twilio-webhook/openai-inbound` as its voice URL and
the fail-closed `/api/twilio-webhook/openai-inbound-fallback` fallback URL.
Every direct SMS sender must use `/api/twilio-webhook/sms` with the reviewed
Twilio retry fragment.

## Voice roster and studio boundary

Phone and browser sessions use only OpenAI's documented Realtime voices:
`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`,
and `cedar`. BotBound defaults to `marin`; `cedar` is the second recommended
quality choice.

ElevenLabs is a separate, server-only studio preview and authorized cloning
surface. An ElevenLabs voice can never be persisted as a live phone provider.
Presenter/video selections retain an explicit OpenAI phone fallback.

## Security and reliability invariants

- Verify Twilio signatures before returning TwiML.
- Verify OpenAI Standard Webhooks signatures before accepting, rejecting, or
  controlling a call.
- Bind outbound bridge and status callbacks to a one-use, attempt-scoped token.
- Fail closed when the called number has no active tenant/Bot assignment.
- Enforce production/test/demo account-environment policy before live spend.
- Keep API keys, ephemeral secrets, and provider call-control URLs out of
  browser responses and logs.
- Reserve expected Realtime spend before session admission and settle measured
  usage afterward.
- Do not silently move a failed OpenAI call to another provider. Return an
  observable failure and preserve the retry/reconciliation evidence.

## Release proof

Before changing Twilio production webhooks, require a READY exact-head preview,
green release contracts, a writable/healthy production database, the OpenAI
webhook configured, and the OpenAI data-normalization migration ready. Cut over
one low-risk number first, prove inbound and approved outbound calls plus SMS,
then migrate the remaining inventory. Delete retired provider assets only after
the Twilio/OpenAI path is proven and rollback evidence is captured.

Official implementation references:

- <https://developers.openai.com/api/docs/guides/realtime-sip>
- <https://developers.openai.com/api/docs/guides/realtime-server-controls>
- <https://developers.openai.com/api/docs/guides/realtime-conversations>
- <https://developers.openai.com/api/docs/models/gpt-realtime-2.1>
