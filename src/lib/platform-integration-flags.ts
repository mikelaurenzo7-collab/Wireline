/** Platform-level integration env — distinct from per-tenant OAuth rows. */
import { requiresPreviewProviderIsolation } from "./preview-spend-policy";

export interface PlatformIntegrationFlags {
  docusign: boolean;
  /** Built-in web search on the managed structured provider. */
  webSearch: boolean;
  perplexity: boolean;
  liveResearch: boolean;
}

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

/** Mirrors src/lib/perplexity-platform.ts so tool exposure matches runtime key policy. */
export function perplexityRuntimeAvailable(): boolean {
  if (requiresPreviewProviderIsolation()) {
    return envPresent("PERPLEXITY_PREVIEW_API_KEY");
  }
  return envPresent("PERPLEXITY_API_KEY");
}

export function loadPlatformIntegrationFlags(): PlatformIntegrationFlags {
  const webSearch = envPresent("XAI_API_KEY");
  const perplexity = perplexityRuntimeAvailable();
  return {
    docusign:
      envPresent("DOCUSIGN_ACCOUNT_ID") &&
      (envPresent("DOCUSIGN_JWT_TOKEN") || envPresent("DOCUSIGN_ACCESS_TOKEN")),
    webSearch,
    perplexity,
    liveResearch: webSearch || perplexity,
  };
}
