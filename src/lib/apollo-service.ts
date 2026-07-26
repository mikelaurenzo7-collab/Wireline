/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";

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
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
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

const APOLLO_BASE = "https://api.apollo.io/v1";
const APOLLO_AUTH = "https://app.apollo.io/oauth/authorize";
const APOLLO_TOKEN = "https://app.apollo.io/api/v1/oauth/token";

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
const APOLLO_SCOPES = ["read_contacts", "read_accounts", "read_users"].join(" ");

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
async function getApolloAuth(userId?: string): Promise<{ header: Record<string, string> } | null> {
  if (userId) {
    const token = await getApolloAccessToken(userId);
    if (token) return { header: { Authorization: `Bearer ${token}` } };
  }
  const apiKey = process.env.APOLLO_API_KEY;
  if (apiKey) return { header: { "x-api-key": apiKey } };
  return null;
}

export async function disconnectApollo(userId: string): Promise<void> {
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

/**
 * Search Apollo.io for new leads matching the provided ICP criteria.
 *
 * Pass `userId` to use that tenant's OAuth token; omit to use the
 * platform `APOLLO_API_KEY` fallback. Returns `[]` when Apollo is
 * unreachable or unauthorized — never throws into the call path.
 */
export async function searchLeads(
  params: ApolloSearchParams,
  userId?: string,
): Promise<ApolloContact[]> {
  const auth = await getApolloAuth(userId);
  if (!auth) {
    log.warn("Apollo not configured — skipping lead search");
    return [];
  }

  try {
    const response = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        ...auth.header,
      },
      body: JSON.stringify({
        person_titles: params.titles || [],
        person_locations: params.states?.map((s) => `${s}, United States`) || [],
        organization_num_employees_ranges: params.employee_ranges || ["1,50"],
        organization_industry_tag_ids: [],
        per_page: params.limit || 25,
        page: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Apollo API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const people = (data.people || []) as any[];

    return people
      .map(
        (p: any) =>
          ({
            first_name: p.first_name || "",
            last_name: p.last_name || "",
            email: p.email || "",
            phone: p.phone_numbers?.[0]?.sanitized_number || p.sanitized_phone || "",
            title: p.title || "",
            company: p.organization?.name || "",
            linkedin_url: p.linkedin_url || undefined,
            city: p.city || undefined,
            state: p.state || undefined,
          }) as ApolloContact,
      )
      .filter((c: ApolloContact) => c.phone);
  } catch (err) {
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
  const auth = await getApolloAuth(userId);
  if (!auth) return null;

  try {
    const response = await fetch(`${APOLLO_BASE}/people/match`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Content-Type": "application/json",
        ...auth.header,
      },
      body: JSON.stringify({ phone_number: phone, reveal_phone_number: false }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const p = data.person;
    if (!p) return null;

    return {
      first_name: p.first_name,
      last_name: p.last_name,
      title: p.title,
      company: p.organization?.name,
      linkedin_url: p.linkedin_url,
    };
  } catch (err) {
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
      `${APOLLO_BASE}/auth/health`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      10_000,
    );
    if (!r.ok) return null;
    const data = (await r.json()) as any;
    return {
      email: data.user_email || data.email || undefined,
      team: data.team_name || data.team || undefined,
    };
  } catch (err) {
    log.warn("Apollo user info fetch failed", { error: getErrorMessage(err) });
    return null;
  }
}
