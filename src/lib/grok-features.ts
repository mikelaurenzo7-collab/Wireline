/**
 * Grok-powered differentiators (xAI integration points).
 * These represent substantive capabilities, not marketing copy.
 * Real-time voice sessions, tool use, and reasoning paths are implemented
 * in src/lib/voice/grok-voice-* and related Grok realtime routes.
 *
 * World-class unique value: Grok's search, wit, and reasoning enable agents that are
 * more truthful, up-to-date, and delightfully capable than generic LLMs.
 * Integrated without vendor exposure.
 */
export const GROK_REALTIME_VOICE = {
  description: "Authenticated browser and mobile live voice sessions using xAI Voice Agent API",
  enabled: true,
  constraints: "Knowledge search tool only during tests; production PSTN stays on Vapi",
} as const;

export const GROK_MODEL_OPTIONS = {
  note: "Grok models (e.g. via OpenRouter 'x-ai/grok-...') accepted as explicit per-agent overrides. Not the current Vapi tenant default.",
} as const;

export const GROK_AGENT_STRENGTHS = {
  realtimeSearch:
    "Grok can pull live web/X context in voice sessions for accurate, current answers.",
  personalityTuning:
    "Distinct profiles (bright/warm/clear/etc) leverage Grok's helpful, maximally truthful style.",
  advancedReasoning:
    "High-effort Grok paths for complex agent tasks like planning or objection handling.",
  creativeCustomization:
    "Enables agents with unique 'voice + mind' combinations for standout user experiences.",
} as const;

// TODO (agent-excellence): Wire these strengths into agent profiles, system prompts, and self-improvement
// loops (e.g. via ai-runtime or director). Keep all UI neutral. Catalog logic stays in ai-models.ts.
