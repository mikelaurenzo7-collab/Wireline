# Grok Live Voice — native Twilio + xAI Speech-to-Speech

Production PSTN uses Wireline-owned Twilio plus xAI Direct SIP. Studio live tests use xAI Speech-to-Speech with the versioned `grok-voice-think-fast-2.0` model. These surfaces currently run the same model release, but the pin is enforceable only for direct browser WebSockets: xAI binds SIP `call_id` sessions to the registered phone session and ignores a `model` query parameter. As of August 5, 2026, `grok-voice-latest` routes to Think Fast 2.0. OpenAI Realtime remains limited to ChatGPT-widget simulation. Vapi is rollback-only and is not on the launch path. This is not Grok 4.6.

## Four distinct runtime identities

Do not collapse these into one "Grok voice" id.

| Surface | What xAI actually is | Model / id |
| --- | --- | --- |
| Structured reasoning | xAI Responses API (`https://api.x.ai/v1/responses`) | `grok-4.6` — text/image in, text out |
| Production PSTN | Native Voice Agent API over Twilio Direct SIP | Provider-bound SIP session. `grok-voice-latest` currently routes to `grok-voice-think-fast-2.0`; the SIP `call_id` join cannot version-pin it. |
| Studio and protected browser tests | Native Speech-to-Speech over an ephemeral WebSocket | Version-pinned `grok-voice-think-fast-2.0`. **`grok-4.6` is not a live-call model.** |
| Direct Speech-to-Speech alias | `wss://api.x.ai/v1/realtime?model=grok-voice-latest` | Moving alias that currently resolves to `grok-voice-think-fast-2.0`. Wireline does not use the alias for browser production tests. |

Official Speech-to-Speech page: https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech

Official SIP page: https://docs.x.ai/developers/model-capabilities/audio/voice-agent/sip

## Active architecture

- Structured reasoning: direct xAI Responses API using Grok 4.6 by default, with OpenAI, Gemini, and the Vercel AI Gateway providing continuity. Direct xAI can be disabled via `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK=false`.
- Browser and mobile live tests: native xAI Speech-to-Speech pinned to `grok-voice-think-fast-2.0`.
- Production PSTN: Twilio carrier plus xAI Direct SIP. Inbound webhooks land at `/api/webhooks/xai/voice`. Outbound calls use a Twilio customer leg and then a signed `<Sip>` bridge to the tenant's registered xAI number. The SIP session is provider-bound and currently runs Think Fast 2.0 through xAI's current voice alias.
- Public/guest voice previews: native xAI browser demo with one-use tickets. Public PSTN demo numbers may still land on the rollback Vapi webhook until those lines are re-registered on xAI SIP.
- ChatGPT private voice simulation: OpenAI Realtime WebRTC via ephemeral client secrets (`OPENAI_API_KEY_CHATKIT` when set). This is an OpenAI-hosted widget surface, not the tenant phone test.
- Custom phone voices: use the xAI built-in or authorized custom-voice roster only after consent, rights, latency, fallback, and telephony verification. Vapi-supported streaming voice-library workflows remain rollback-only. Live Video presenter PCM still uses the isolated OpenAI Realtime sandbox. AI Voice Generator, presenter TTS, and other audio-file tools are marketing/demo asset generators, not live PSTN runtime engines.
- There is no work-companion API and no Grok Bot companion runtime. Users talk to one agent on phone, email, and text. Do not call Grok Bot from Express or Vapi.

Tenant Studio tests connect with a server-minted xAI ephemeral token (`xai-client-secret.`). The ChatGPT widget must not. Customer copy must not expose provider or model implementation details.

## Credentials: one xAI key for chat, preview TTS, and native PSTN

xAI Console API keys are Bearer tokens on `https://api.x.ai`. One key can authenticate Responses, Chat Completions, TTS, Realtime, and Imagine. Console ACLs (`api-key:endpoint:chat`, `api-key:endpoint:voice`, or wildcards) can restrict a key; they do not require a second Wireline env var.

Grok 4.6 (chat) and the Voice Agent API are different model families. That does not mean they need different API keys. xAI rate limits are per team and per model (text RPS/TPM; Voice concurrent sessions). Two Wireline keys do not isolate those budgets, do not give chat and voice separate GPUs, and do not reduce latency. A second production env var only adds rotation, Vercel drift, and split-brain outages.

| Work | Credential | Notes |
| --- | --- | --- |
| Structured chat / email / tools (`grok-4.6`) | `XAI_API_KEY` | Direct Responses API |
| Browser preview TTS (`/v1/tts`) | `XAI_API_KEY` | Same key; grant the voice endpoint ACL |
| Studio native S2S (`grok-voice-think-fast-2.0`) | `XAI_API_KEY` | Server mints a short-lived browser client secret and uses a versioned model URL. |
| Live PSTN over xAI Direct SIP | `XAI_API_KEY` plus `XAI_SIP_ALLOWED_ADDRESSES` | SIP joins authenticate server-side with the API key. The phone session is provider-bound; current xAI routing is Think Fast 2.0. |
| Isolated xAI experiments | `XAI_API_KEY_CHATKIT` | Optional. Not required to split chat from voice. |
| Imagine photos and video | none | Not offered. Omit image/video ACLs on the production key. |
| Vapi rollback | `VAPI_PRIVATE_KEY` | Optional. Not a production launch requirement. |

Do not add `XAI_API_KEY_VOICE`. Chat, preview TTS, Studio, and native PSTN share `XAI_API_KEY`.

## Speech-to-Speech and SIP

Sources: the xAI Speech-to-Speech, Voice Agent, SIP, ephemeral-token, and REST Voice documentation.

### Endpoint and model behavior

- Browser WebSocket: `wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-2.0`
- SIP join: `wss://api.x.ai/v1/realtime?call_id=…`
- When `call_id` is present, xAI documents that the `model` query parameter is ignored because the session is bound to the inbound SIP call.
- `session.update` configures instructions, voice, reasoning effort, tools, audio, and turn detection. It does not change or pin the SIP model.
- The phone-number registration API currently exposes the BYO-trunk, webhook, and SIP-auth contract; it does not expose a model selector.
- Think Fast 2.0 is the current provider route for `grok-voice-latest`. Treat a future alias change as a provider-runtime change that requires recertification, not as an invisible no-op.
- This is native speech in / speech out, not the Grok 4.6 text model.

### Authentication

- Server-to-server: `Authorization: Bearer $XAI_API_KEY`.
- Browsers: mint `POST https://api.x.ai/v1/realtime/client_secrets`, then pass `xai-client-secret.${token}` as the WebSocket subprotocol on tenant Studio and protected public demos.
- SIP `call_id` sessions authenticate with the API key; ephemeral client secrets are not supported there.

### Session configuration

- Configure with `session.update`: `instructions`, `voice`, `reasoning.effort`, `tools`, and `turn_detection.server_vad`.
- PCM 24 kHz is used for browser tests. SIP uses the provider telephony path. Do not put xAI `web_search` on live tenant tools.

### Voices

- The xAI Voice Agent and TTS APIs share the built-in voice roster (`eve`, `ara`, `rex`, `sal`, `leo`, and current additions).
- Authorized custom voices can be used where the account, geography, consent, and API entitlements allow them. Custom-voice creation is separate from phone-number registration.

### SIP PSTN

- Destination: `sip:+E164@sip.voice.x.ai;transport=tls`
- Twilio Elastic SIP Trunk origination is documented. Wireline production PSTN is **Twilio → xAI Direct SIP**. `XAI_SIP_ALLOWED_ADDRESSES` must list Twilio signaling CIDRs (prefix length 8–32). Do not allow `0.0.0.0/0`.
- xAI returns the webhook signing secret once when a BYO-trunk phone number is registered. Wireline encrypts it and retains a retired registration ledger because the current phone-number API does not document deletion.
- Outbound: Twilio rings the customer first with synchronous Answering Machine Detection, then serves signed `<Sip>` bridge TwiML to the tenant's registered xAI number. Marketing/sales machines, fax, and unclassified (`unknown`/empty) answers hang up with no message. Service and consumer-requested callbacks may leave the deterministic identity and callback message after `DetectMessageEnd`. Humans bridge to the live SIP agent.
- After-hours inbound degrades to take-a-message (using the custom `outOfHoursMessage` when set) instead of pretending the business is open.

### Why Studio still represents the shipped phone behavior

Studio and phone currently use the same Think Fast 2.0 release, the same runtime instructions, tools, voice mapping, and safety policies. The transport distinction remains material:

| Surface | Brain | Stability contract |
| --- | --- | --- |
| Production PSTN | xAI SIP voice session, currently Think Fast 2.0 | Provider-bound phone session; monitor and recertify provider alias changes |
| Studio / mobile live test | `grok-voice-think-fast-2.0` over `wss://api.x.ai/v1/realtime` | Wireline-controlled version pin |
| ChatGPT App private simulation | OpenAI Realtime WebRTC | ChatGPT-hosted preview only; cannot place calls |

xAI Speech-to-Speech uses an OpenAI-compatible event protocol (`session.update`, `response.output_audio.delta`). The transport is `api.x.ai`. Do not route Studio or PSTN through OpenAI Realtime to "match" ChatGPT, and do not treat Grok 4.6 as the live-call model.

Studio has no OpenAI fallback. If `XAI_API_KEY` is missing, live tests fail closed.
