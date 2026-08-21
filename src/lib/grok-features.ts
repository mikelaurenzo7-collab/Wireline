/**
 * xAI Grok metadata.
 *
 * BotBound's managed reasoning and Studio browser defaults are OpenAI. Live
 * PSTN remains Twilio Elastic SIP plus xAI Direct SIP Speech-to-Speech, and
 * Grok 4.6 remains an optional structured continuity model. The experimental
 * unversioned Grok browser-realtime path remains retired.
 */
export const GROK_REALTIME_VOICE = {
  description: "Retired unversioned Grok browser-realtime experiment; Studio uses OpenAI Realtime",
  enabled: false,
  constraints:
    "Never mounted as a customer-facing demo; production PSTN uses Twilio + xAI Direct SIP Speech-to-Speech",
} as const;

export const GROK_MODEL_OPTIONS = {
  note: "xAI Grok 4.6 is an optional structured continuity model. Live PSTN uses Twilio and xAI Direct SIP Speech-to-Speech; OpenAI owns structured primary and Studio browser voice.",
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
