# Legacy xAI Voice Compatibility

Wireline's authenticated browser, mobile, and ChatGPT voice simulations now use the managed OpenAI Realtime contract in `src/lib/voice/openai-realtime-service.ts` and `src/routes/openai-realtime-routes.ts`.

The xAI/Grok implementation remains in the repository only as a compatibility boundary for older clients and deliberate experiments. It is not the default runtime, must not be selected automatically, and must not be described as the active Wireline voice architecture in customer-facing or native-app documentation.

## Active OpenAI environment

Set these in Vercel for the environments that use authenticated realtime tests:

```bash
OPENAI_API_KEY=
OPENAI_API_KEY_CHATKIT=
OPENAI_REALTIME_MODEL=
OPENAI_REALTIME_VOICE=
```

`OPENAI_API_KEY_CHATKIT` is optional and isolates ChatGPT acquisition/demo spend; the general OpenAI key is the fallback. The server creates short-lived client secrets, applies a hashed safety identifier, and never returns the long-lived API key to a browser or native client.

## Active product behavior

- Live tests are authenticated and scoped to the selected agent or confirmed private draft.
- Sessions use 24 kHz PCM audio and server-owned instructions.
- Standard Wireline realtime tools are bounded and server-defined; private ChatGPT simulations explicitly receive `tools: []` and `tool_choice: none`.
- Browser and mobile clients receive only a short-lived client secret.
- Production PSTN calls remain on the approved telephony path and continue to enforce billing, consent, DNC, and launch policy server-side.
- Customer-facing voice names remain Wireline profiles rather than provider brands.

## Legacy xAI environment

The following variables are compatibility-only and should not be required for the normal Wireline runtime:

```bash
XAI_API_KEY=
XAI_GROK_VOICE_MODEL=
XAI_GROK_VOICE_REASONING_EFFORT=
XAI_GROK_VOICE_SPEED=
```

Do not add or restore these variables merely to make the active OpenAI-first path work. Remove the legacy route and configuration only after deployed older clients no longer depend on them and regression contracts confirm the migration is complete.

## Migration verification

1. Sign in, open Studio, choose an agent, and start **Test & Simulate**.
2. Confirm the session metadata reports `openai_realtime` and the configured OpenAI realtime model.
3. Confirm the selected Wireline voice profile is used without exposing a provider name in the UI.
4. Confirm approved tools are present for authenticated product tests and absent for private ChatGPT simulations.
5. Interrupt the agent during speech and confirm it returns to listening.
6. Confirm failure messages identify configuration or access problems without leaking upstream credentials or raw provider responses.
