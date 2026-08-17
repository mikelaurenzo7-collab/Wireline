/**
 * Federal DNC registry lookup — vendor-neutral stub behind env configuration.
 * Marketing/campaign outbound hard-blocks when the vendor is not configured.
 */
import { log } from "./server-context";
import { isFederalDncVendorConfigured } from "./federal-dnc-config";

export { isFederalDncVendorConfigured };

export type FederalDncLookupResult = {
  listed: boolean;
  source: "vendor" | "unconfigured" | "error";
  checked_at: string;
};

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

const DNCSCRUB_CALLABLE_RESULT_CODES = new Set(["C", "E", "G", "H", "O", "W", "X", "Y"]);

/**
 * DNCScrub v5 returns one-letter disposition codes. Only the provider's
 * documented callable outcomes may pass. D/P/B/I/M/L/F/V, blank responses,
 * malformed payloads, and future unknown codes all fail closed.
 */
function isDncScrubBlocked(resultCode: unknown): boolean {
  if (typeof resultCode !== "string" || !resultCode.trim()) return true;
  return !DNCSCRUB_CALLABLE_RESULT_CODES.has(resultCode.trim().toUpperCase());
}

type DncScrubRow = { ResultCode?: string; resultCode?: string };

function parseDncScrubListed(payload: unknown): boolean {
  if (!Array.isArray(payload) || payload.length === 0) return true;
  const row = payload[0] as DncScrubRow;
  return isDncScrubBlocked(row.ResultCode ?? row.resultCode);
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
    // Never log the raw consumer number: this runs on every marketing dial and
    // the structured log is not a compliance-safe place for subscriber PII.
    log.warn("federal DNC dncscrub: invalid US phone for scrub", {
      phoneDigits: phone.replace(/\D/g, "").length,
    });
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
  const data = (await response.json()) as { listed?: unknown };
  // Fail closed on anything that is not an explicit boolean. `listed === true`
  // silently treated a 200 with a renamed/missing field — a vendor schema
  // change, an error envelope, a proxy's HTML page — as "not listed" and let
  // the dial proceed to a registered number. The DNCScrub path already fails
  // closed on unrecognized dispositions; this path must match.
  if (typeof data?.listed !== "boolean") {
    log.warn("federal DNC vendor returned an unrecognized payload, failing closed");
    return { listed: true, source: "error", checked_at };
  }
  return { listed: data.listed, source: "vendor", checked_at };
}

export type FederalDncMarketingGate = {
  allowed: boolean;
  code?: "FEDERAL_DNC_NOT_CONFIGURED";
  message?: string;
};

export type FederalDncMarketingGateOpts = {
  /**
   * Platform owner (`OWNER_EMAIL`) may dogfood marketing/campaign outbound
   * while the Federal DNC vendor credential is still unconfigured. Tenant DNC
   * lists, TCPA consent, and quiet hours still apply. Other tenants stay
   * fail-closed.
   */
  isPlatformOwner?: boolean;
};

/** Marketing and campaign dials require a configured federal DNC vendor in production. */
export function assertFederalDncForMarketing(
  opts: FederalDncMarketingGateOpts = {},
): FederalDncMarketingGate {
  if (isFederalDncVendorConfigured()) return { allowed: true };
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  if (!isProd && process.env.FEDERAL_DNC_ALLOW_UNCONFIGURED === "true") {
    return { allowed: true };
  }
  if (opts.isPlatformOwner === true) {
    log.warn("federal DNC vendor unconfigured; platform-owner marketing allowed");
    return { allowed: true };
  }
  return {
    allowed: false,
    code: "FEDERAL_DNC_NOT_CONFIGURED",
    message:
      "Marketing dials need Federal DNC scrub enabled on this workspace. Studio and other non-marketing calls still work with your tenant DNC and TCPA rules. Ask your admin to finish Federal DNC setup before campaign dialing.",
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
