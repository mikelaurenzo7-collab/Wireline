# Grok Live Voice — native Twilio + xAI Speech-to-Speech

Production PSTN and Studio live tests use Wireline-owned Twilio plus xAI Direct SIP Speech-to-Speech (`grok-voice-think-fast-2.0`). The unpinned `grok-voice-latest` alias is not the production pin. OpenAI Realtime remains ChatGPT-widget simulation. Vapi is rollback-only and is not on the launch path. This is not Grok 4.6.

## Three different xAI products

Do not collapse these into one "Grok voice" id.

| Surface | What xAI actually is | Model / id |
| --- | --- | --- |
| Structured reasoning | xAI Responses API (`https://api.x.ai/v1/responses`) | `grok-4.6` — text/image in, text out |
| Live PSTN and Studio browser tests | Native Speech-to-Speech over Twilio SIP / ephemeral WebSocket | `grok-voice-think-fast-2.0`. **`grok-4.6` is not a live-call model.** |
| Direct Speech-to-Speech alias | `wss://api.x.ai/v1/realtime?model=grok-voice-latest` | `grok-voice-latest` aliases `grok-voice-think-fast-2.0`. Wireline pins the versioned id. |

Official Speech-to-Speech page: https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech

## Active architecture

- Structured reasoning: direct xAI Responses API using Grok 4.6 by default, with OpenAI, Gemini, and the Vercel AI Gateway providing continuity. Direct xAI can be disabled via `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK=false`.
- Browser and mobile live tests: native xAI Speech-to-Speech using the same `grok-voice-think-fast-2.0` brain as live phone calls. Users do not pick a separate test brain.
- Public/guest voice previews: native xAI browser demo with one-use tickets. Public PSTN demo numbers may still land on the rollback Vapi webhook until those lines are re-registered on xAI SIP.
- ChatGPT private voice simulation: OpenAI Realtime WebRTC via ephemeral client secrets (`OPENAI_API_KEY_CHATKIT` when set). This is an OpenAI-hosted widget surface, not the tenant phone test.
- Production PSTN: Twilio carrier + xAI Direct SIP. Inbound webhooks at `/api/webhooks/xai/voice`. Outbound: Twilio customer leg, then signed `<Sip>` bridge to the tenant's registered xAI number. Grok 4.6 is the xAI Responses API text model for structured work; it is not a Vapi live-call model id.
- Custom phone voices: Vapi-supported streaming voice-library workflow only after consent, rights, latency, fallback, and telephony verification, and only on the rollback path. Native SIP uses the xAI Eve/Ara/Rex/Sal/Leo roster. Live Video presenter PCM still uses the OpenAI Realtime sandbox. AI Voice Generator, presenter TTS, and other audio-file tools are marketing/demo asset generators, not live PSTN runtime engines.
- There is no work-companion API and no Grok Bot companion runtime. Users talk to one agent on phone, email, and text. Do not call Grok Bot from Express or Vapi.

Tenant Studio tests connect with a server-minted xAI ephemeral token (`xai-client-secret.`). The ChatGPT widget must not. Customer copy must not say "Grok Bot" or pair "AI" with "agent".

## Credentials: one xAI key for chat, preview TTS, and native PSTN

xAI Console API keys are Bearer tokens on `https://api.x.ai`. One key can authenticate Responses, Chat Completions, TTS, Realtime, and Imagine. Console ACLs (`api-key:endpoint:chat`, `api-key:endpoint:voice`, or wildcards) can restrict a key; they do not require a second Wireline env var.

Grok 4.6 (chat) and `grok-voice-think-fast-2.0` (Speech-to-Speech) are different models. That does not mean they need different API keys. xAI rate limits are per team and per model (text RPS/TPM; Voice concurrent sessions). Two Wireline keys do not isolate those budgets, do not give chat and voice separate GPUs, and do not reduce latency. Latency is per model and endpoint, not per API key. A second production env var only adds rotation, Vercel drift, and split-brain outages (voice down while chat is up).

| Work | Credential | Notes |
| --- | --- | --- |
| Structured chat / email / tools (`grok-4.6`) | `XAI_API_KEY` | Direct Responses API |
| Browser preview TTS (`/v1/tts`) | `XAI_API_KEY` | Same key; grant the voice endpoint ACL |
| Live PSTN + Studio native S2S (`grok-voice-think-fast-2.0` + Eve/Ara/Rex/Sal/Leo) | `XAI_API_KEY` plus `XAI_SIP_ALLOWED_ADDRESSES` | SIP sessions authenticate with the API key. Browsers use minted client secrets. |
| Isolated xAI experiments | `XAI_API_KEY_CHATKIT` | Optional. Not required to split chat from voice. |
| Imagine photos and video | none | Not offered. Images and videos are watermarked with no official off switch. Omit image/video ACLs on the production key. |
| Vapi rollback | `VAPI_PRIVATE_KEY` | Optional. Not a production launch requirement. |

Do not add `XAI_API_KEY_VOICE`. Chat, preview TTS, Studio, and native PSTN share `XAI_API_KEY`.

## Speech-to-Speech (Wireline production PSTN)

Source: https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech and linked pages (ephemeral tokens, SIP, custom voices, pricing, REST voice reference).

### Endpoint and models

- Browser WebSocket: `wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-2.0`
- SIP join: `wss://api.x.ai/v1/realtime?call_id=…` (no model query; `session.update` sets the model)
- This is a native audio model (speech in, speech out), not the Grok 4.6 text model.

### Auth

- Server-to-server: `Authorization: Bearer $XAI_API_KEY`.
- Browsers: mint `POST https://api.x.ai/v1/realtime/client_secrets`, then pass `xai-client-secret.${token}` as the WebSocket subprotocol on tenant Studio and protected public demos.
- SIP `call_id` sessions authenticate with the API key; ephemeral client secrets are not supported there.

### Session

- Configure with `session.update`: `instructions`, `voice`, `reasoning.effort`, `tools`, `turn_detection.server_vad`.
- PCM 24 kHz recommended for browser. SIP uses the provider telephony path. Do not put xAI `web_search` on live tenant tools.

### Voices

- Same roster as xAI TTS (`eve` default, plus ara/rex/sal/leo and others). Custom voices via console / `POST /v1/custom-voices` (US except Illinois; API create is Enterprise-gated).

### SIP PSTN

- https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech/sip
- Destination: `sip:+E164@sip.voice.x.ai;transport=tls`
- Twilio Elastic SIP Trunk origination is documented. Wireline production PSTN is **Twilio → xAI Direct SIP**. `XAI_SIP_ALLOWED_ADDRESSES` must list Twilio signaling CIDRs (prefix length 8–32). Do not allow `0.0.0.0/0`.
- Outbound: Twilio rings the customer first with synchronous Answering Machine Detection, then signed `<Sip>` bridge TwiML to the tenant's registered xAI number. Marketing/sales machines, fax, and unclassified (`unknown`/empty) answers hang up with no message (`64.1200(b)(3)` — Wireline has no opt-out line). Service and consumer-requested callbacks leave a deterministic identity + spoken callback number after `DetectMessageEnd`; those calls still fail-open `unknown` to the live SIP agent. Humans always bridge.
- After-hours inbound degrades to take-a-message (custom `outOfHoursMessage` when set) instead of pretending the business is open.

### Why Studio matches the phone brain

Users must test the brain they will ship. Native PSTN and Studio both use `grok-voice-think-fast-2.0`. ChatGPT MCP widget stays OpenAI because it is an OpenAI-hosted surface.
