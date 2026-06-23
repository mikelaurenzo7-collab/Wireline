# Live Voice Runtime

Wireline uses the xAI Voice Agent API for authenticated browser and mobile live tests. The server creates a short-lived client secret; the browser never receives `XAI_API_KEY`.

## Environment

Set these in Vercel for Production, Preview, and Development:

```bash
XAI_API_KEY=
XAI_GROK_VOICE_MODEL=grok-voice-think-fast-1.0
XAI_GROK_VOICE_REASONING_EFFORT=high
XAI_GROK_VOICE_SPEED=1
```

`XAI_GROK_VOICE_REASONING_EFFORT` accepts `high` or `none`. Keep `high` for production assistants; use `none` only for a deliberate low-latency experiment.

## Product behavior

- The live voice test is authenticated and scoped to the selected assistant.
- Sessions use server VAD, 24 kHz PCM input/output, pronunciation replacements, session resumption, and assistant-specific rules/facts.
- The only enabled direct tool is `search_agent_knowledge`. It retrieves approved facts and rules but cannot send messages, book meetings, transfer calls, or change a connected system.
- Browser and mobile clients authenticate with a five-minute ephemeral token.
- Existing PSTN production calls remain on the Vapi path. Do not set `voice_provider` to an xAI value in the phone-agent factory until a number-level Direct SIP routing and action-webhook migration is complete.

## Voice profiles

Wireline maps assistant roles to provider voices without exposing vendor names in the product UI:

| Wireline profile | Roles | Voice behavior |
| --- | --- | --- |
| Clear | Sales | Confident, concise, professional |
| Warm | Scheduling and customer service | Friendly, patient, conversational |
| Balanced | Reception and technical support | Neutral, dependable, versatile |
| Direct | Collections | Decisive and focused |
| Bright | Explicit future selection | Energetic and upbeat |

## Custom voice readiness

A custom xAI voice ID can be supplied through an assistant's `business_variables.grokVoiceId` or `business_variables.grok_voice_id` field. This is intentionally not exposed in the current customer UI. Only use a voice recording where the organization has the necessary voice and recording rights.

## Validation checklist

1. Sign in, open Studio, choose an assistant, then choose **Test & Simulate**.
2. Start a live test and allow microphone access.
3. Ask a fact present in the assistant's knowledge; confirm the response uses the approved material.
4. Interrupt the assistant during speech and confirm it returns to listening.
5. Close network access briefly and confirm the session reconnects without losing the conversation.
6. Confirm the user-visible voice menu continues to say Wireline voice profiles rather than provider names.
