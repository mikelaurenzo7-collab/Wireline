// REAL IMPLEMENTATION — Grok as default for chat and voice

export const DEFAULT_MODEL = 'grok-xai'; // xAI Grok default

export const MODEL_OPTIONS = [
  { id: 'grok-xai', name: 'Grok (xAI)', provider: 'xai', voiceVariants: ['grok-default', 'grok-fun', 'grok-pro'] },
  { id: 'claude-3.5', name: 'Claude 3.5 Sonnet', provider: 'openrouter' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openrouter' },
];

export const getChatModel = () => process.env.XAI_API_KEY ? 'grok-xai' : 'openrouter-fallback';

export const getVoiceModel = (selectedVoice) => selectedVoice || 'grok-default'; // Client can select Grok voices