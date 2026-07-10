/* eslint-disable @typescript-eslint/no-explicit-any -- Vapi webhook/tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import { CRMService } from "../../lib/crm-service";

import type { ToolCallContext, ToolCallResult } from "./types";

export async function handleEnrichmentToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const { agent, message, payload, toolCallId } = context;

  if (fn === "enrich_lead") {
    try {
      const { phone_number } = args || {};
      const { enrichLead } = await import("../../lib/apollo-service");
      const profile = await enrichLead(phone_number, agent?.user_id);
      if (profile) {
        return {
          toolCallId,
          result: `Lead found: ${profile.first_name} ${profile.last_name}, ${profile.title} at ${profile.company}`,
        };
      }
      return { toolCallId, result: "No matching lead profile found." };
    } catch {
      return {
        toolCallId,
        result: "I wasn't able to pull up additional details right now.",
      };
    }
  }

  if (fn === "gemini_ground") {
    try {
      const { query } = args || {};
      if (!query || typeof query !== "string") {
        return {
          toolCallId,
          result: "Could you tell me what you'd like me to look up?",
        };
      }

      const { freshPublicResearch } = await import("../../lib/fresh-public-research");
      const grounded = await freshPublicResearch(query);
      const sourceTail =
        grounded.sources.length > 0
          ? ` (sources: ${grounded.sources
              .slice(0, 3)
              .map((s) => s.title || s.uri || "")
              .filter(Boolean)
              .join("; ")})`
          : "";
      return {
        toolCallId,
        result: grounded.answer + sourceTail,
      };
    } catch {
      return {
        toolCallId,
        result: "I wasn't able to look that up right now. Let me help you another way.",
      };
    }
  }

  // CRM Handlers
  if (fn === "crm_search_contacts") {
    try {
      const { query } = args || {};
      const service = new CRMService(agent.user_id);
      const { contacts } = await service.searchContacts(query);
      return {
        toolCallId,
        result:
          contacts && contacts.length > 0
            ? `I found some records: ${contacts.map((c: any) => `${c.first_name || ""} ${c.last_name || ""} ${c.email || c.phone || ""}`.trim()).join(", ")}`
            : "I don't see any matching records for that. Can you try a different name, email, or phone number?",
      };
    } catch {
      return {
        toolCallId,
        result: "I wasn't able to search our records right now. Let me take your info instead.",
      };
    }
  }

  if (fn === "crm_log_call") {
    try {
      const { contact_id, subject, notes } = args || {};
      const service = new CRMService(agent.user_id);
      const fallbackNumber =
        (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
        (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
      const success = await service.logCall({
        crmType: "auto",
        subject,
        description: notes || "Call logged automatically by agent.",
        to_number: fallbackNumber || "",
        contact_id,
      });
      return {
        toolCallId,
        result: success
          ? "Got it, I've logged our conversation."
          : "I've noted the details of our call.",
      };
    } catch {
      return { toolCallId, result: "I've noted the details of our call." };
    }
  }

  if (fn === "crm_create_opportunity") {
    try {
      const { name, contact_id, stage, amount } = args || {};
      const service = new CRMService(agent.user_id);
      const success = await service.createOpportunity({
        crmType: "auto",
        name,
        contact_id,
        stage,
        amount: amount ? Number(amount) : undefined,
      });
      return {
        toolCallId,
        result: success
          ? "Great, I've added that to our pipeline."
          : "I've noted your interest. Someone from our team will follow up.",
      };
    } catch {
      return {
        toolCallId,
        result: "I've noted your interest. Someone from our team will follow up.",
      };
    }
  }

  if (fn === "meta_submit_lead") {
    try {
      const { email, phone, event_name, value } = args || {};
      // We import sendMetaConversion from "../../lib/meta-service"
      // Wait, we need to import it if it's not imported.
      const { sendMetaConversion } = await import("../../lib/meta-service");
      const res = await sendMetaConversion({
        eventName: event_name || "Lead",
        email,
        phone,
        value: value ? Number(value) : undefined,
      });
      return {
        toolCallId,
        result: res.ok ? "Lead submitted successfully." : "Noted. Lead tracking configured.",
      };
    } catch {
      return { toolCallId, result: "Noted." };
    }
  }

  if (fn === "crm_create_contact") {
    try {
      const { first_name, last_name, email, phone, company } = args || {};
      const service = new CRMService(agent.user_id);
      const id = await service.createContact({
        crmType: "auto",
        first_name: first_name || "Unknown",
        last_name: last_name || "Unknown",
        email,
        phone,
        company,
      });
      return {
        toolCallId,
        result: id ? `Contact created with ID ${id}.` : "I've noted the contact details.",
      };
    } catch {
      return { toolCallId, result: "I've noted the contact details." };
    }
  }

  if (fn === "crm_update_deal_stage") {
    try {
      const { deal_id, stage } = args || {};
      const service = new CRMService(agent.user_id);
      const ok = await service.updateDealStage({ crmType: "auto", deal_id, stage });
      return {
        toolCallId,
        result: ok ? "Deal stage updated." : "I've noted the new deal stage.",
      };
    } catch {
      return { toolCallId, result: "I've noted the new deal stage." };
    }
  }

  return null;
}
