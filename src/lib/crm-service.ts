import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import * as salesforce from "./salesforce-service";
import * as hubspot from "./hubspot-service";

function salesforceRuntimeConfigured(): boolean {
  return !!(process.env.SALESFORCE_INSTANCE_URL && process.env.SALESFORCE_ACCESS_TOKEN);
}

function hubspotRuntimeConfigured(): boolean {
  return !!process.env.HUBSPOT_ACCESS_TOKEN;
}

function normalizePhone(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

/**
 * Service for interacting with external CRMs.
 * Delegates to the typed service modules (salesforce-service / hubspot-service)
 * which themselves gracefully no-op when env vars are absent.
 */
export class CRMService {
  constructor(private userId: string) {}

  async updateLead(params: {
    crmType: "salesforce" | "hubspot";
    customerNumber: string;
    status: string;
    notes?: string;
  }): Promise<boolean> {
    try {
      log.info(`Updating ${params.crmType} lead`, { userId: this.userId, phone: params.customerNumber });

      if (params.crmType === "salesforce") {
        return await this.updateSalesforce(params);
      } else {
        return await this.updateHubspot(params);
      }
    } catch (err) {
      log.error(`${params.crmType} update failed`, { error: getErrorMessage(err) });
      return false;
    }
  }

  async searchContacts(query: string, crmType: "salesforce" | "hubspot" | "auto" = "auto") {
    if (crmType === "salesforce" || (crmType === "auto" && salesforceRuntimeConfigured())) {
      return { crm: "salesforce" as const, contacts: await salesforce.searchContacts(query) };
    }
    if (crmType === "hubspot" || (crmType === "auto" && hubspotRuntimeConfigured())) {
      return { crm: "hubspot" as const, contacts: await hubspot.searchContacts(query) };
    }
    return { crm: null, contacts: [] };
  }

  async logCall(params: {
    crmType: "salesforce" | "hubspot" | "auto";
    subject: string;
    description: string;
    to_number: string;
    contact_id?: string;
    duration_minutes?: number;
    outcome?: string;
  }): Promise<string | null> {
    const crm = params.crmType === "auto"
      ? (salesforceRuntimeConfigured() ? "salesforce" : hubspotRuntimeConfigured() ? "hubspot" : null)
      : params.crmType;
    const contactId = params.contact_id || await this.resolveContactId(crm, params.to_number);

    if (crm === "salesforce") {
      return salesforce.logCall({
        subject: params.subject,
        description: params.description,
        contact_id: contactId,
        duration_minutes: params.duration_minutes,
        outcome: params.outcome,
      });
    }
    if (crm === "hubspot") {
      return hubspot.logCall({
        to_number: params.to_number,
        body: params.description,
        contact_id: contactId,
        duration_ms: (params.duration_minutes || 0) * 60_000,
        outcome: params.outcome,
      });
    }
    return null;
  }

  async createOpportunity(params: {
    crmType: "salesforce" | "hubspot" | "auto";
    name: string;
    contact_id?: string;
    stage?: string;
    amount?: number;
  }): Promise<string | null> {
    const crm = params.crmType === "auto"
      ? (salesforceRuntimeConfigured() ? "salesforce" : hubspotRuntimeConfigured() ? "hubspot" : null)
      : params.crmType;

    if (crm === "salesforce") {
      return salesforce.createOpportunity({
        name: params.name,
        contact_id: params.contact_id,
        stage: params.stage,
        amount: params.amount,
      });
    }
    if (crm === "hubspot") {
      return hubspot.createDeal({
        name: params.name,
        contact_id: params.contact_id,
        stage: params.stage,
        amount: params.amount,
      });
    }
    return null;
  }

  private async updateSalesforce(params: {
    customerNumber: string;
    status: string;
    notes?: string;
  }): Promise<boolean> {
    const results = await salesforce.searchContacts(params.customerNumber);
    if (results.length === 0) return false;
    const id = await salesforce.logCall({
      subject: `Status update: ${params.status}`,
      description: params.notes || `Lead status changed to ${params.status}`,
      contact_id: results[0].sf_id,
    });
    return id !== null;
  }

  private async updateHubspot(params: {
    customerNumber: string;
    status: string;
    notes?: string;
  }): Promise<boolean> {
    const results = await hubspot.searchContacts(params.customerNumber);
    if (results.length === 0) return false;
    const id = await hubspot.logCall({
      to_number: params.customerNumber,
      body: params.notes || `Lead status changed to ${params.status}`,
      contact_id: results[0].hs_id,
      outcome: params.status,
    });
    return id !== null;
  }

  private async resolveContactId(
    crmType: "salesforce" | "hubspot" | null,
    toNumber: string,
  ): Promise<string | undefined> {
    if (!crmType || !toNumber) return undefined;

    const target = normalizePhone(toNumber);
    if (crmType === "salesforce") {
      const results = await salesforce.searchContacts(toNumber);
      const best = results.find((contact) => normalizePhone(contact.phone) === target) || results[0];
      return best?.sf_id;
    }

    const results = await hubspot.searchContacts(toNumber);
    const best = results.find((contact) => normalizePhone(contact.phone) === target) || results[0];
    return best?.hs_id;
  }
}
