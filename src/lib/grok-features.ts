/**
 * Optional xAI experiment metadata.
 *
 * Wireline's managed reasoning default is OpenAI, browser/mobile demos use
 * OpenAI Realtime, and phone demonstrations use Vapi. xAI is not part of any
 * default or customer-facing demo path.
 */
export const GROK_REALTIME_VOICE = {
  description: "Optional internal xAI realtime experiment",
  enabled: false,
  constraints: "Never mounted as a default or customer-facing demo; production PSTN stays on Vapi",
} as const;

export const GROK_MODEL_OPTIONS = {
  note: "xAI structured use is explicit opt-in only. OpenAI is the managed default with Gemini and the AI Gateway providing continuity.",
} as const;

export const GROK_AGENT_STRENGTHS = {
  realtimeSearch:
    "Search approved Training knowledge during live voice tests for accurate, grounded answers — never the open web.",
  personalityTuning: "Optional experimental personality tuning.",
  advancedReasoning: "Optional experimental reasoning evaluation.",
  creativeCustomization: "Optional experimental customization evaluation.",
} as const;

export function isGrokModelId(model: string | null | undefined): boolean {
  return typeof model === "string" && /grok/i.test(model);
}

/** Runtime-only prompt section for explicitly enabled xAI experiments. */
export function buildGrokStrengthsPromptSection(): string {
  return [
    "## Optional experimental model capabilities",
    ...Object.values(GROK_AGENT_STRENGTHS).map((line) => `- ${line}`),
    "- Stay maximally truthful; say when live context is unavailable instead of guessing.",
  ].join("\n");
}
