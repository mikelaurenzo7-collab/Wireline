/**
 * xAI Grok metadata.
 *
 * Wireline's managed reasoning default is Grok 4.6. Live PSTN uses Twilio
 * Elastic SIP plus xAI Direct SIP Speech-to-Speech. Browser Studio tests use
 * the same native Speech-to-Speech roster; OpenAI Realtime remains the ChatGPT
 * widget and Studio fallback. The experimental unversioned Grok realtime demo
 * path remains retired.
 */
export const GROK_REALTIME_VOICE = {
  description: "Retired unversioned Grok realtime experiment; Studio uses native Speech-to-Speech",
  enabled: false,
  constraints:
    "Never mounted as a customer-facing demo; production PSTN uses Twilio + xAI Direct SIP Speech-to-Speech",
} as const;

export const GROK_MODEL_OPTIONS = {
  note: "xAI Grok 4.6 is the managed structured default. Live PSTN uses Twilio and xAI Direct SIP Speech-to-Speech. OpenAI, Gemini, and the AI Gateway provide continuity.",
} as const;

export const GROK_AGENT_STRENGTHS = {
  realtimeSearch:
    "Search approved Training knowledge during live voice tests for accurate, grounded answers, never the open web.",
  personalityTuning: "Match the caller's tone without dropping the facts.",
  advancedReasoning: "Keep the objective, the next question, and the close in view.",
  creativeCustomization: "Keep language vivid without inventing facts.",
} as const;

export function isGrokModelId(model: string | null | undefined): boolean {
  return typeof model === "string" && /grok/i.test(model);
}

/** Runtime-only prompt section when the live call model is Grok. */
export function buildGrokStrengthsPromptSection(): string {
  return [
    "## Conversation strengths",
    ...Object.values(GROK_AGENT_STRENGTHS).map((line) => `- ${line}`),
    "- Stay maximally truthful; say when live context is unavailable instead of guessing.",
  ].join("\n");
}
