/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getErrorMessage } from "./server-utils";
import * as salesforce from "./salesforce-service";
import * as hubspot from "./hubspot-service";
import { postMessage as slackPostMessage, getDefaultChannel } from "./slack-service";

function normalizePhone(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

async function getActiveCrm(userId: string): Promise<"salesforce" | "hubspot" | null> {
  try {
    const [data] = await drizzle
      .select({ provider: schema.crmConnections.provider })
      .from(schema.crmConnections)
      .where(
        and(
          eq(schema.crmConnections.userId, userId),
          inArray(schema.crmConnections.provider, ["salesforce", "hubspot"]),
        ),
      )
      .orderBy(desc(schema.crmConnections.updatedAt))
      .limit(1);

    const p = data?.provider;
    return p === "salesforce" || p === "hubspot" ? p : null;
  } catch (err: any) {
    log.warn("getActiveCrm lookup failed", { userId, error: err.message });
    return null;
  }
}

/**
 * Service for interacting with external CRMs.
 * Delegates to the typed service modules (salesforce-service / hubspot-service)
 * which use OAuth tokens from wireline_crm_connections.
 */
export class CRMService {
  constructor(private userId: string) {}

  async createContact(params: {
    crmType: "salesforce" | "hubspot" | "auto";
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    company?: string;
  }): Promise<string | null> {
    const resolved = params.crmType === "auto" ? await getActiveCrm(this.userId) : params.crmType;
    if (resolved === "hubspot") {
      try {
        const id = await hubspot.createContact(params, this.userId);
        return id;
      } catch (err) {
        log.error("hubspot create contact failed", { error: err });
      }
    } else if (resolved === "salesforce") {
      try {
        return await salesforce.createContact(params, this.userId);
      } catch (err) {
        log.error("salesforce create contact failed", { error: err });
      }
    }
    return null;
  }

  async updateLead(params: {
    crmType: "salesforce" | "hubspot";
    customerNumber: string;
    status: string;
    notes?: string;
  }): Promise<boolean> {
    try {
      log.info(`Updating ${params.crmType} lead`, {
        userId: this.userId,
        phone: params.customerNumber,
      });

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
    const resolved = crmType === "auto" ? await getActiveCrm(this.userId) : crmType;

    if (resolved === "salesforce") {
      return {
        crm: "salesforce" as const,
        contacts: await salesforce.searchContacts(query, this.userId),
      };
    }
    if (resolved === "hubspot") {
      return {
        crm: "hubspot" as const,
        contacts: await hubspot.searchContacts(query, this.userId),
      };
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
    const crm = params.crmType === "auto" ? await getActiveCrm(this.userId) : params.crmType;
    const contactId = params.contact_id || (await this.resolveContactId(crm, params.to_number));

    if (crm === "salesforce") {
      return salesforce.logCall(
        {
          subject: params.subject,
          description: params.description,
          contact_id: contactId,
          duration_minutes: params.duration_minutes,
          outcome: params.outcome,
        },
        this.userId,
      );
    }
    if (crm === "hubspot") {
      return hubspot.logCall(
        {
          to_number: params.to_number,
          body: params.description,
          contact_id: contactId,
          duration_ms: (params.duration_minutes || 0) * 60_000,
          outcome: params.outcome,
        },
        this.userId,
      );
    }
    return null;
  }

  async updateDealStage(params: {
    crmType: "salesforce" | "hubspot" | "auto";
    deal_id: string;
    stage: string;
  }): Promise<boolean> {
    const resolved = params.crmType === "auto" ? await getActiveCrm(this.userId) : params.crmType;
    if (resolved === "hubspot") {
      try {
        return await hubspot.updateDealStage(params.deal_id, params.stage, this.userId);
      } catch (err) {
        log.error("hubspot update deal stage failed", { error: err });
        return false;
      }
    } else if (resolved === "salesforce") {
      try {
        return await salesforce.updateOpportunityStage(
          params.deal_id,
          params.stage,
          this.userId,
        );
      } catch (err) {
        log.error("salesforce update opportunity stage failed", { error: err });
        return false;
      }
    }
    return false;
  }

  async createOpportunity(params: {
    crmType: "salesforce" | "hubspot" | "auto";
    name: string;
    contact_id?: string;
    stage?: string;
    amount?: number;
  }): Promise<string | null> {
    const crm = params.crmType === "auto" ? await getActiveCrm(this.userId) : params.crmType;

    let createdId: string | null = null;
    if (crm === "salesforce") {
      createdId = await salesforce.createOpportunity(
        {
          name: params.name,
          contact_id: params.contact_id,
          stage: params.stage,
          amount: params.amount,
        },
        this.userId,
      );
    } else if (crm === "hubspot") {
      createdId = await hubspot.createDeal(
        {
          name: params.name,
          contact_id: params.contact_id,
          stage: params.stage,
          amount: params.amount,
        },
        this.userId,
      );
    }
    if (createdId) {
      const ch = await getDefaultChannel(this.userId);
      if (ch) {
        const amt = params.amount != null ? ` — $${params.amount}` : "";
        void slackPostMessage(
          this.userId,
          ch,
          `🎯 *Deal / opportunity created*\n${params.name}${amt}`,
        );
      }
    }
    return createdId;
  }

  private async updateSalesforce(params: {
    customerNumber: string;
    status: string;
    notes?: string;
  }): Promise<boolean> {
    const results = await salesforce.searchContacts(params.customerNumber, this.userId);
    if (results.length === 0) return false;
    const id = await salesforce.logCall(
      {
        subject: `Status update: ${params.status}`,
        description: params.notes || `Lead status changed to ${params.status}`,
        contact_id: results[0].sf_id,
      },
      this.userId,
    );
    return id !== null;
  }

  private async updateHubspot(params: {
    customerNumber: string;
    status: string;
    notes?: string;
  }): Promise<boolean> {
    const results = await hubspot.searchContacts(params.customerNumber, this.userId);
    if (results.length === 0) return false;
    const id = await hubspot.logCall(
      {
        to_number: params.customerNumber,
        body: params.notes || `Lead status changed to ${params.status}`,
        contact_id: results[0].hs_id,
        outcome: params.status,
      },
      this.userId,
    );
    return id !== null;
  }

  async syncEnrichedLead(params: {
    customerNumber: string;
    fullName?: string | null;
    jobTitle?: string | null;
    company?: string | null;
    linkedInUrl?: string | null;
    leadScore?: number | null;
  }): Promise<boolean> {
    const crm = await getActiveCrm(this.userId);
    if (!crm) return false;

    const contactId = await this.resolveContactId(crm, params.customerNumber);
    if (!contactId) {
      log.warn("Contact not found in CRM — skipping enriched sync", {
        customerNumber: params.customerNumber,
      });
      return false;
    }

    if (crm === "hubspot") {
      const properties: Record<string, any> = {};
      if (params.jobTitle) properties.jobtitle = params.jobTitle;
      if (params.company) properties.company = params.company;
      if (params.linkedInUrl) properties.linkedin = params.linkedInUrl;
      if (params.leadScore != null) {
        properties.hs_lead_status = `Score: ${params.leadScore}`;
      }

      await hubspot.updateContact(contactId, properties, this.userId);
      await hubspot.logCall(
        {
          to_number: params.customerNumber,
          body:
            `Enriched contact details:\n` +
            `Name: ${params.fullName || ""}\n` +
            `Job: ${params.jobTitle || ""}\n` +
            `Company: ${params.company || ""}\n` +
            `LinkedIn: ${params.linkedInUrl || ""}\n` +
            `Lead Score: ${params.leadScore || ""}`,
          contact_id: contactId,
          duration_ms: 0,
          outcome: "enriched",
        },
        this.userId,
      );
      return true;
    }

    if (crm === "salesforce") {
      const fields: Record<string, any> = {};
      if (params.jobTitle) fields.Title = params.jobTitle;
      if (params.linkedInUrl) fields.Description = `LinkedIn: ${params.linkedInUrl}`;

      await salesforce.updateContact(contactId, fields, this.userId);
      await salesforce.logCall(
        {
          subject: "Contact Enriched",
          description:
            `Enriched contact details:\n` +
            `Name: ${params.fullName || ""}\n` +
            `Job: ${params.jobTitle || ""}\n` +
            `Company: ${params.company || ""}\n` +
            `LinkedIn: ${params.linkedInUrl || ""}\n` +
            `Lead Score: ${params.leadScore || ""}`,
          contact_id: contactId,
        },
        this.userId,
      );
      return true;
    }

    return false;
  }

  private async resolveContactId(
    crmType: "salesforce" | "hubspot" | null,
    toNumber: string,
  ): Promise<string | undefined> {
    if (!crmType || !toNumber) return undefined;

    const target = normalizePhone(toNumber);
    if (crmType === "salesforce") {
      const results = await salesforce.searchContacts(toNumber, this.userId);
      const best =
        results.find((contact) => normalizePhone(contact.phone) === target) || results[0];
      return best?.sf_id;
    }

    const results = await hubspot.searchContacts(toNumber, this.userId);
    const best = results.find((contact) => normalizePhone(contact.phone) === target) || results[0];
    return best?.hs_id;
  }
}
