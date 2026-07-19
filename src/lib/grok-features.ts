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
  note: "Grok structured use is an explicit opt-in experiment behind WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK; the managed structured primary is OpenAI, and the Vercel AI Gateway carries any multi-model routing.",
} as const;

export const GROK_AGENT_STRENGTHS = {
  realtimeSearch:
    "Pull live web and social context in voice sessions for accurate, current answers.",
  personalityTuning:
    "Distinct profiles (bright/warm/clear/etc) leverage a helpful, maximally truthful style.",
  advancedReasoning:
    "High-effort reasoning paths for complex tasks like planning or objection handling.",
  creativeCustomization:
    "Enables agents with unique voice and mind combinations for standout caller experiences.",
} as const;

export function isGrokModelId(model: string | null | undefined): boolean {
  return typeof model === "string" && /grok/i.test(model);
}

/** Runtime-only prompt section — never surface vendor names in customer UI. */
export function buildGrokStrengthsPromptSection(): string {
  return [
    "## Model capabilities",
    ...Object.values(GROK_AGENT_STRENGTHS).map((line) => `- ${line}`),
    "- Stay maximally truthful; say when live context is unavailable instead of guessing.",
  ].join("\n");
}
