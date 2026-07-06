/**
 * Buyer-facing integration certification — beyond env presence.
 */
import {
  INTEGRATIONS,
  getIntegrationsStatus,
  type IntegrationStatusResult,
} from "./integrations-registry";

export type BuyerTier = "certified" | "beta" | "internal";

const CERTIFIED_IDS = new Set([
  "vapi",
  "twilio",
  "stripe",
  "resend",
  "google-workspace",
  "microsoft-365",
  "hubspot",
  "slack",
  "shopify",
  "elevenlabs",
]);

const BETA_IDS = new Set([
  "salesforce",
  "docusign",
  "apollo",
  "meta",
  "zoom",
  "x",
  "x-ads",
  "yahoo",
  "liveavatar",
  "heygen",
]);

export function buyerTierForIntegration(id: string): BuyerTier {
  if (CERTIFIED_IDS.has(id)) return "certified";
  if (BETA_IDS.has(id)) return "beta";
  return "internal";
}

export type CertifiedIntegrationPublic = {
  id: string;
  label: string;
  buyer_tier: BuyerTier;
  status: IntegrationStatusResult["status"];
  certified: boolean;
  last_checked_at: string;
};

export async function getCertifiedIntegrationsPublic(): Promise<CertifiedIntegrationPublic[]> {
  const status = getIntegrationsStatus();
  const now = new Date().toISOString();
  return status
    .filter((s) => buyerTierForIntegration(s.id) !== "internal")
    .map((s) => ({
      id: s.id,
      label: s.label,
      buyer_tier: buyerTierForIntegration(s.id),
      status: s.status,
      certified: buyerTierForIntegration(s.id) === "certified" && s.status === "configured",
      last_checked_at: now,
    }));
}

export function extendIntegrationsRegistryDocs(): void {
  void INTEGRATIONS;
}
