/**
 * Grok-powered differentiators (xAI integration points).
 * These represent substantive capabilities, not marketing copy.
 * Real-time voice sessions, tool use, and reasoning paths are implemented
 * in src/lib/voice/grok-voice-* and related Grok realtime routes.
 *
 * Future: deeper integration into agent runtime, director planning,
 * outbound, and self-improvement loops where Grok's strengths (search,
 * reasoning, personality) provide unique value.
 */
export const GROK_REALTIME_VOICE = {
  description: "Authenticated browser and mobile live voice sessions using xAI Voice Agent API",
  enabled: true,
  constraints: "Knowledge search tool only during tests; production PSTN stays on Vapi",
} as const;

export const GROK_MODEL_OPTIONS = {
  note: "Grok models (e.g. via OpenRouter 'x-ai/grok-...') accepted as explicit per-agent overrides. Not the current Vapi tenant default.",
} as const;

// TODO (agent-excellence): Wire real Grok advantages into agent profiles, prompts, and the learning loop
// without exposing vendor names or hype in customer UI. Keep catalog + resolution logic in ai-models.ts.
