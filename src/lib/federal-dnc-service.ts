/**
 * Federal DNC registry lookup — vendor-neutral stub behind env configuration.
 * When unconfigured, outbound paths continue with is_federal_dnc=false (honest gap).
 */
import { log } from "./server-context";

export type FederalDncLookupResult = {
  listed: boolean;
  source: "vendor" | "unconfigured" | "error";
  checked_at: string;
};

export async function lookupFederalDnc(phone: string): Promise<FederalDncLookupResult> {
  const checked_at = new Date().toISOString();
  const apiKey = process.env.FEDERAL_DNC_API_KEY?.trim();
  const apiUrl = process.env.FEDERAL_DNC_API_URL?.trim();
  const vendorConfigured = Boolean(apiKey && apiUrl);
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
