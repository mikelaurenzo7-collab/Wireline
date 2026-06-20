export interface DirectorFeatureFlags {
  toolExecution: boolean;
  creativeTools: boolean;
  artifactsPanel: boolean;
  webResearch: boolean;
}

export function loadDirectorFeatureFlags(): DirectorFeatureFlags {
  return { toolExecution: false, creativeTools: false, artifactsPanel: false, webResearch: false };
}
