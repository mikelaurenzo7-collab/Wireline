/**
 * Federal DNC registry lookup behind a pluggable provider.
 *
 * The default provider is the configured FEDERAL_DNC_API_URL / KEY
 * (DNCScrub-style). See dnc-provider.ts for the adapter seam. No in-house
 * FTC file screen ships here.
 *
 * Campaigns and other bulk sales fail closed when that provider is not
 * configured. One-off sales calls and texts do not. They require a one-time
 * workspace attestation, and they are screened only when a provider and a
 * seller account number are both configured. Provider errors still fail closed.
 */
import { BULK_SALES_SCREENING_REQUIRED_MESSAGE } from "./outbound-compliance-copy";
import { getDncProvider, normalizeUsPhone10 } from "./dnc-provider";
import { isFederalDncVendorConfigured } from "./federal-dnc-config";
import { log } from "./server-context";

export { isFederalDncVendorConfigured, normalizeUsPhone10 };

export type FederalDncLookupResult = {
  listed: boolean;
  source: "vendor" | "unconfigured" | "error";
  checked_at: string;
};

/** Seller account number, sent as the vendor project id when present. */
export type FederalDncLookupOptions = { vendorProjectId?: string };

export type FederalDncMarketingGate =
  | { allowed: true; configured: true }
  | {
      allowed: false;
      configured: false;
      code: "FEDERAL_DNC_NOT_CONFIGURED";
      message: string;
    };

/**
 * Bulk sales (campaigns, imports, sequences, automations) require a configured
 * provider. One-off sales does not call this. A missing or unimplemented
 * provider stays closed. No tenant bypass turns that into permission to dial.
 */
export function assertFederalDncForMarketing(): FederalDncMarketingGate {
  if (getDncProvider().configured()) return { allowed: true, configured: true };
  return {
    allowed: false,
    configured: false,
    code: "FEDERAL_DNC_NOT_CONFIGURED",
    message: BULK_SALES_SCREENING_REQUIRED_MESSAGE,
  };
}

export async function lookupFederalDnc(
  phone: string,
  options: FederalDncLookupOptions = {},
): Promise<FederalDncLookupResult> {
  const checked_at = new Date().toISOString();
  const provider = getDncProvider();
  if (!provider.configured()) {
    return { listed: false, source: "unconfigured", checked_at };
  }
  try {
    const hit = await provider.lookup(phone, { san: options.vendorProjectId });
    return {
      listed: hit.listed,
      source: hit.source === "vendor" ? "vendor" : hit.source === "unconfigured" ? "unconfigured" : "error",
      checked_at: hit.listDate ?? checked_at,
    };
  } catch (error) {
    log.warn("federal DNC lookup failed", { error: String(error) });
    return { listed: true, source: "error", checked_at };
  }
}

export async function isFederalDncListed(
  phone: string,
  options: FederalDncLookupOptions = {},
): Promise<boolean> {
  return (await lookupFederalDnc(phone, options)).listed;
}
