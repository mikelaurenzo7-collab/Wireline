# Grok Live Voice — native Twilio + xAI Speech-to-Speech

Production PSTN uses BotBound-owned Twilio plus xAI Direct SIP Speech-to-Speech (`grok-voice-think-fast-2.0`). The unpinned `grok-voice-latest` alias is not the production pin. Studio and ChatGPT private browser simulations use OpenAI Realtime; they never take over PSTN. Vapi is rollback-only and is not on the launch path. This is not Grok 4.6.

## Three different xAI products

Do not collapse these into one "Grok voice" id.

| Surface | What xAI actually is | Model / id |
| --- | --- | --- |
| Structured continuity | xAI Responses API (`https://api.x.ai/v1/responses`) | `grok-4.6` — optional text/image-in continuity after OpenAI and the governed Gateway |
| Live PSTN | Native Speech-to-Speech over Twilio SIP | `grok-voice-think-fast-2.0`. **`grok-4.6` is not a live-call model.** |
| Direct Speech-to-Speech alias | `wss://api.x.ai/v1/realtime?model=grok-voice-latest` | `grok-voice-latest` aliases `grok-voice-think-fast-2.0`. BotBound pins the versioned id; this browser experiment is not Studio. |

Official Speech-to-Speech page: https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech

## Active architecture

- Structured reasoning: direct OpenAI Responses API using GPT-5.6 Terra by default, then Vercel AI Gateway, direct xAI Grok 4.6, and Gemini continuity. Direct xAI continuity can be disabled via `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK=false` without disabling PSTN.
- Browser and mobile live tests: OpenAI Realtime `gpt-realtime-2.1` over authenticated WebRTC. The server loads tenant-owned Training context, mints a short-lived secret, exchanges SDP, and returns only the answer to the browser.
- Public/guest voice previews: native xAI browser demo with one-use tickets. Public PSTN demo numbers may still land on the rollback Vapi webhook until those lines are re-registered on xAI SIP.
- ChatGPT private voice simulation: OpenAI Realtime WebRTC via ephemeral client secrets (`OPENAI_API_KEY_CHATKIT` when set). It shares Studio's browser provider while remaining an isolated account-bound widget. ChatGPT Apps iframes may only connect to explicitly allowed domains, including `https://api.openai.com` for this flow.
- Production PSTN: Twilio carrier + xAI Direct SIP. Inbound webhooks at `/api/webhooks/xai/voice`. Outbound: Twilio customer leg, then signed `<Sip>` bridge to the tenant's registered xAI number. Grok 4.6 is the xAI Responses API text model for structured work; it is not a Vapi live-call model id.
- Custom phone voices: Vapi-supported streaming voice-library workflow only after consent, rights, latency, fallback, and telephony verification, and only on the rollback path. Native SIP uses the xAI Eve/Ara/Rex/Sal/Leo roster. Live Video presenter PCM still uses the OpenAI Realtime sandbox. AI Voice Generator, presenter TTS, and other audio-file tools are marketing/demo asset generators, not live PSTN runtime engines.
- There is no work-companion API and no Grok Bot companion runtime. Users talk to one agent on phone, email, and text. Do not call Grok Bot from Express or Vapi.

Tenant Studio tests use a server-mediated OpenAI Realtime WebRTC exchange. Platform credentials and ephemeral secrets remain server-side. Customer copy must not say "Grok Bot" or pair "AI" with "agent".

## Credentials: one xAI key for chat, preview TTS, and native PSTN

xAI Console API keys are Bearer tokens on `https://api.x.ai`. One key can authenticate Responses, Chat Completions, TTS, Realtime, and Imagine. Console ACLs (`api-key:endpoint:chat`, `api-key:endpoint:voice`, or wildcards) can restrict a key; they do not require a second Wireline env var.

Grok 4.6 (chat) and `grok-voice-think-fast-2.0` (Speech-to-Speech) are different models. That does not mean they need different API keys. xAI rate limits are per team and per model (text RPS/TPM; Voice concurrent sessions). Two Wireline keys do not isolate those budgets, do not give chat and voice separate GPUs, and do not reduce latency. Latency is per model and endpoint, not per API key. A second production env var only adds rotation, Vercel drift, and split-brain outages (voice down while chat is up).

| Work | Credential | Notes |
| --- | --- | --- |
| Structured continuity (`grok-4.6`) | `XAI_API_KEY` | Optional direct Responses API lane after OpenAI and the Gateway |
| Browser preview TTS (`/v1/tts`) | `XAI_API_KEY` | Same key; grant the voice endpoint ACL |
| Live PSTN native S2S (`grok-voice-think-fast-2.0` + Eve/Ara/Rex/Sal/Leo) | `XAI_API_KEY` plus `XAI_SIP_ALLOWED_ADDRESSES` | SIP sessions authenticate with the API key. Studio does not use this credential. |
| Isolated xAI experiments | `XAI_API_KEY_CHATKIT` | Optional. Not required to split chat from voice. |
| Vercel Preview sandbox | `XAI_API_KEY` | Dedicated sandbox key only. Reviewed at `scripts/check-deployment-boundaries.mjs`. Native PSTN stays fail-closed without Twilio Preview credentials. |
| Imagine photos and video | none | Not offered. Images and videos are watermarked with no official off switch. Omit image/video ACLs on the production key. |
| Vapi rollback | `VAPI_PRIVATE_KEY` | Optional. Not a production launch requirement. |

Do not add `XAI_API_KEY_VOICE`. Optional Grok continuity, preview TTS, and native PSTN share `XAI_API_KEY`; Studio uses `OPENAI_API_KEY`.

## Speech-to-Speech (Wireline production PSTN)

Source: https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech and linked pages (ephemeral tokens, SIP, custom voices, pricing, REST voice reference).

### Endpoint and models

- Browser WebSocket: `wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-2.0`
- SIP join: `wss://api.x.ai/v1/realtime?call_id=…` (no model query; `session.update` sets the model)
- This is a native audio model (speech in, speech out), not the Grok 4.6 text model.

### Auth

- Server-to-server: `Authorization: Bearer $XAI_API_KEY`.
- Browsers on protected xAI preview experiments: mint `POST https://api.x.ai/v1/realtime/client_secrets`, then pass `xai-client-secret.${token}` as the WebSocket subprotocol. Tenant Studio does not use this path.
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

### Why Studio and PSTN are separate

Studio is a private browser rehearsal surface, not an automatic PSTN failover or a carrier certification. It uses OpenAI Realtime so the managed structured and browser experience share the OpenAI control plane. Production phone calls remain on the already-operational Twilio + xAI Direct SIP lane until a measured post-launch migration is separately approved.

## Why OpenAI Realtime still exists

"Realtime" is a protocol name, not permission to collapse independent browser and PSTN release lanes.

| Surface | Brain | Why |
| --- | --- | --- |
| Production PSTN | `grok-voice-think-fast-2.0` over Twilio SIP | The agent you ship |
| Studio / mobile live test | OpenAI Realtime (`gpt-realtime-2.1`) WebRTC | Authenticated private rehearsal with tenant-owned Training context; cannot place calls |
| ChatGPT App private simulation | OpenAI Realtime (`gpt-realtime-2.1`) WebRTC | Account-bound OpenAI-hosted widget; cannot place calls |

xAI Speech-to-Speech speaks an OpenAI-compatible event protocol (`session.update`, `response.output_audio.delta`), but protocol shape does not make it OpenAI. PSTN transport remains `api.x.ai` with Think Fast; Studio transport remains OpenAI Realtime. Do not treat Grok 4.6 as a live-call model.

Studio fails closed when `OPENAI_API_KEY` or required Realtime model access is unavailable. PSTN independently fails closed when its Twilio/xAI configuration is unavailable.
