/**
 * Buyer-facing integration configuration. The legacy certification endpoint
 * has no persisted operational verification receipts; env presence must never
 * be presented as proof that credentials or provider workflows work.
 */
import {
  INTEGRATIONS,
  getIntegrationsStatus,
  type IntegrationStatusResult,
} from "./integrations-registry";

export type BuyerTier = "supported" | "beta" | "internal";

const SUPPORTED_IDS = new Set([
  "openai",
  "twilio",
  "stripe",
  "resend",
  "google-workspace",
  "microsoft-365",
  "hubspot",
  "slack",
  "shopify",
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
]);

export function buyerTierForIntegration(id: string): BuyerTier {
  if (SUPPORTED_IDS.has(id)) return "supported";
  if (BETA_IDS.has(id)) return "beta";
  return "internal";
}

export type CertifiedIntegrationPublic = {
  id: string;
  label: string;
  buyer_tier: BuyerTier;
  status: IntegrationStatusResult["status"];
  certified: false;
  last_checked_at: null;
  configuration_checked_at: string;
  verification_status: "not_performed";
};

export async function getCertifiedIntegrationsPublic(): Promise<CertifiedIntegrationPublic[]> {
  const status = getIntegrationsStatus();
  const now = new Date().toISOString();
  return status
    .filter((s) => buyerTierForIntegration(s.id) !== "internal")
    .map((s): CertifiedIntegrationPublic => ({
      id: s.id,
      label: s.label,
      buyer_tier: buyerTierForIntegration(s.id),
      status: s.status,
      certified: false,
      last_checked_at: null,
      configuration_checked_at: now,
      verification_status: "not_performed",
    }));
}

export function extendIntegrationsRegistryDocs(): void {
  void INTEGRATIONS;
}
