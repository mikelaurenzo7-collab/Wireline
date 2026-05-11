import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

/**
 * HubSpot CRM Service — bi-directional contact / deal sync.
 *
 * Follows the same graceful-fallback pattern as apollo-service.ts:
 * when HUBSPOT_ACCESS_TOKEN is unset, every export returns a no-op result.
 *
 * Uses HubSpot's v3 CRM API with a Private App access token (simplest
 * auth model for server-to-server). Full OAuth flow can be layered on
 * when multi-tenant HubSpot installs are needed.
 */

const HUBSPOT_BASE = "https://api.hubapi.com";

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

function hsConfigured(): boolean {
  return !!process.env.HUBSPOT_ACCESS_TOKEN;
}

function hsHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export async function searchContacts(query: string): Promise<HubSpotContact[]> {
  if (!hsConfigured()) {
    log.warn("HubSpot not configured — skipping contact search");
    return [];
  }

  try {
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers: hsHeaders(),
      body: JSON.stringify({
        query,
        limit: 10,
        properties: ["firstname", "lastname", "email", "phone", "company"],
      }),
    });
    if (!res.ok) throw new Error(`HubSpot search error: ${res.status}`);
    const data = await res.json();
    return ((data.results || []) as any[]).map((r) => ({
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

export async function createContact(params: {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  company?: string;
}): Promise<string | null> {
  if (!hsConfigured()) {
    log.warn("HubSpot not configured — skipping contact create");
    return null;
  }

  try {
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts`, {
      method: "POST",
      headers: hsHeaders(),
      body: JSON.stringify({
        properties: {
          firstname: params.first_name,
          lastname: params.last_name,
          email: params.email || "",
          phone: params.phone || "",
          company: params.company || "",
        },
      }),
    });
    if (!res.ok) throw new Error(`HubSpot contact create error: ${res.status}`);
    const data = await res.json();
    return data.id || null;
  } catch (err) {
    log.error("HubSpot contact create failed", { error: getErrorMessage(err) });
    return null;
  }
}

export async function logCall(entry: HubSpotCallLog): Promise<string | null> {
  if (!hsConfigured()) {
    log.warn("HubSpot not configured — skipping call log");
    return null;
  }

  try {
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/calls`, {
      method: "POST",
      headers: hsHeaders(),
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
    });
    if (!res.ok) throw new Error(`HubSpot call log error: ${res.status}`);
    const data = await res.json();
    const callId = data.id;

    if (callId && entry.contact_id) {
      await fetch(`${HUBSPOT_BASE}/crm/v3/objects/calls/${callId}/associations/contacts/${entry.contact_id}/194`, {
        method: "PUT",
        headers: hsHeaders(),
      });
    }

    return callId || null;
  } catch (err) {
    log.error("HubSpot call log failed", { error: getErrorMessage(err) });
    return null;
  }
}

export async function createDeal(params: {
  name: string;
  stage?: string;
  amount?: number;
  contact_id?: string;
  pipeline?: string;
}): Promise<string | null> {
  if (!hsConfigured()) {
    log.warn("HubSpot not configured — skipping deal create");
    return null;
  }

  try {
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals`, {
      method: "POST",
      headers: hsHeaders(),
      body: JSON.stringify({
        properties: {
          dealname: params.name,
          dealstage: params.stage || "appointmentscheduled",
          amount: params.amount ? String(params.amount) : "",
          pipeline: params.pipeline || "default",
        },
      }),
    });
    if (!res.ok) throw new Error(`HubSpot deal create error: ${res.status}`);
    const data = await res.json();
    const dealId = data.id;

    if (dealId && params.contact_id) {
      await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/${dealId}/associations/contacts/${params.contact_id}/3`, {
        method: "PUT",
        headers: hsHeaders(),
      });
    }

    return dealId || null;
  } catch (err) {
    log.error("HubSpot deal create failed", { error: getErrorMessage(err) });
    return null;
  }
}
