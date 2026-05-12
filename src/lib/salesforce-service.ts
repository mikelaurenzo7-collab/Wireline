import { db, log, fetchWithTimeout } from "./server-context";
import { encryptSecret, decryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";

/**
 * Salesforce CRM Service — real OAuth 2.0 Web Server flow.
 *
 * Tokens are stored encrypted in wireline_crm_connections and
 * refreshed automatically when expired. If no connection exists
 * (operator hasn't completed OAuth), every function returns no-op.
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
  instance_url: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// ────────────────────────────────────────────────────────────────────
//  OAuth Token Management
// ────────────────────────────────────────────────────────────────────

export function sfOAuthConfigured(): boolean {
  return !!(
    process.env.SALESFORCE_CLIENT_ID &&
    process.env.SALESFORCE_CLIENT_SECRET
  );
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

export async function exchangeSalesforceCode(code: string, redirectUri: string): Promise<{
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
  const data = await r.json() as any;
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

async function refreshSalesforceToken(conn: CrmConnection): Promise<{ access_token: string; expires_at: number }> {
  const loginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.SALESFORCE_CLIENT_ID!,
    client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
    refresh_token: decryptSecret(conn.refresh_token),
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
  const data = await r.json() as any;
  if (!r.ok || !data.access_token) {
    throw new Error(data.error_description || "Salesforce token refresh failed");
  }
  return {
    access_token: data.access_token,
    expires_at: Date.now() + 7200 * 1000,
  };
}

async function getConnection(userId: string): Promise<CrmConnection | null> {
  const { data } = await db
    .from("wireline_crm_connections")
    .select("id, instance_url, access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("provider", "salesforce")
    .single();
  return data || null;
}

async function getValidToken(userId: string): Promise<{ token: string; instanceUrl: string } | null> {
  const conn = await getConnection(userId);
  if (!conn) return null;

  if (conn.expires_at && Date.now() < conn.expires_at - 60_000) {
    return { token: decryptSecret(conn.access_token), instanceUrl: conn.instance_url };
  }

  try {
    const updated = await refreshSalesforceToken(conn);
    await db.from("wireline_crm_connections")
      .update({
        access_token: encryptSecret(updated.access_token),
        expires_at: updated.expires_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);
    return { token: updated.access_token, instanceUrl: conn.instance_url };
  } catch (err) {
    log.error("Salesforce token refresh failed", { error: getErrorMessage(err) });
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
//  CRM Operations
// ────────────────────────────────────────────────────────────────────

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
    const data = await res.json() as any;
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
    const data = await res.json() as any;
    return data.id || null;
  } catch (err) {
    log.error("Salesforce call log failed", { error: getErrorMessage(err) });
    return null;
  }
}

export async function createOpportunity(params: {
  name: string;
  contact_id?: string;
  stage?: string;
  amount?: number;
  close_date?: string;
}, userId?: string): Promise<string | null> {
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
      CloseDate: params.close_date || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    };
    if (params.amount) body.Amount = params.amount;
    if (params.contact_id) body.ContactId = params.contact_id;

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
    const data = await res.json() as any;
    return data.id || null;
  } catch (err) {
    log.error("Salesforce opportunity create failed", { error: getErrorMessage(err) });
    return null;
  }
}

export async function disconnectSalesforce(userId: string): Promise<void> {
  await db.from("wireline_crm_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "salesforce");
  await db.from("wireline_settings")
    .update({ crm_type: null })
    .eq("user_id", userId);
}
