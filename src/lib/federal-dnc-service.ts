/**
 * Federal DNC registry lookup — vendor-neutral stub behind env configuration.
 * Marketing/campaign outbound hard-blocks when the vendor is not configured.
 */
import { log } from "./server-context";

export type FederalDncLookupResult = {
  listed: boolean;
  source: "vendor" | "unconfigured" | "error";
  checked_at: string;
};

export function isFederalDncVendorConfigured(): boolean {
  const apiKey = process.env.FEDERAL_DNC_API_KEY?.trim();
  const apiUrl = process.env.FEDERAL_DNC_API_URL?.trim();
  return Boolean(apiKey && apiUrl);
}

export type FederalDncMarketingGate = {
  allowed: boolean;
  code?: "FEDERAL_DNC_NOT_CONFIGURED";
  message?: string;
};

/** Marketing and campaign dials require a configured federal DNC vendor in production. */
export function assertFederalDncForMarketing(): FederalDncMarketingGate {
  if (isFederalDncVendorConfigured()) return { allowed: true };
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  if (!isProd && process.env.FEDERAL_DNC_ALLOW_UNCONFIGURED === "true") {
    return { allowed: true };
  }
  return {
    allowed: false,
    code: "FEDERAL_DNC_NOT_CONFIGURED",
    message:
      "Federal DNC scrub is required for marketing outbound. Configure FEDERAL_DNC_API_URL and FEDERAL_DNC_API_KEY before dialing campaigns.",
  };
}

export async function lookupFederalDnc(phone: string): Promise<FederalDncLookupResult> {
  const checked_at = new Date().toISOString();
  const vendorConfigured = isFederalDncVendorConfigured();
  const apiKey = process.env.FEDERAL_DNC_API_KEY?.trim();
  const apiUrl = process.env.FEDERAL_DNC_API_URL?.trim();
  if (!vendorConfigured) {
    return { listed: false, source: "unconfigured", checked_at };
  }

  try {
    const response = await fetch(apiUrl!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      log.warn("federal DNC vendor returned non-OK", { status: response.status });
      return { listed: true, source: "error", checked_at };
    }
    const data = (await response.json()) as { listed?: boolean };
    return { listed: data.listed === true, source: "vendor", checked_at };
  } catch (error) {
    log.warn("federal DNC lookup failed", { error: String(error) });
    return { listed: true, source: "error", checked_at };
  }
}

export async function isFederalDncListed(phone: string): Promise<boolean> {
  return (await lookupFederalDnc(phone)).listed;
}
