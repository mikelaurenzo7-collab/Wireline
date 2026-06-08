import { isOpenRouterConfigured } from "./openrouter-structured";

export interface DirectorFeatureFlags {
  toolExecution: boolean;
  creativeTools: boolean;
  artifactsPanel: boolean;
  /** Live Gemini grounded web search injected into Director turns */
  webResearch: boolean;
  /** Wireline Design Studio (Spectrum Desk via OpenRouter) */
  stitchMedia: boolean;
}

function envEnabled(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

export function loadDirectorFeatureFlags(): DirectorFeatureFlags {
  const webResearchDefault = Boolean(process.env.GEMINI_API_KEY?.trim());
  const designDefault = isOpenRouterConfigured();
  return {
    toolExecution: envEnabled("DIRECTOR_TOOL_EXECUTION_ENABLED", true),
    creativeTools: envEnabled("DIRECTOR_CREATIVE_TOOLS_ENABLED", true),
    artifactsPanel: envEnabled("DIRECTOR_ARTIFACTS_PANEL_ENABLED", true),
    webResearch: envEnabled("DIRECTOR_WEB_RESEARCH_ENABLED", webResearchDefault),
    stitchMedia: envEnabled("DIRECTOR_STITCH_MEDIA_ENABLED", designDefault),
  };
}
