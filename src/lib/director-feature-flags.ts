import { isOpenRouterConfigured } from "./openrouter-structured";

export interface DirectorFeatureFlags {
  toolExecution: boolean;
  creativeTools: boolean;
  artifactsPanel: boolean;
  /** Live Gemini grounded web search injected into Director turns */
  webResearch: boolean;
  /** Wireline Design Studio — Spectrum Desk (OpenRouter + Anthropic). Not Google Stitch. */
  designStudio: boolean;
  /** @deprecated Use designStudio — kept for API/client compatibility */
  stitchMedia: boolean;
}

function envEnabled(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

function loadDesignStudioEnabled(defaultOn: boolean): boolean {
  if (process.env.DIRECTOR_DESIGN_STUDIO_ENABLED !== undefined) {
    return envEnabled("DIRECTOR_DESIGN_STUDIO_ENABLED", defaultOn);
  }
  return envEnabled("DIRECTOR_STITCH_MEDIA_ENABLED", defaultOn);
}

export function loadDirectorFeatureFlags(): DirectorFeatureFlags {
  const webResearchDefault = Boolean(process.env.GEMINI_API_KEY?.trim());
  const designDefault = isOpenRouterConfigured();
  const designStudio = loadDesignStudioEnabled(designDefault);
  return {
    toolExecution: envEnabled("DIRECTOR_TOOL_EXECUTION_ENABLED", true),
    creativeTools: envEnabled("DIRECTOR_CREATIVE_TOOLS_ENABLED", true),
    artifactsPanel: envEnabled("DIRECTOR_ARTIFACTS_PANEL_ENABLED", true),
    webResearch: envEnabled("DIRECTOR_WEB_RESEARCH_ENABLED", webResearchDefault),
    designStudio,
    stitchMedia: designStudio,
  };
}
