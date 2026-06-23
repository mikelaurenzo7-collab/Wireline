export const LLM_PROVIDERS = {
  default: "xai-grok-4-heavy",
  options: ["xai-grok-4-heavy", "openai-gpt-4o", "eleven-voice-enhanced"],
  grokKeyConfigured: Boolean(process.env.XAI_API_KEY),
  voiceProviders: ["wireline-live", "elevenlabs"] as const,
} as const;

export function getVoiceOptions(provider: string) {
  if (provider === "wireline-live") return ["bright", "warm", "clear", "balanced", "direct"];
  return ["eleven-voice-1", "eleven-voice-2"];
}
