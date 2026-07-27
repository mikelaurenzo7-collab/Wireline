/** Platform-level integration env (Vercel) — distinct from per-tenant OAuth rows. */

export interface PlatformIntegrationFlags {
  apollo: boolean;
  docusign: boolean;
  gemini: boolean;
  perplexity: boolean;
  liveResearch: boolean;
}

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

/** Mirrors src/lib/perplexity-platform.ts so tool exposure matches runtime key policy. */
function perplexityRuntimeAvailable(): boolean {
  if (process.env.VERCEL_ENV === "preview") {
    return envPresent("PERPLEXITY_PREVIEW_API_KEY");
  }
  return envPresent("PERPLEXITY_API_KEY");
}

export function loadPlatformIntegrationFlags(): PlatformIntegrationFlags {
  const apolloOAuth = envPresent("APOLLO_CLIENT_ID") && envPresent("APOLLO_CLIENT_SECRET");
  const gemini = envPresent("GEMINI_API_KEY");
  const perplexity = perplexityRuntimeAvailable();
  return {
    apollo: envPresent("APOLLO_API_KEY") || apolloOAuth,
    docusign:
      envPresent("DOCUSIGN_ACCOUNT_ID") &&
      (envPresent("DOCUSIGN_JWT_TOKEN") || envPresent("DOCUSIGN_ACCESS_TOKEN")),
    gemini,
    perplexity,
    liveResearch: gemini || perplexity,
  };
}
