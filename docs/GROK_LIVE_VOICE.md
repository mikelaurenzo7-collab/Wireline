# Grok Live Voice (Active Realtime Architecture)

Wireline's authenticated browser, mobile, and ChatGPT voice sessions run on the managed **xAI Grok realtime contract** in `src/lib/voice/grok-voice-service.ts` and `src/routes/grok-voice-routes.ts`. This is the active, default live-voice architecture. The OpenAI Realtime implementation in `src/lib/voice/openai-realtime-service.ts` and `src/routes/openai-realtime-routes.ts` remains registered as an ordered continuity fallback.

The live-voice sandbox (`src/components/LiveVoiceSandbox.tsx`) opens a session against `/api/voice/live/session` and connects with the `xai-client-secret.<token>` WebSocket subprotocol. Sessions are authenticated, agent-scoped, and never expose the long-lived xAI key to a browser or native client.

## Active xAI environment

Set these in Vercel for the environments that use authenticated realtime voice:

```bash
XAI_API_KEY=
XAI_GROK_VOICE_MODEL=          # optional; defaults to grok-voice-think-fast-1.0
XAI_GROK_VOICE_REASONING_EFFORT=
XAI_GROK_VOICE_SPEED=
```

The server mints short-lived client secrets (`https://api.x.ai/v1/realtime/client_secrets`), applies a hashed safety identifier, and returns only the ephemeral secret and endpoint to the client.

## Active product behavior

- Live sessions are authenticated and scoped to the selected agent or a confirmed private draft.
- Sessions use 24 kHz PCM audio and server-owned instructions.
- Standard Wireline realtime tools are bounded and server-defined; private ChatGPT simulations explicitly receive `tools: []` and `tool_choice: none`.
- Browser and mobile clients receive only a short-lived client secret.
- Production PSTN calls remain on the approved telephony path (Vapi) and continue to enforce billing, consent, DNC, and launch policy server-side.
- Customer-facing voice names remain Wireline profiles rather than provider brands.

## OpenAI Realtime fallback environment

The OpenAI Realtime path stays available as a continuity fallback for authenticated realtime tests:

```bash
OPENAI_API_KEY=
OPENAI_API_KEY_CHATKIT=        # optional; isolates ChatGPT acquisition/demo spend
OPENAI_REALTIME_MODEL=
OPENAI_REALTIME_VOICE=
```

`OPENAI_API_KEY_CHATKIT` is optional; the general OpenAI key is the fallback. The server never returns the long-lived API key to a browser or native client.

## Verification

1. Sign in, open Studio, choose an agent, and start **Test & Simulate**.
2. Confirm the session metadata reports the Grok live-voice model and the selected Wireline voice profile without exposing a provider name in the UI.
3. Confirm approved tools are present for authenticated product tests and absent for private ChatGPT simulations.
4. Interrupt the agent during speech and confirm it returns to listening.
5. Confirm failure messages identify configuration or access problems without leaking upstream credentials or raw provider responses.
