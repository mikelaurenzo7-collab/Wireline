/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";
import { getSalesforceSyncPreferences } from "./salesforce-sync-preferences";

/**
 * Salesforce CRM Service — real OAuth 2.0 Web Server flow.
 *
 * Tokens are stored encrypted in wireline_crm_connections and
 * refreshed automatically when expired. If no connection exists
 * (Account Holder hasn't completed OAuth), every function returns no-op.
 */

export interface SalesforceContact {
  sf_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
}

export interface SalesforceCallLog {
  subject: string;
  description: string;
  contact_id?: string;
  duration_minutes?: number;
  outcome?: string;
}

interface CrmConnection {
  id: string;
  instanceUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  active: boolean | null;
}

// ────────────────────────────────────────────────────────────────────
//  OAuth Token Management
// ────────────────────────────────────────────────────────────────────

export function sfOAuthConfigured(): boolean {
  return !!(process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET);
}

export function getSalesforceAuthUrl(redirectUri: string, state: string): string {
  const loginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SALESFORCE_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: "api refresh_token id",
    state,
    prompt: "consent",
  });
  return `${loginUrl}/services/oauth2/authorize?${params.toString()}`;
}

export async function exchangeSalesforceCode(
  code: string,
  redirectUri: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  instance_url: string;
  expires_in: number;
  id: string;
}> {
  const loginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.SALESFORCE_CLIENT_ID!,
    client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    code,
  });

  const r = await fetchWithTimeout(
    `${loginUrl}/services/oauth2/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    },
    15_000,
  );
  const data = (await r.json()) as any;
  if (!r.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Salesforce token exchange failed");
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    instance_url: data.instance_url,
    expires_in: data.issued_at ? 7200 : 7200, // SF doesn't always return expires_in
    id: data.id || "",
  };
}

async function refreshSalesforceToken(
  conn: CrmConnection,
): Promise<{ access_token: string; expires_at: number }> {
  if (!conn.refreshToken) throw new Error("Salesforce refresh token is unavailable");
  const loginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.SALESFORCE_CLIENT_ID!,
    client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
    refresh_token: decryptSecret(conn.refreshToken),
  });

  const r = await fetchWithTimeout(
    `${loginUrl}/services/oauth2/token`,
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
      (data.error_description && data.error_description.includes("invalid_grant"));
    const err = new Error(data.error_description || "Salesforce token refresh failed");
    (err as any).isTerminal = isTerminal;
    throw err;
  }
  return {
    access_token: data.access_token,
    expires_at: Date.now() + 7200 * 1000,
  };
}

async function getConnection(userId: string): Promise<CrmConnection | null> {
  const [data] = await drizzle
    .select({
      id: schema.crmConnections.id,
      instanceUrl: schema.crmConnections.instanceUrl,
      accessToken: schema.crmConnections.accessToken,
      refreshToken: schema.crmConnections.refreshToken,
      expiresAt: schema.crmConnections.expiresAt,
      active: schema.crmConnections.active,
    })
    .from(schema.crmConnections)
    .where(
      and(
        eq(schema.crmConnections.userId, userId),
        eq(schema.crmConnections.provider, "salesforce"),
      ),
    )
    .limit(1);

  return data || null;
}

/**
 * Legacy connections have no Wireline preference metadata, so a missing value
 * deliberately stays enabled. The preference only gates automatic Task
 * delivery; OAuth connection health remains owned by getValidToken().
 */
async function isSalesforceCallActivitySyncEnabled(userId: string): Promise<boolean> {
  const [connection] = await drizzle
    .select({ metadata: schema.crmConnections.metadata })
    .from(schema.crmConnections)
    .where(
      and(
        eq(schema.crmConnections.userId, userId),
        eq(schema.crmConnections.provider, "salesforce"),
      ),
    )
    .limit(1);

  return getSalesforceSyncPreferences(connection?.metadata).callActivitySyncEnabled;
}

async function getValidToken(
  userId: string,
): Promise<{ token: string; instanceUrl: string } | null> {
  const conn = await getConnection(userId);
  if (!conn || conn.active === false) return null;

  if (conn.expiresAt && Date.now() < conn.expiresAt.getTime() - 60_000) {
    return { token: decryptSecret(conn.accessToken), instanceUrl: conn.instanceUrl || "" };
  }

  try {
    const updated = await refreshSalesforceToken(conn);
    await drizzle
      .update(schema.crmConnections)
      .set({
        accessToken: encryptSecret(updated.access_token),
        expiresAt: new Date(updated.expires_at),
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.crmConnections.id, conn.id));
    return { token: updated.access_token, instanceUrl: conn.instanceUrl || "" };
  } catch (err: any) {
    log.error("Salesforce token refresh failed", { error: getErrorMessage(err) });
    if (err.isTerminal) {
      log.warn(
        `Terminal Salesforce OAuth failure for user ${userId}. Flagging connection as inactive.`,
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

// ────────────────────────────────────────────────────────────────────
//  CRM Operations
// ────────────────────────────────────────────────────────────────────

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
  const creds = await getValidToken(uid);
  if (!creds) {
    log.warn("Salesforce not connected — skipping contact create");
    return null;
  }

  try {
    const body: Record<string, unknown> = {
      FirstName: params.first_name || "",
      LastName: params.last_name || "Unknown",
    };
    if (params.email) body.Email = params.email;
    if (params.phone) body.Phone = params.phone;
    // Account association by company name is best-effort: Salesforce requires
    // an AccountId for Account Name. Store company on Title/Description when
    // we only have a free-text company label from a voice call.
    if (params.company) body.Title = params.company;

    const res = await fetchWithTimeout(
      `${creds.instanceUrl}/services/data/v59.0/sobjects/Contact`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      15_000,
    );
    if (!res.ok) throw new Error(`Salesforce Contact create error: ${res.status}`);
    const data = (await res.json()) as any;
    return data.id || null;
  } catch (err) {
    log.error("Salesforce contact create failed", { error: getErrorMessage(err) });
    return null;
  }
}

export async function updateOpportunityStage(
  opportunityId: string,
  stage: string,
  userId?: string,
): Promise<boolean> {
  const uid = userId || "";
  const creds = await getValidToken(uid);
  if (!creds) {
    log.warn("Salesforce not connected — skipping opportunity stage update");
    return false;
  }

  try {
    const res = await fetchWithTimeout(
      `${creds.instanceUrl}/services/data/v59.0/sobjects/Opportunity/${encodeURIComponent(opportunityId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ StageName: stage }),
      },
      15_000,
    );
    if (!res.ok) throw new Error(`Salesforce Opportunity stage update error: ${res.status}`);
    return true;
  } catch (err) {
    log.error("Salesforce opportunity stage update failed", { error: getErrorMessage(err) });
    return false;
  }
}

export async function searchContacts(query: string, userId?: string): Promise<SalesforceContact[]> {
  const uid = userId || "";
  const creds = await getValidToken(uid);
  if (!creds) {
    log.warn("Salesforce not connected — skipping contact search");
    return [];
  }

  try {
    const safeQuery = query.replace(/'/g, "\\'");
    const soql =
      `SELECT Id, FirstName, LastName, Email, Phone, Account.Name, Title ` +
      `FROM Contact WHERE Name LIKE '%${safeQuery}%' OR Phone LIKE '%${safeQuery}%' LIMIT 10`;
    const res = await fetchWithTimeout(
      `${creds.instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`,
      { headers: { Authorization: `Bearer ${creds.token}` } },
      15_000,
    );
    if (!res.ok) throw new Error(`Salesforce SOQL error: ${res.status}`);
    const data = (await res.json()) as any;
    return ((data.records || []) as any[]).map((r: any) => ({
      sf_id: r.Id,
      first_name: r.FirstName || "",
      last_name: r.LastName || "",
      email: r.Email || null,
      phone: r.Phone || null,
      company: r.Account?.Name || null,
      title: r.Title || null,
    }));
  } catch (err) {
    log.error("Salesforce contact search failed", { error: getErrorMessage(err) });
    return [];
  }
}

export async function logCall(entry: SalesforceCallLog, userId?: string): Promise<string | null> {
  const uid = userId || "";
  if (!(await isSalesforceCallActivitySyncEnabled(uid))) {
    log.info("Salesforce call activity sync disabled by connection preference", { userId: uid });
    return null;
  }

  const creds = await getValidToken(uid);
  if (!creds) {
    log.warn("Salesforce not connected — skipping call log");
    return null;
  }

  try {
    const body: Record<string, unknown> = {
      Subject: entry.subject,
      Description: entry.description,
      TaskSubtype: "Call",
      Status: "Completed",
      CallDurationInSeconds: (entry.duration_minutes || 0) * 60,
      CallDisposition: entry.outcome || "Completed",
    };
    if (entry.contact_id) body.WhoId = entry.contact_id;

    const res = await fetchWithTimeout(
      `${creds.instanceUrl}/services/data/v59.0/sobjects/Task`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      15_000,
    );
    if (!res.ok) throw new Error(`Salesforce Task create error: ${res.status}`);
    const data = (await res.json()) as any;
    return data.id || null;
  } catch (err) {
    log.error("Salesforce call log failed", { error: getErrorMessage(err) });
    return null;
  }
}

export async function createOpportunity(
  params: {
    name: string;
    contact_id?: string;
    stage?: string;
    amount?: number;
    close_date?: string;
  },
  userId?: string,
): Promise<string | null> {
  const uid = userId || "";
  const creds = await getValidToken(uid);
  if (!creds) {
    log.warn("Salesforce not connected — skipping opportunity create");
    return null;
  }

  try {
    const body: Record<string, unknown> = {
      Name: params.name,
      StageName: params.stage || "Prospecting",
      CloseDate:
        params.close_date || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    };
    if (params.amount) body.Amount = params.amount;
    if (params.contact_id) body.WhoId = params.contact_id; // For Opportunity, WhoId is used for Contact relation

    const res = await fetchWithTimeout(
      `${creds.instanceUrl}/services/data/v59.0/sobjects/Opportunity`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      15_000,
    );
    if (!res.ok) throw new Error(`Salesforce Opportunity create error: ${res.status}`);
    const data = (await res.json()) as any;
    return data.id || null;
  } catch (err) {
    log.error("Salesforce opportunity create failed", { error: getErrorMessage(err) });
    return null;
  }
}

export async function disconnectSalesforce(userId: string): Promise<void> {
  const { revokeCrmProviderTokens } = await import("./oauth-provider-revocation");
  await revokeCrmProviderTokens(userId, "salesforce");
  await drizzle
    .delete(schema.crmConnections)
    .where(
      and(
        eq(schema.crmConnections.userId, userId),
        eq(schema.crmConnections.provider, "salesforce"),
      ),
    );
  await drizzle
    .update(schema.settings)
    .set({ crmType: null })
    .where(eq(schema.settings.userId, userId));
}

export async function updateContact(
  contactId: string,
  fields: Record<string, unknown>,
  userId?: string,
): Promise<boolean> {
  const uid = userId || "";
  const creds = await getValidToken(uid);
  if (!creds) {
    log.warn("Salesforce not connected — skipping contact update");
    return false;
  }

  try {
    const res = await fetchWithTimeout(
      `${creds.instanceUrl}/services/data/v59.0/sobjects/Contact/${contactId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fields),
      },
      15_000,
    );
    if (!res.ok) throw new Error(`Salesforce contact update error: ${res.status}`);
    return true;
  } catch (err) {
    log.error("Salesforce contact update failed", { error: getErrorMessage(err) });
    return false;
  }
}
