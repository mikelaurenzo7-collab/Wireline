/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";

/**
 * HubSpot CRM Service — real OAuth 2.0 authorization_code flow.
 *
 * Tokens are stored encrypted in wireline_crm_connections and
 * refreshed automatically when expired. If no connection exists
 * (Account Holder hasn't completed OAuth), every function returns no-op.
 */

const HUBSPOT_BASE = "https://api.hubapi.com";
const HUBSPOT_AUTH = "https://app.hubspot.com/oauth/authorize";
const HUBSPOT_TOKEN = "https://api.hubapi.com/oauth/v1/token";

export interface HubSpotContact {
  hs_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
}

export interface HubSpotCallLog {
  to_number: string;
  from_number?: string;
  duration_ms?: number;
  outcome?: string;
  body?: string;
  contact_id?: string;
}

interface CrmConnection {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  active: boolean | null;
}

// ────────────────────────────────────────────────────────────────────
//  OAuth Token Management
// ────────────────────────────────────────────────────────────────────

export function hsOAuthConfigured(): boolean {
  return !!(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET);
}

const HUBSPOT_SCOPES = [
  // `oauth` is HubSpot's always-required scope for OAuth apps — it
  // MUST appear in the install URL's scope param or HubSpot rejects
  // the install. The app's "Required scopes" config lists it.
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.objects.companies.read",
].join(" ");

export function getHubSpotAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: HUBSPOT_SCOPES,
    state,
  });
  return `${HUBSPOT_AUTH}?${params.toString()}`;
}

export async function exchangeHubSpotCode(
  code: string,
  redirectUri: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    code,
  });

  const r = await fetchWithTimeout(
    HUBSPOT_TOKEN,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    },
    15_000,
  );
  const data = (await r.json()) as any;
  if (!r.ok || !data.access_token) {
    throw new Error(data.message || data.error || "HubSpot token exchange failed");
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 21600,
  };
}

async function refreshHubSpotToken(
  conn: CrmConnection,
): Promise<{ access_token: string; refresh_token: string; expires_at: number }> {
  if (!conn.refreshToken) throw new Error("HubSpot refresh token is unavailable");
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
    refresh_token: decryptSecret(conn.refreshToken),
  });

  const r = await fetchWithTimeout(
    HUBSPOT_TOKEN,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    },
    15_000,
  );
  const data = (await r.json()) as any;
  if (!r.ok || !data.access_token) {
    const isTerminal =
      r.status === 400 ||
      data.error === "invalid_grant" ||
      (data.message && data.message.includes("invalid_grant"));
    const err = new Error(data.message || data.error || "HubSpot token refresh failed");
    (err as any).isTerminal = isTerminal;
    throw err;
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 21600) * 1000,
  };
}

async function getConnection(userId: string): Promise<CrmConnection | null> {
  const [data] = await drizzle
    .select({
      id: schema.crmConnections.id,
      accessToken: schema.crmConnections.accessToken,
      refreshToken: schema.crmConnections.refreshToken,
      expiresAt: schema.crmConnections.expiresAt,
      active: schema.crmConnections.active,
    })
    .from(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "hubspot")),
    )
    .limit(1);

  return data || null;
}

async function getValidToken(userId: string): Promise<string | null> {
  const conn = await getConnection(userId);
  if (!conn || conn.active === false) return null;

  if (conn.expiresAt && Date.now() < conn.expiresAt.getTime() - 60_000) {
    return decryptSecret(conn.accessToken);
  }

  try {
    const updated = await refreshHubSpotToken(conn);
    await drizzle
      .update(schema.crmConnections)
      .set({
        accessToken: encryptSecret(updated.access_token),
        refreshToken: encryptSecret(updated.refresh_token),
        expiresAt: new Date(updated.expires_at),
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.crmConnections.id, conn.id));
    return updated.access_token;
  } catch (err: any) {
    log.error("HubSpot token refresh failed", { error: getErrorMessage(err) });
    if (err.isTerminal) {
      log.warn(
        `Terminal HubSpot OAuth failure for user ${userId}. Flagging connection as inactive.`,
        { error: getErrorMessage(err) },
      );
      await drizzle
        .update(schema.crmConnections)
        .set({
          active: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.crmConnections.id, conn.id));
    }
    return null;
  }
}

function hsHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ────────────────────────────────────────────────────────────────────
//  CRM Operations
// ────────────────────────────────────────────────────────────────────

export async function searchContacts(query: string, userId?: string): Promise<HubSpotContact[]> {
  const uid = userId || "";
  const token = await getValidToken(uid);
  if (!token) {
    log.warn("HubSpot not connected — skipping contact search");
    return [];
  }

  try {
    const res = await fetchWithTimeout(
      `${HUBSPOT_BASE}/crm/v3/objects/contacts/search`,
      {
        method: "POST",
        headers: hsHeaders(token),
        body: JSON.stringify({
          query,
          limit: 10,
          properties: ["firstname", "lastname", "email", "phone", "company"],
        }),
      },
      15_000,
    );
    if (!res.ok) throw new Error(`HubSpot search error: ${res.status}`);
    const data = (await res.json()) as any;
    return ((data.results || []) as any[]).map((r: any) => ({
      hs_id: r.id,
      first_name: r.properties?.firstname || "",
      last_name: r.properties?.lastname || "",
      email: r.properties?.email || null,
      phone: r.properties?.phone || null,
      company: r.properties?.company || null,
    }));
  } catch (err) {
    log.error("HubSpot contact search failed", { error: getErrorMessage(err) });
    return [];
  }
}

export async function updateDealStage(
  dealId: string,
  stage: string,
  userId?: string,
): Promise<boolean> {
  const uid = userId || "";
  const token = await getValidToken(uid);
  if (!token) {
    log.warn("HubSpot not connected — skipping deal stage update");
    return false;
  }

  try {
    const res = await fetchWithTimeout(
      `${HUBSPOT_BASE}/crm/v3/objects/deals/${encodeURIComponent(dealId)}`,
      {
        method: "PATCH",
        headers: hsHeaders(token),
        body: JSON.stringify({
          properties: {
            dealstage: stage,
          },
        }),
      },
      15_000,
    );
    if (!res.ok) throw new Error(`HubSpot deal stage update error: ${res.status}`);
    return true;
  } catch (err) {
    log.error("HubSpot deal stage update failed", { error: getErrorMessage(err) });
    return false;
  }
}

export async function createContact(
  params: {
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    company?: string;
  },
  userId?: string,
): Promise<string | null> {
  const uid = userId || "";
  const token = await getValidToken(uid);
  if (!token) {
    log.warn("HubSpot not connected — skipping contact create");
    return null;
  }

  try {
    const res = await fetchWithTimeout(
      `${HUBSPOT_BASE}/crm/v3/objects/contacts`,
      {
        method: "POST",
        headers: hsHeaders(token),
        body: JSON.stringify({
          properties: {
            firstname: params.first_name,
            lastname: params.last_name,
            email: params.email || "",
            phone: params.phone || "",
            company: params.company || "",
          },
        }),
      },
      15_000,
    );
    if (!res.ok) throw new Error(`HubSpot contact create error: ${res.status}`);
    const data = (await res.json()) as any;
    return data.id || null;
  } catch (err) {
    log.error("HubSpot contact create failed", { error: getErrorMessage(err) });
    return null;
  }
}

export async function logCall(entry: HubSpotCallLog, userId?: string): Promise<string | null> {
  const uid = userId || "";
  const token = await getValidToken(uid);
  if (!token) {
    log.warn("HubSpot not connected — skipping call log");
    return null;
  }

  try {
    const res = await fetchWithTimeout(
      `${HUBSPOT_BASE}/crm/v3/objects/calls`,
      {
        method: "POST",
        headers: hsHeaders(token),
        body: JSON.stringify({
          properties: {
            hs_call_to_number: entry.to_number,
            hs_call_from_number: entry.from_number || "",
            hs_call_duration: entry.duration_ms ? String(entry.duration_ms) : "0",
            hs_call_disposition: entry.outcome || "connected",
            hs_call_body: entry.body || "",
            hs_call_status: "COMPLETED",
          },
        }),
      },
      15_000,
    );
    if (!res.ok) throw new Error(`HubSpot call log error: ${res.status}`);
    const data = (await res.json()) as any;
    const callId = data.id;

    if (callId && entry.contact_id) {
      await fetchWithTimeout(
        `${HUBSPOT_BASE}/crm/v3/objects/calls/${callId}/associations/contacts/${entry.contact_id}/194`,
        { method: "PUT", headers: hsHeaders(token) },
        10_000,
      );
    }

    return callId || null;
  } catch (err) {
    log.error("HubSpot call log failed", { error: getErrorMessage(err) });
    return null;
  }
}

export async function createDeal(
  params: {
    name: string;
    stage?: string;
    amount?: number;
    contact_id?: string;
    pipeline?: string;
  },
  userId?: string,
): Promise<string | null> {
  const uid = userId || "";
  const token = await getValidToken(uid);
  if (!token) {
    log.warn("HubSpot not connected — skipping deal create");
    return null;
  }

  try {
    const res = await fetchWithTimeout(
      `${HUBSPOT_BASE}/crm/v3/objects/deals`,
      {
        method: "POST",
        headers: hsHeaders(token),
        body: JSON.stringify({
          properties: {
            dealname: params.name,
            dealstage: params.stage || "appointmentscheduled",
            amount: params.amount ? String(params.amount) : "",
            pipeline: params.pipeline || "default",
          },
        }),
      },
      15_000,
    );
    if (!res.ok) throw new Error(`HubSpot deal create error: ${res.status}`);
    const data = (await res.json()) as any;
    const dealId = data.id;

    if (dealId && params.contact_id) {
      await fetchWithTimeout(
        `${HUBSPOT_BASE}/crm/v3/objects/deals/${dealId}/associations/contacts/${params.contact_id}/3`,
        { method: "PUT", headers: hsHeaders(token) },
        10_000,
      );
    }

    return dealId || null;
  } catch (err) {
    log.error("HubSpot deal create failed", { error: getErrorMessage(err) });
    return null;
  }
}

export async function disconnectHubSpot(userId: string): Promise<void> {
  await drizzle
    .delete(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "hubspot")),
    );
  await drizzle
    .update(schema.settings)
    .set({ crmType: null })
    .where(eq(schema.settings.userId, userId));
}

export async function updateContact(
  contactId: string,
  properties: Record<string, string | number | null | undefined>,
  userId?: string,
): Promise<boolean> {
  const uid = userId || "";
  const token = await getValidToken(uid);
  if (!token) {
    log.warn("HubSpot not connected — skipping contact update");
    return false;
  }

  try {
    const res = await fetchWithTimeout(
      `${HUBSPOT_BASE}/crm/v3/objects/contacts/${contactId}`,
      {
        method: "PATCH",
        headers: hsHeaders(token),
        body: JSON.stringify({ properties }),
      },
      15_000,
    );
    if (!res.ok) throw new Error(`HubSpot contact update error: ${res.status}`);
    return true;
  } catch (err) {
    log.error("HubSpot contact update failed", { error: getErrorMessage(err) });
    return false;
  }
}
