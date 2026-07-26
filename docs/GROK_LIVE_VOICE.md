# Grok Live Voice — retired from demo routing

The xAI realtime implementation remains in the repository only as an explicit internal experiment. It is not mounted as Wireline's default structured runtime and it does not own any public, authenticated, mobile, Studio, Showcase, or ChatGPT demo path.

## Active architecture

- Structured reasoning: direct OpenAI Responses API by default, with Gemini and the Vercel AI Gateway providing continuity. Direct xAI is opt-in only.
- Browser and mobile live tests: OpenAI Realtime over WebRTC through `/api/voice/live/session`.
- Public/guest voice previews: OpenAI Realtime using the isolated demo credential when configured.
- ChatGPT private voice simulation: OpenAI Realtime WebRTC via ephemeral client secrets (`OPENAI_API_KEY_CHATKIT` when set).
- Phone-call demonstrations and production PSTN: Vapi orchestration with OpenAI as the managed call model and Twilio as carrier/messaging authority.
- Custom phone voices: Vapi-supported streaming voice-library workflow only after consent, rights, latency, fallback, and telephony verification. Browser demos use the managed OpenAI voice-profile mapping. AI Voice Generator, presenter TTS, and other audio-file tools are marketing/demo asset generators, not live PSTN runtime engines.

No customer-facing surface should connect with an xAI client-secret subprotocol or present Grok as a default runtime.
