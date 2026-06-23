// Updated by Sebastian - Grok Default Takeover
export const LLM_PROVIDERS = {
  default: 'xai-grok-4-heavy',
  options: ['xai-grok-4-heavy', 'openai-gpt-4o', 'eleven-voice-enhanced'],
  grokKey: process.env.XAI_API_KEY || 'VERCEL_SET',
  voiceProviders: ['elevenlabs', 'xai-grok-tts'] as const,
} as const;

export function getVoiceOptions(provider: string) {
  if (provider === 'xai-grok-tts') {
    return ['eve-professional', 'ara-sales', 'rex-closer', 'sal-empathetic', 'leo-witty', 'custom-clone'];
  }
  return ['eleven-voice-1', 'eleven-voice-2']; // existing
}