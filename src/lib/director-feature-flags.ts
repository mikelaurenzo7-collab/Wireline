export interface DirectorFeatureFlags {
  toolExecution: boolean;
  creativeTools: boolean;
  artifactsPanel: boolean;
}

function envEnabled(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

export function loadDirectorFeatureFlags(): DirectorFeatureFlags {
  return {
    toolExecution: envEnabled("DIRECTOR_TOOL_EXECUTION_ENABLED", true),
    creativeTools: envEnabled("DIRECTOR_CREATIVE_TOOLS_ENABLED", true),
    artifactsPanel: envEnabled("DIRECTOR_ARTIFACTS_PANEL_ENABLED", true),
  };
}
