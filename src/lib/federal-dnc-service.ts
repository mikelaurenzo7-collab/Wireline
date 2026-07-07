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

function isDncScrubProvider(apiUrl: string): boolean {
  const provider = process.env.FEDERAL_DNC_PROVIDER?.trim().toLowerCase();
  if (provider === "dncscrub") return true;
  try {
    return new URL(apiUrl).hostname.toLowerCase().includes("dncscrub.com");
  } catch {
    return apiUrl.toLowerCase().includes("dncscrub.com");
  }
}

/** US 10-digit NANP for DNCScrub scrub requests. */
export function normalizeUsPhone10(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

const DNCSCRUB_FEDERAL_RESULT_CODES = new Set(["D", "DNCL", "FED", "FEDERAL", "NDNC"]);

function isDncScrubFederalListed(resultCode: unknown): boolean {
  if (typeof resultCode !== "string" || !resultCode.trim()) return false;
  const normalized = resultCode.trim().toUpperCase();
  if (DNCSCRUB_FEDERAL_RESULT_CODES.has(normalized)) return true;
  return normalized.startsWith("D") && normalized.length <= 4;
}

type DncScrubRow = { ResultCode?: string; resultCode?: string };

function parseDncScrubListed(payload: unknown): boolean {
  if (!Array.isArray(payload) || payload.length === 0) return false;
  const row = payload[0] as DncScrubRow;
  return isDncScrubFederalListed(row.ResultCode ?? row.resultCode);
}

function buildDncScrubRequestUrl(apiUrl: string, phone10: string): string {
  const url = new URL(apiUrl);
  url.searchParams.set("phoneList", phone10);
  url.searchParams.set("version", "5");
  url.searchParams.set("output", "json");
  return url.toString();
}

async function lookupFederalDncDncScrub(
  apiUrl: string,
  apiKey: string,
  phone: string,
  checked_at: string,
): Promise<FederalDncLookupResult> {
  const phone10 = normalizeUsPhone10(phone);
  if (!phone10) {
    log.warn("federal DNC dncscrub: invalid US phone for scrub", { phone });
    return { listed: true, source: "error", checked_at };
  }

  const scrubUrl = buildDncScrubRequestUrl(apiUrl, phone10);
  const response = await fetch(scrubUrl, {
    method: "GET",
    headers: {
      loginId: apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    log.warn("federal DNC dncscrub returned non-OK", { status: response.status });
    return { listed: true, source: "error", checked_at };
  }

  const data = (await response.json()) as unknown;
  return { listed: parseDncScrubListed(data), source: "vendor", checked_at };
}

async function lookupFederalDncGenericPost(
  apiUrl: string,
  apiKey: string,
  phone: string,
  checked_at: string,
): Promise<FederalDncLookupResult> {
  const response = await fetch(apiUrl, {
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
  if (!vendorConfigured || !apiKey || !apiUrl) {
    return { listed: false, source: "unconfigured", checked_at };
  }

  try {
    if (isDncScrubProvider(apiUrl)) {
      return await lookupFederalDncDncScrub(apiUrl, apiKey, phone, checked_at);
    }
    return await lookupFederalDncGenericPost(apiUrl, apiKey, phone, checked_at);
  } catch (error) {
    log.warn("federal DNC lookup failed", { error: String(error) });
    return { listed: true, source: "error", checked_at };
  }
}

export async function isFederalDncListed(phone: string): Promise<boolean> {
  return (await lookupFederalDnc(phone)).listed;
}
