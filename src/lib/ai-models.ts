// FULL UPDATE — Removed OpenRouter entirely

export const DEFAULT_MODEL = 'grok-xai';

export const AVAILABLE_MODELS = [
  { id: 'grok-xai', name: 'Grok (xAI)', provider: 'xai' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', apiKeyEnv: 'GEMINI_API_KEY' },
  { id: 'gpt-4o', name: 'OpenAI GPT-4o', provider: 'openai', apiKeyEnv: 'OPENAI_API_KEY' },
  { id: 'byok-custom', name: 'Bring Your Own Key (Custom)', provider: 'byok' },
];

export const getActiveModel = (userSelection, geminiKey, openaiKey) => {
  if (userSelection) return userSelection;
  return 'grok-xai'; // Grok default
};

// Voice selection remains with Grok options + fallback to Gemini/OpenAI TTS if needed