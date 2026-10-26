/**
 * Pluggable Do Not Call lookup.
 *
 * The default provider speaks the configured FEDERAL_DNC_API_URL / KEY
 * (DNCScrub when the URL or FEDERAL_DNC_PROVIDER says so, otherwise a JSON POST).
 * A future vendor adapter or in-house registry screen can register with
 * registerDncProvider. This module does not ship an in-house FTC file screen.
 *
 * Sales campaigns fail closed when the selected provider is not configured.
 * One-off sales calls and texts do not require a provider; the dial gate
 * decides that. A configured provider still fails closed on transport errors.
 */
import { isFederalDncVendorConfigured } from "./federal-dnc-config";
import { parseDncScrubResult } from "./federal-dnc-result.mjs";
import { log } from "./server-context";

export type DncLookupOptions = {
  /** Seller registry account number, when the workspace saved one. */
  san?: string;
};

export type DncLookupResult = {
  listed: boolean;
  /** When the provider reports a list date. The HTTP provider uses the check time. */
  listDate: string | null;
  source: "vendor" | "unconfigured" | "error";
};

export interface DncProvider {
  readonly id: string;
  configured(): boolean;
  lookup(number: string, options?: DncLookupOptions): Promise<DncLookupResult>;
}

const extraProviders = new Map<string, DncProvider>();

/** Register a future vendor or in-house adapter. Does not screen by itself. */
export function registerDncProvider(provider: DncProvider): void {
  extraProviders.set(provider.id, provider);
}

/** US 10-digit NANP for DNCScrub scrub requests. */
export function normalizeUsPhone10(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
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

function buildDncScrubRequestUrl(apiUrl: string, phone10: string, san?: string): string {
  const url = new URL(apiUrl);
  url.searchParams.set("phoneList", phone10);
  url.searchParams.set("version", "5");
  url.searchParams.set("output", "json");
  if (san) url.searchParams.set("projId", san);
  return url.toString();
}

const federalHttpDncProvider: DncProvider = {
  id: "federal_http",
  configured: () => isFederalDncVendorConfigured(),
  async lookup(number, options) {
    const listDate = new Date().toISOString();
    const apiKey = process.env.FEDERAL_DNC_API_KEY?.trim();
    const apiUrl = process.env.FEDERAL_DNC_API_URL?.trim();
    if (!isFederalDncVendorConfigured() || !apiKey || !apiUrl) {
      return { listed: false, listDate: null, source: "unconfigured" };
    }
    const san = options?.san?.trim() || undefined;
    try {
      if (isDncScrubProvider(apiUrl)) {
        return await lookupDncScrub(apiUrl, apiKey, number, listDate, san);
      }
      return await lookupGenericPost(apiUrl, apiKey, number, listDate, san);
    } catch (error) {
      log.warn("federal DNC lookup failed", { error: String(error) });
      return { listed: true, listDate, source: "error" };
    }
  },
};

function unimplementedDncProvider(id: string): DncProvider {
  return {
    id,
    configured: () => false,
    async lookup() {
      log.warn("DNC provider is not implemented", { provider: id });
      return { listed: true, listDate: null, source: "error" };
    },
  };
}

export function getDncProvider(): DncProvider {
  const named = process.env.FEDERAL_DNC_PROVIDER?.trim().toLowerCase();
  if (named && named !== "dncscrub" && named !== "http" && named !== "federal_http") {
    return extraProviders.get(named) ?? unimplementedDncProvider(named);
  }
  return federalHttpDncProvider;
}

async function lookupDncScrub(
  apiUrl: string,
  apiKey: string,
  phone: string,
  listDate: string,
  san?: string,
): Promise<DncLookupResult> {
  const phone10 = normalizeUsPhone10(phone);
  if (!phone10) {
    log.warn("federal DNC dncscrub: invalid US phone for scrub", {
      phoneDigits: phone.replace(/\D/g, "").length,
    });
    return { listed: true, listDate, source: "error" };
  }

  const response = await fetch(buildDncScrubRequestUrl(apiUrl, phone10, san), {
    method: "GET",
    headers: { loginId: apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    log.warn("federal DNC dncscrub returned non-OK", { status: response.status });
    return { listed: true, listDate, source: "error" };
  }
  const result = parseDncScrubResult(await response.json());
  return {
    listed: result.listed,
    listDate,
    source: result.recognized ? "vendor" : "error",
  };
}

async function lookupGenericPost(
  apiUrl: string,
  apiKey: string,
  phone: string,
  listDate: string,
  san?: string,
): Promise<DncLookupResult> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(san ? { phone, san, project_id: san } : { phone }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    log.warn("federal DNC vendor returned non-OK", { status: response.status });
    return { listed: true, listDate, source: "error" };
  }
  const data = (await response.json()) as { listed?: unknown; listDate?: unknown };
  if (typeof data?.listed !== "boolean") {
    log.warn("federal DNC vendor returned an unrecognized payload, failing closed");
    return { listed: true, listDate, source: "error" };
  }
  return {
    listed: data.listed,
    listDate: typeof data.listDate === "string" && data.listDate.trim() ? data.listDate : listDate,
    source: "vendor",
  };
}
