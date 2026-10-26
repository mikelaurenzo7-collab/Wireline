/**
 * Federal DNC registry lookup behind optional vendor configuration.
 *
 * Missing vendor credentials are an operations/readiness item and a hard stop
 * for marketing outbound. Non-marketing service calls retain their applicable
 * tenant DNC, opt-out, calling-hours, consent, duplicate, approval, and audit
 * controls. When a federal provider is configured, its listed results still
 * block and provider errors fail closed.
 */
import { log } from "./server-context";
import { isFederalDncVendorConfigured } from "./federal-dnc-config";
import { parseDncScrubResult } from "./federal-dnc-result.mjs";

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

/**
 * Screen with a seller's own subscription. DNCScrub attaches a seller's SAN to
 * a project; without a project the account's default project is used, which is
 * only valid for non-marketing checks.
 */
export type FederalDncLookupOptions = { vendorProjectId?: string };

function buildDncScrubRequestUrl(apiUrl: string, phone10: string, projectId?: string): string {
  const url = new URL(apiUrl);
  url.searchParams.set("phoneList", phone10);
  url.searchParams.set("version", "5");
  url.searchParams.set("output", "json");
  if (projectId) url.searchParams.set("projId", projectId);
  return url.toString();
}

async function lookupFederalDncDncScrub(
  apiUrl: string,
  apiKey: string,
  phone: string,
  checked_at: string,
  projectId?: string,
): Promise<FederalDncLookupResult> {
  const phone10 = normalizeUsPhone10(phone);
  if (!phone10) {
    log.warn("federal DNC dncscrub: invalid US phone for scrub", {
      phoneDigits: phone.replace(/\D/g, "").length,
    });
    return { listed: true, source: "error", checked_at };
  }

  const scrubUrl = buildDncScrubRequestUrl(apiUrl, phone10, projectId);
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

  const result = parseDncScrubResult(await response.json());
  return {
    listed: result.listed,
    source: result.recognized ? "vendor" : "error",
    checked_at,
  };
}

async function lookupFederalDncGenericPost(
  apiUrl: string,
  apiKey: string,
  phone: string,
  checked_at: string,
  projectId?: string,
): Promise<FederalDncLookupResult> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(projectId ? { phone, project_id: projectId } : { phone }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    log.warn("federal DNC vendor returned non-OK", { status: response.status });
    return { listed: true, source: "error", checked_at };
  }
  const data = (await response.json()) as { listed?: unknown };
  if (typeof data?.listed !== "boolean") {
    log.warn("federal DNC vendor returned an unrecognized payload, failing closed");
    return { listed: true, source: "error", checked_at };
  }
  return { listed: data.listed, source: "vendor", checked_at };
}

export type FederalDncMarketingGate =
  | { allowed: true; configured: true }
  | {
      allowed: false;
      configured: false;
      code: "FEDERAL_DNC_NOT_CONFIGURED";
      message: string;
    };

/**
 * Federal DNC configuration is mandatory for marketing outbound. Readiness may
 * keep registration on the deferred operations checklist, but no tenant or
 * environment-wide bypass can turn missing credentials into permission to dial.
 * Non-marketing service calls do not call this marketing-only assertion.
 */
export function assertFederalDncForMarketing(): FederalDncMarketingGate {
  if (isFederalDncVendorConfigured()) return { allowed: true, configured: true };
  return {
    allowed: false,
    configured: false,
    code: "FEDERAL_DNC_NOT_CONFIGURED",
    message:
      "Screening has to clear this sales outreach before it goes out. Answering calls still works.",
  };
}

export async function lookupFederalDnc(
  phone: string,
  options: FederalDncLookupOptions = {},
): Promise<FederalDncLookupResult> {
  const checked_at = new Date().toISOString();
  const projectId = options.vendorProjectId;
  const vendorConfigured = isFederalDncVendorConfigured();
  const apiKey = process.env.FEDERAL_DNC_API_KEY?.trim();
  const apiUrl = process.env.FEDERAL_DNC_API_URL?.trim();
  if (!vendorConfigured || !apiKey || !apiUrl) {
    return { listed: false, source: "unconfigured", checked_at };
  }

  try {
    if (isDncScrubProvider(apiUrl)) {
      return await lookupFederalDncDncScrub(apiUrl, apiKey, phone, checked_at, projectId);
    }
    return await lookupFederalDncGenericPost(apiUrl, apiKey, phone, checked_at, projectId);
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
