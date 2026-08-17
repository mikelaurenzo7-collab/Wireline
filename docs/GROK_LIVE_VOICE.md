# Grok Live Voice — retired from demo routing

The experimental xAI realtime voice service was removed from the repository on 2026-08-13 (it had no route, no client, and no runtime path). Studio live tests now use Vapi web with the same xAI Grok 4.3 language model as production PSTN. OpenAI Realtime remains backup and ChatGPT-widget simulation. Production PSTN is Twilio → Vapi → xAI Grok 4.3 (language model) + xAI Eve/Ara/Rex/Sal/Leo or curated Vapi/ElevenLabs TTS. It is not Grok 4.6 and not xAI `grok-voice-latest`.

## Three different xAI products

Do not collapse these into one "Grok voice" id.

| Surface | What xAI actually is | Model / id |
| --- | --- | --- |
| Structured reasoning | xAI Responses API (`https://api.x.ai/v1/responses`) | `grok-4.6` — text/image in, text out |
| Live PSTN and Studio browser tests | Vapi `model.provider: "xai"` | `grok-4.3` only as the managed default. Vapi also lists `grok-4.20-0309-reasoning` and `grok-4.20-0309-non-reasoning`. **`grok-4.6` is not in Vapi's catalog.** |
| Direct Speech-to-Speech | `wss://api.x.ai/v1/realtime?model=grok-voice-latest` | `grok-voice-latest` (= `grok-voice-think-fast-2.0`). Not grok-4.6. Not a Vapi LLM enum. |

Official Speech-to-Speech page: https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech

## Active architecture

- Structured reasoning: direct xAI Responses API using Grok 4.6 by default, with OpenAI, Gemini, and the Vercel AI Gateway providing continuity. Direct xAI can be disabled via `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK=false`.
- Browser and mobile live tests: Vapi web using the same xAI Grok 4.3 language model as live phone calls. OpenAI Realtime is automatic backup only when Vapi is unavailable. Users do not pick a separate test brain.
- Public/guest voice previews: Vapi web showcase assistants (Grok 4.3). Isolated OpenAI demo credentials remain available for ChatGPT-hosted simulation.
- ChatGPT private voice simulation: OpenAI Realtime WebRTC via ephemeral client secrets (`OPENAI_API_KEY_CHATKIT` when set). This is an OpenAI-hosted widget surface, not the tenant phone test.
- Phone-call demonstrations and production PSTN: Vapi orchestration with xAI Grok 4.3 as the managed call language model (`model.provider: "xai"`), Twilio as carrier/messaging authority. Vapi's published xAI language models are `grok-4.3`, `grok-4.20-0309-reasoning`, and `grok-4.20-0309-non-reasoning`. Grok 4.6 is the xAI Responses API text model for structured work; it is not a Vapi live-call model id.
- Vapi `XaiModel` payloads must not include `fallbackModels`. A live PATCH with `fallbackModels: ["grok-4.20-0309-non-reasoning"]` returns `400 model.property fallbackModels should not exist`. Cross-provider continuity is Wireline's application retry to OpenAI `gpt-4o` after a definitive model/provider rejection.
- Custom phone voices: Vapi-supported streaming voice-library workflow only after consent, rights, latency, fallback, and telephony verification. Live Video presenter PCM still uses the OpenAI Realtime sandbox. AI Voice Generator, presenter TTS, and other audio-file tools are marketing/demo asset generators, not live PSTN runtime engines.
- Work companions: reviewable agent skills (research, scouting, creative, call briefs, clip scripts) that never send, dial, or generate Imagine files. See `GROK_BOT_COMPANION_RUNTIME.md`.

No customer-facing surface should connect with an xAI client-secret subprotocol. Customer copy must not say "Grok Bot" or pair "AI" with "agent".

## Speech-to-Speech research (xAI native, not Wireline PSTN)

Source: https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech and linked pages (ephemeral tokens, SIP, custom voices, pricing, REST voice reference, Vapi xAI model docs).

### Endpoint and models

- WebSocket: `wss://api.x.ai/v1/realtime?model=grok-voice-latest`
- `grok-voice-latest` aliases `grok-voice-think-fast-2.0` (flagship). Previous: `grok-voice-think-fast-1.0`.
- This is a native audio model (speech in, speech out), not the Grok 4.6 text model and not Vapi's `grok-4.3` LLM.

### Auth

- Server-to-server: `Authorization: Bearer $XAI_API_KEY`.
- Browsers: mint `POST https://api.x.ai/v1/realtime/client_secrets`, then pass `xai-client-secret.${token}` as the WebSocket subprotocol. Wireline contracts forbid that subprotocol on customer widgets.
- SIP `call_id` sessions authenticate with the API key; ephemeral client secrets are not supported there.

### Session

- Configure with `session.update`: `instructions`, `voice`, `reasoning.effort` (`high` default / `none`), `tools` (`file_search`, `web_search`, `x_search`, `mcp`, `function`), `turn_detection.server_vad`.
- PCM 24 kHz recommended. Telephony codecs `pcmu` / `pcma` exist. Do not put xAI `web_search` on live Vapi tools.

### Voices

- Same roster as xAI TTS (`eve` default, plus ara/rex/sal/leo and others). Custom voices via console / `POST /v1/custom-voices` (US except Illinois; API create is Enterprise-gated).

### SIP PSTN

- https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech/sip
- Destination: `sip:{number}@sip.voice.x.ai;transport=tls`
- Twilio Elastic SIP Trunk origination is documented. This is **xAI-native telephony**, not Vapi. Wireline production PSTN stays **Twilio → Vapi**. Remounting xAI Speech-to-Speech as Studio default would still be a different brain than Vapi PSTN (`grok-4.3` + separate TTS).

### OpenAI Realtime migration (xAI-native only)

- Change base URL to `wss://api.x.ai/v1` / `https://api.x.ai/v1`, swap key, model `grok-voice-latest`.
- Event naming differences exist versus OpenAI (`…transcription.updated` vs `.delta`).
- Wireline does not use this path for tenant phone tests.

### Why Wireline does not default Studio to `grok-voice-latest`

Users must test the brain they will ship. Vapi PSTN uses `grok-4.3`. Direct Speech-to-Speech uses `grok-voice-latest`. Those are different products. Studio therefore uses authenticated Vapi web (`buildVapiAssistant`) so the test matches live calls. OpenAI Realtime stays automatic backup. ChatGPT MCP widget stays OpenAI because it is an OpenAI-hosted surface.
