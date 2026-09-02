/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";
import {
  externalEntityActionPolicyForUser,
  liveExternalActionPolicyForUser,
  type ExternalEntityTarget,
} from "./account-environment-policy";

/**
 * Apollo.io Lead Intelligence Service.
 *
 * Two auth modes, picked at call site:
 *
 *   - **Per-tenant OAuth:** when a `userId` is supplied, we look up
 *     `wireline_crm_connections` for `provider='apollo'` and use that
 *     tenant's own Apollo workspace token. Their seat, their quota,
 *     their bill. Tokens refresh automatically when within 60s of
 *     expiry.
 *   - **Platform fallback:** when no tenant has connected (or when an
 *     internal job calls without a userId), we fall back to the
 *     `APOLLO_API_KEY` env var so demo accounts and Account Holder-side ops
 *     still work without forcing every tenant to connect.
 *
 * Apollo OAuth flow (authorization_code):
 *   1. Frontend opens `getApolloAuthUrl(redirect, state)` in a popup.
 *   2. User authorizes, Apollo redirects to our callback with `?code=`.
 *   3. `exchangeApolloCode(code, redirect)` swaps for access_token +
 *      refresh_token.
 *   4. Tokens stored encrypted in `wireline_crm_connections`.
 *   5. Subsequent searchLeads/enrichLead calls hydrate the token via
 *      `getApolloAccessToken(userId)`.
 */

export interface ApolloContact {
  apollo_id?: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  phone_source?: "person" | "organization";
}

export interface ApolloSearchParams {
  /** Job titles to target, e.g. ["CEO", "VP of Sales", "Owner"] */
  titles?: string[];
  /** Industries to target, e.g. ["Real Estate", "Insurance", "Finance"] */
  industries?: string[];
  /** Headcount ranges, e.g. ["1,10", "11,50"] */
  employee_ranges?: string[];
  /** US states to target, e.g. ["TX", "FL"] */
  states?: string[];
  /** Max results to pull per search */
  limit?: number;
}

type ApolloAuth = {
  header: Record<string, string>;
  source: "tenant" | "platform";
};

export class ApolloSpendAdmissionError extends Error {
  readonly code: "SPEND_CAP_REACHED" | "SPEND_GUARD_UNAVAILABLE";

  constructor(code: "SPEND_CAP_REACHED" | "SPEND_GUARD_UNAVAILABLE") {
    super(
      code === "SPEND_CAP_REACHED"
        ? "Provider spend guard has reached its monthly limit."
        : "Provider spend guard could not verify available budget.",
    );
    this.name = "ApolloSpendAdmissionError";
    this.code = code;
  }
}

const APOLLO_CURRENT_API_BASE = "https://api.apollo.io/api/v1";
const APOLLO_LEGACY_API_BASE = "https://api.apollo.io/v1";
const APOLLO_AUTH = "https://app.apollo.io/#/oauth/authorize";
const APOLLO_TOKEN = "https://app.apollo.io/api/v1/oauth/token";
const APOLLO_OAUTH_PROFILE = "https://app.apollo.io/api/v1/users/api_profile";

// ────────────────────────────────────────────────────────────────────
//  OAuth Configuration
// ────────────────────────────────────────────────────────────────────

/** Platform can run prospecting via the shared APOLLO_API_KEY (no per-tenant OAuth). */
export function apolloPlatformConfigured(): boolean {
  return (
    !!process.env.APOLLO_API_KEY?.trim() ||
    !!(process.env.APOLLO_CLIENT_ID && process.env.APOLLO_CLIENT_SECRET)
  );
}

/** True when Admin → Integrations can start the Apollo OAuth popup (per-tenant workspace). */
export function apolloOAuthConfigured(): boolean {
  return !!(process.env.APOLLO_CLIENT_ID && process.env.APOLLO_CLIENT_SECRET);
}

/**
 * Apollo's published scopes. We request the minimum needed for
 * search + enrichment + read-only contact lookup. Adjusted per
 * Apollo's docs at app.apollo.io/oauth_scopes. Apollo accepts
 * space-separated scope strings.
 */
const APOLLO_SCOPES = [
  "read_user_profile",
  "mixed_companies_search",
  "mixed_people_api_search",
  "people_bulk_match",
  "people_match",
].join(" ");

export function getApolloAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.APOLLO_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: APOLLO_SCOPES,
    state,
  });
  return `${APOLLO_AUTH}?${params.toString()}`;
}

export async function exchangeApolloCode(
  code: string,
  redirectUri: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: process.env.APOLLO_CLIENT_ID!,
    client_secret: process.env.APOLLO_CLIENT_SECRET!,
  });
  const response = await fetchWithTimeout(
    APOLLO_TOKEN,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    10_000,
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Apollo token exchange failed: ${response.status} ${errText}`);
  }
  return response.json();
}

async function refreshApolloToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.APOLLO_CLIENT_ID!,
    client_secret: process.env.APOLLO_CLIENT_SECRET!,
  });
  const response = await fetchWithTimeout(
    APOLLO_TOKEN,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    10_000,
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Apollo refresh failed: ${response.status} ${errText}`);
  }
  return response.json();
}

/**
 * Look up the tenant's Apollo access token, refreshing it if
 * within 60s of expiry. Returns null when the tenant has not
 * connected Apollo (callers fall back to APOLLO_API_KEY).
 */
async function getApolloAccessToken(userId: string): Promise<string | null> {
  try {
    const [row] = await drizzle
      .select()
      .from(schema.crmConnections)
      .where(
        and(
          eq(schema.crmConnections.userId, userId),
          eq(schema.crmConnections.provider, "apollo"),
          eq(schema.crmConnections.active, true),
        ),
      )
      .limit(1);

    if (!row) return null;

    const now = Date.now();
    const expiresAtMs = row.expiresAt ? new Date(row.expiresAt).getTime() : 0;
    const stillValid = expiresAtMs - now > 60_000;

    if (stillValid) {
      return decryptSecret(row.accessToken);
    }

    if (!row.refreshToken) return decryptSecret(row.accessToken);

    const refreshed = await refreshApolloToken(decryptSecret(row.refreshToken));
    const newAccess = encryptSecret(refreshed.access_token);
    const newRefresh = encryptSecret(refreshed.refresh_token || row.refreshToken);
    const newExpiresAt = new Date(now + refreshed.expires_in * 1000);

    await drizzle
      .update(schema.crmConnections)
      .set({
        accessToken: newAccess,
        refreshToken: newRefresh,
        expiresAt: newExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.crmConnections.id, row.id));

    return refreshed.access_token;
  } catch (err) {
    log.warn("Apollo token hydration failed; falling back to env key", {
      userId,
      error: getErrorMessage(err),
    });
    return null;
  }
}

/**
 * Resolve the auth header for a given Apollo call. Per-tenant OAuth
 * token wins; platform `APOLLO_API_KEY` is the fallback.
 *
 * Returns `null` when neither path is configured — callers should
 * treat this as "Apollo is offline" and skip gracefully.
 */
async function getApolloAuth(userId?: string): Promise<ApolloAuth | null> {
  if (userId) {
    const token = await getApolloAccessToken(userId);
    if (token) return { header: { Authorization: `Bearer ${token}` }, source: "tenant" };
  }
  const apiKey = process.env.APOLLO_API_KEY;
  if (apiKey) return { header: { "x-api-key": apiKey }, source: "platform" };
  return null;
}

/**
 * Resolve whether this tenant can actually make an Apollo data call. OAuth
 * application credentials alone are not sufficient: the tenant needs a live
 * grant or the platform needs its shared API key.
 */
export async function apolloReadyForUser(userId: string): Promise<boolean> {
  if (!(await tenantApolloAllowed(userId, "apollo_readiness"))) return false;
  return !!(await getApolloAuth(userId));
}

/**
 * Reserve platform-funded Apollo spend before the provider request. A tenant's
 * own OAuth connection spends their Apollo credits, so only the shared-key
 * fallback is admitted against BotBound's tenant spend envelope.
 */
async function fetchApolloWithSpend(
  url: string,
  init: RequestInit,
  auth: ApolloAuth,
  userId: string | undefined,
  purpose: string,
): Promise<Response> {
  if (auth.source !== "platform" || !userId) return fetch(url, init);

  let accounting: typeof import("../middleware/audit-middleware");
  try {
    accounting = await import("../middleware/audit-middleware");
  } catch (error) {
    log.error("Apollo spend guard failed to load", { purpose, error: getErrorMessage(error) });
    throw new ApolloSpendAdmissionError("SPEND_GUARD_UNAVAILABLE");
  }

  const decision = await accounting.reservePlatformCostRecord({
    userId,
    action: `platform.enrichment.${purpose}`,
    provider: "apollo",
    model: "apollo-api",
    costUsd: accounting.platformCostReserveUsd("apollo_enrichment"),
    requestMeta: { purpose },
  });
  if (!decision.reserved) {
    throw new ApolloSpendAdmissionError(
      decision.reason === "cap_reached" ? "SPEND_CAP_REACHED" : "SPEND_GUARD_UNAVAILABLE",
    );
  }

  let request: Promise<Response>;
  try {
    request = fetch(url, init);
  } catch (error) {
    await accounting.releasePlatformCostReservation(decision.reservation).catch((releaseError) =>
      log.error("Apollo spend reservation release failed", {
        purpose,
        error: getErrorMessage(releaseError),
      }),
    );
    throw error;
  }

  let response: Response;
  try {
    response = await request;
  } catch (error) {
    await accounting.markPlatformCostReservationAmbiguous(decision.reservation);
    throw error;
  }

  await accounting.commitPlatformCostReservation(decision.reservation).catch((error) =>
    log.error("Apollo spend reservation commit telemetry failed", {
      purpose,
      error: getErrorMessage(error),
    }),
  );
  return response;
}

const APOLLO_TARGET_LIMIT = 20;

function boundedStrings(values: unknown, maxLength: number): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const bounded = value.trim().slice(0, maxLength);
    const key = bounded.toLocaleLowerCase("en-US");
    if (!bounded || seen.has(key)) continue;
    seen.add(key);
    result.push(bounded);
    if (result.length >= APOLLO_TARGET_LIMIT) break;
  }
  return result;
}

function boundedProviderString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeApolloPhone(value: unknown): string {
  const raw = boundedProviderString(value, 40);
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : "";
}

function boundedProviderUrl(value: unknown): string | undefined {
  const raw = boundedProviderString(value, 500);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function disconnectApollo(userId: string): Promise<void> {
  const { revokeCrmProviderTokens } = await import("./oauth-provider-revocation");
  await revokeCrmProviderTokens(userId, "apollo");
  await drizzle
    .update(schema.crmConnections)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "apollo")),
    );
}

// ────────────────────────────────────────────────────────────────────
//  Data calls
// ────────────────────────────────────────────────────────────────────

async function tenantApolloAllowed(
  userId: string | undefined,
  action: string,
  target?: ExternalEntityTarget,
): Promise<boolean> {
  // Calls without a tenant identity are explicit platform operations (for
  // example the public showcase). Do not silently bind them to a demo tenant.
  if (!userId) return true;
  try {
    const policy = await liveExternalActionPolicyForUser(userId);
    if (!policy.allowed) {
      log.warn("Apollo action blocked by account environment", {
        userId,
        action,
        accountEnvironment: policy.environment ?? "missing",
        code: policy.code,
      });
      return false;
    }
    if (target) {
      const entityPolicy = await externalEntityActionPolicyForUser(userId, target);
      if (!entityPolicy.allowed) {
        log.warn("Apollo action blocked for showcase entity", {
          userId,
          action,
          reason: entityPolicy.reason,
          code: entityPolicy.code,
        });
        return false;
      }
    }
    return true;
  } catch (error) {
    log.error("Apollo account-environment lookup failed, failing closed", {
      userId,
      action,
      error: getErrorMessage(error),
    });
    return false;
  }
}

/**
 * Search Apollo.io for new leads matching the provided ICP criteria.
 *
 * Pass `userId` to use that tenant's OAuth token; omit to use the
 * platform `APOLLO_API_KEY` fallback. Returns `[]` when Apollo is unreachable
 * or unauthorized. Spend-admission failures throw so callers cannot mistake a
 * budget block for a successful empty search.
 */
export async function searchLeads(
  params: ApolloSearchParams,
  userId?: string,
): Promise<ApolloContact[]> {
  if (!(await tenantApolloAllowed(userId, "apollo_lead_search"))) return [];
  const auth = await getApolloAuth(userId);
  if (!auth) {
    log.warn("Apollo not configured, skipping lead search");
    return [];
  }

  try {
    const titles = boundedStrings(params.titles, 120);
    if (titles.length === 0) {
      log.warn("Apollo lead search skipped because no target titles were supplied", { userId });
      return [];
    }

    const requestedLimit = Number.isFinite(params.limit) ? Number(params.limit) : 25;
    const limit = Math.max(1, Math.min(25, Math.trunc(requestedLimit)));
    const industries = boundedStrings(params.industries, 120);
    const states = boundedStrings(params.states, 80);
    const employeeRanges = boundedStrings(params.employee_ranges, 24).filter((value) =>
      /^\d{1,7},\d{1,7}$/.test(value),
    );
    let organizationIds: string[] = [];

    if (industries.length > 0) {
      // Apollo's organization search accepts free-text keyword tags. The
      // people-search industry field expects internal tag IDs, so passing
      // saved labels there would silently drop targeting or return 422.
      const organizationQuery = new URLSearchParams({ per_page: "100", page: "1" });
      for (const industry of industries) {
        organizationQuery.append("q_organization_keyword_tags[]", industry);
      }
      for (const range of employeeRanges) {
        organizationQuery.append("organization_num_employees_ranges[]", range);
      }
      const organizationResponse = await fetchApolloWithSpend(
        `${APOLLO_CURRENT_API_BASE}/mixed_companies/search?${organizationQuery.toString()}`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15_000),
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            ...auth.header,
          },
        },
        auth,
        userId,
        "organization_search",
      );

      if (!organizationResponse.ok) {
        throw new Error(
          `Apollo organization search error: ${organizationResponse.status} ${organizationResponse.statusText}`,
        );
      }

      const organizationData = await organizationResponse.json();
      const organizations = (organizationData.organizations || organizationData.accounts || []) as
        Array<{ id?: unknown; organization_id?: unknown }> | undefined;
      organizationIds = (organizations || [])
        .map((organization) =>
          boundedProviderString(organization.id || organization.organization_id, 128),
        )
        .filter(Boolean)
        .slice(0, 100);

      // Never broaden an industry-targeted search when Apollo found no matching
      // organizations. An empty filter would turn a precise request into a
      // platform-wide people search.
      if (organizationIds.length === 0) return [];
    }

    const response = await fetchApolloWithSpend(
      `${APOLLO_CURRENT_API_BASE}/mixed_people/api_search`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          ...auth.header,
        },
        body: JSON.stringify({
          person_titles: titles,
          person_locations: states.map((state) => `${state}, United States`),
          organization_num_employees_ranges: employeeRanges.length > 0 ? employeeRanges : ["1,50"],
          ...(organizationIds.length > 0 ? { organization_ids: organizationIds } : {}),
          per_page: limit,
          page: 1,
        }),
      },
      auth,
      userId,
      "lead_search",
    );

    if (!response.ok) {
      throw new Error(`Apollo API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const people = ((data.people || []) as any[]).filter((person) => person?.id).slice(0, limit);
    if (people.length === 0) return [];

    // Apollo's current People Search intentionally returns discovery metadata
    // only. Hydrate the selected IDs through the documented bulk enrichment
    // endpoint. Phone reveal is not requested here because that flow is
    // asynchronous and requires a webhook; Lead Hunt uses a returned person
    // number when present, otherwise the matched company's published line.
    const hydratedPeople: any[] = [];
    for (let offset = 0; offset < people.length; offset += 10) {
      const batch = people.slice(offset, offset + 10);
      const enrichmentResponse = await fetchApolloWithSpend(
        `${APOLLO_CURRENT_API_BASE}/people/bulk_match?reveal_personal_emails=false&reveal_phone_number=false`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15_000),
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            ...auth.header,
          },
          body: JSON.stringify({ details: batch.map((person) => ({ id: String(person.id) })) }),
        },
        auth,
        userId,
        "lead_hunt_enrichment",
      );
      if (!enrichmentResponse.ok) {
        throw new Error(
          `Apollo people enrichment error: ${enrichmentResponse.status} ${enrichmentResponse.statusText}`,
        );
      }
      const enrichmentData = await enrichmentResponse.json();
      hydratedPeople.push(...((enrichmentData.matches || []) as any[]));
    }

    const byId = new Map(
      hydratedPeople
        .filter((person) => person?.id)
        .map((person) => [String(person.id), person] as const),
    );
    const seen = new Set<string>();
    const results: ApolloContact[] = [];

    for (const summary of people) {
      const person = byId.get(String(summary.id)) || summary;
      const personPhone =
        person.phone_numbers?.find((entry: any) => entry?.sanitized_number)?.sanitized_number ||
        person.sanitized_phone ||
        "";
      const organizationPhone =
        person.organization?.phone || person.organization?.sanitized_phone || "";
      const phone = normalizeApolloPhone(personPhone || organizationPhone);
      if (!phone) continue;

      const id = boundedProviderString(person.id || summary.id, 128);
      if (!id) continue;
      const dedupeKey = `${id}:${phone.replace(/\D+/g, "")}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const email =
        person.email_status === "verified" ? boundedProviderString(person.email, 320) : "";
      results.push({
        apollo_id: id,
        first_name: boundedProviderString(person.first_name || summary.first_name, 120),
        last_name: boundedProviderString(person.last_name, 120),
        email,
        phone,
        phone_source: personPhone ? "person" : "organization",
        title: boundedProviderString(person.title || summary.title, 200),
        company: boundedProviderString(
          person.organization?.name || summary.organization?.name,
          200,
        ),
        linkedin_url: boundedProviderUrl(person.linkedin_url),
        city: boundedProviderString(person.city, 120) || undefined,
        state: boundedProviderString(person.state, 120) || undefined,
      });
    }

    return results;
  } catch (err) {
    if (err instanceof ApolloSpendAdmissionError) throw err;
    log.error("Apollo lead search failed", { error: getErrorMessage(err) });
    return [];
  }
}

/**
 * Enrich a single lead with Apollo data (name, company, title from phone).
 */
export async function enrichLead(
  phone: string,
  userId?: string,
): Promise<Partial<ApolloContact> | null> {
  if (!(await tenantApolloAllowed(userId, "apollo_lead_enrichment", { phone }))) return null;
  const auth = await getApolloAuth(userId);
  if (!auth) return null;

  try {
    const response = await fetchApolloWithSpend(
      `${APOLLO_LEGACY_API_BASE}/people/match`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          ...auth.header,
        },
        body: JSON.stringify({ phone_number: phone, reveal_phone_number: false }),
      },
      auth,
      userId,
      "lead_match",
    );

    if (!response.ok) return null;

    const data = await response.json();
    const p = data.person;
    if (!p) return null;
    return {
      first_name: boundedProviderString(p.first_name, 120),
      last_name: boundedProviderString(p.last_name, 120),
      title: boundedProviderString(p.title, 200),
      company: boundedProviderString(p.organization?.name, 200),
      linkedin_url: boundedProviderUrl(p.linkedin_url),
    };
  } catch (err) {
    if (err instanceof ApolloSpendAdmissionError) throw err;
    log.error("Apollo enrichment failed", { error: getErrorMessage(err) });
    return null;
  }
}

/**
 * Probe the tenant's connection by calling Apollo's health endpoint
 * with their token. Used by the OAuth callback to confirm the
 * connection is live before reporting success to the UI.
 */
export async function getApolloUserInfo(
  accessToken: string,
): Promise<{ email?: string; team?: string } | null> {
  try {
    const r = await fetchWithTimeout(
      APOLLO_OAUTH_PROFILE,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      10_000,
    );
    if (!r.ok) return null;
    const data = (await r.json()) as any;
    const user = data.user && typeof data.user === "object" ? data.user : data;
    return {
      email: user.email || user.user_email || undefined,
      team: user.team_name || user.team || user.organization_name || undefined,
    };
  } catch (err) {
    log.warn("Apollo user info fetch failed", { error: getErrorMessage(err) });
    return null;
  }
}
