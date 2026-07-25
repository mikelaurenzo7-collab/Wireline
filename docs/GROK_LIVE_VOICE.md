# Grok Live Voice — retired from demo routing

The xAI realtime implementation remains in the repository only as an explicit internal experiment. It is not mounted as Wireline's default structured runtime and it does not own any public, authenticated, mobile, Studio, Showcase, or ChatGPT demo path.

## Active architecture

- Structured reasoning: direct OpenAI Responses API by default, with Gemini and the Vercel AI Gateway providing continuity.
- Browser and mobile live tests: OpenAI Realtime over WebRTC through `/api/voice/live/session`.
- Public/guest voice previews: OpenAI Realtime using the isolated demo credential when configured.
- Phone-call demonstrations and production PSTN: Vapi orchestration with OpenAI as the managed call model and Twilio as carrier/messaging authority.
- Custom phone voices: Vapi/ElevenLabs voice-library workflow. Browser demos use the managed OpenAI voice-profile mapping.

No customer-facing surface should connect with an xAI client-secret subprotocol or present Grok as a default runtime.
