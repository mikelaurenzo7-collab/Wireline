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

export function loadPlatformIntegrationFlags(): PlatformIntegrationFlags {
  const apolloOAuth = envPresent("APOLLO_CLIENT_ID") && envPresent("APOLLO_CLIENT_SECRET");
  const gemini = envPresent("GEMINI_API_KEY");
  const perplexity = envPresent("PERPLEXITY_API_KEY");
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
