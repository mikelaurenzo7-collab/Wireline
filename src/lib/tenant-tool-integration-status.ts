import type { ToolIntegration } from "./agent-capabilities";

type OAuthProviderRow = { connected?: boolean; configured?: boolean };

export type TenantToolIntegrationContext = {
  oauthStatus: Record<string, OAuthProviderRow | undefined>;
  calendarReconnectGoogle: boolean;
  calendarReconnectMicrosoft: boolean;
  emailProviders: string[];
};

const PLATFORM_MANAGED: ReadonlySet<ToolIntegration> = new Set([
  "twilio",
  "docusign",
] as ToolIntegration[]);

/**
 * Tenant-safe integration posture for agent tool toggles — no platform env-var leakage.
 */
export function resolveTenantToolIntegrationStatus(
  integration: ToolIntegration | undefined,
  ctx: TenantToolIntegrationContext,
): "configured" | "missing" {
  if (!integration) return "configured";
  if (PLATFORM_MANAGED.has(integration)) return "configured";

  if (integration === "calendar") {
    const hasGoogle = ctx.emailProviders.includes("google");
    const hasMicrosoft = ctx.emailProviders.includes("microsoft");
    const googleReady = hasGoogle && !ctx.calendarReconnectGoogle;
    const microsoftReady = hasMicrosoft && !ctx.calendarReconnectMicrosoft;
    return googleReady || microsoftReady ? "configured" : "missing";
  }

  if (integration === "crm") {
    const sf = ctx.oauthStatus.salesforce;
    const hs = ctx.oauthStatus.hubspot;
    return sf?.connected || hs?.connected ? "configured" : "missing";
  }

  const row = ctx.oauthStatus[integration];
  if (row?.connected) return "configured";
  if (row && "configured" in row && row.configured === false) return "missing";
  return "missing";
}
