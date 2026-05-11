import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

/**
 * Salesforce CRM Service — bi-directional contact / opportunity sync.
 *
 * Follows the same graceful-fallback pattern as apollo-service.ts:
 * when SALESFORCE_INSTANCE_URL or SALESFORCE_ACCESS_TOKEN are unset,
 * every export returns a no-op result.
 *
 * Full OAuth Web Server flow (authorization_code → refresh_token) will
 * be implemented when operators begin onboarding Salesforce accounts.
 * Until then, these stubs use a direct bearer token so the Action Engine
 * and post-call sync can reference real typed functions without breaking
 * when creds are absent.
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

function sfConfigured(): boolean {
  return !!(
    process.env.SALESFORCE_INSTANCE_URL &&
    process.env.SALESFORCE_ACCESS_TOKEN
  );
}

export async function searchContacts(query: string): Promise<SalesforceContact[]> {
  if (!sfConfigured()) {
    log.warn("Salesforce not configured — skipping contact search");
    return [];
  }

  try {
    const instanceUrl = process.env.SALESFORCE_INSTANCE_URL!;
    const safeQuery = query.replace(/'/g, "\\'");
    const soql =
      `SELECT Id, FirstName, LastName, Email, Phone, Account.Name, Title ` +
      `FROM Contact WHERE Name LIKE '%${safeQuery}%' OR Phone LIKE '%${safeQuery}%' LIMIT 10`;
    const res = await fetch(`${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`, {
      headers: { Authorization: `Bearer ${await getAccessToken()}` },
    });
    if (!res.ok) throw new Error(`Salesforce SOQL error: ${res.status}`);
    const data = await res.json();
    return ((data.records || []) as any[]).map((r) => ({
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

export async function logCall(entry: SalesforceCallLog): Promise<string | null> {
  if (!sfConfigured()) {
    log.warn("Salesforce not configured — skipping call log");
    return null;
  }

  try {
    const instanceUrl = process.env.SALESFORCE_INSTANCE_URL!;
    const body: Record<string, unknown> = {
      Subject: entry.subject,
      Description: entry.description,
      TaskSubtype: "Call",
      Status: "Completed",
      CallDurationInSeconds: (entry.duration_minutes || 0) * 60,
      CallDisposition: entry.outcome || "Completed",
    };
    if (entry.contact_id) body.WhoId = entry.contact_id;

    const res = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Task`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Salesforce Task create error: ${res.status}`);
    const data = await res.json();
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
}): Promise<string | null> {
  if (!sfConfigured()) {
    log.warn("Salesforce not configured — skipping opportunity create");
    return null;
  }

  try {
    const instanceUrl = process.env.SALESFORCE_INSTANCE_URL!;
    const body: Record<string, unknown> = {
      Name: params.name,
      StageName: params.stage || "Prospecting",
      CloseDate: params.close_date || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    };
    if (params.amount) body.Amount = params.amount;
    if (params.contact_id) body.ContactId = params.contact_id;

    const res = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Opportunity`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Salesforce Opportunity create error: ${res.status}`);
    const data = await res.json();
    return data.id || null;
  } catch (err) {
    log.error("Salesforce opportunity create failed", { error: getErrorMessage(err) });
    return null;
  }
}

/**
 * Placeholder token retrieval. A real implementation would use the
 * OAuth 2.0 Web Server flow with refresh tokens stored in the DB.
 */
async function getAccessToken(): Promise<string> {
  // TODO: implement OAuth refresh_token → access_token exchange
  // For now, operators can set a direct access token for testing
  return process.env.SALESFORCE_ACCESS_TOKEN || "";
}
