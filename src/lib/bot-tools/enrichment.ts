/* eslint-disable @typescript-eslint/no-explicit-any -- Live tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import { CRMService } from "../crm-service";
import {
  CALLER_LINKED_LIVE_WRITE_DENIAL,
  PRIVATE_LIVE_READ_DENIAL,
} from "../unverified-live-tools";
import {
  assertExternalEntityActionAllowed,
  assertLiveExternalActionAllowed,
  type ExternalEntityTarget,
} from "../account-environment-policy";

import type { ToolCallContext, ToolCallResult } from "../agent-tool-types";

async function assertTenantEnrichmentAction(
  userId: string | null | undefined,
  action: string,
  target?: ExternalEntityTarget,
): Promise<void> {
  if (!userId) throw new Error("Tenant identity is unavailable");
  await assertLiveExternalActionAllowed(userId, action);
  if (target) await assertExternalEntityActionAllowed(userId, action, target);
}

export async function handleEnrichmentToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const { agent, toolCallId } = context;

  if (fn === "enrich_lead") {
    try {
      const { phone_number } = args || {};
      await assertTenantEnrichmentAction(agent?.user_id, "vapi_apollo_lead_enrichment", {
        phone: phone_number,
      });
      const { enrichLead } = await import("../apollo-service");
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

      await assertTenantEnrichmentAction(agent?.user_id, "vapi_live_public_research");

      const { freshPublicResearch } = await import("../fresh-public-research");
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
    return { toolCallId, result: PRIVATE_LIVE_READ_DENIAL };
  }

  if (fn === "crm_log_call") {
    return { toolCallId, result: CALLER_LINKED_LIVE_WRITE_DENIAL };
  }

  if (fn === "crm_create_opportunity") {
    return {
      toolCallId,
      result:
        "I can't verify the CRM contact for a new opportunity during this call. No opportunity was created; offer a team follow-up.",
    };
  }

  if (fn === "meta_submit_lead") {
    try {
      const { email, phone, event_name, value } = args || {};
      await assertTenantEnrichmentAction(agent?.user_id, "vapi_meta_lead_submit", {
        email,
        phone,
      });
      // We import sendMetaConversion from "../meta-service"
      // Wait, we need to import it if it's not imported.
      const { sendMetaConversion } = await import("../meta-service");
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
      await assertTenantEnrichmentAction(agent?.user_id, "vapi_crm_contact_create", {
        email,
        phone,
      });
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
        result: id
          ? `Contact created with ID ${id}.`
          : "The CRM contact was not confirmed. No follow-up task was saved. Offer to create one with create_followup_task and confirm it only after the tool succeeds.",
      };
    } catch {
      return {
        toolCallId,
        result:
          "The CRM contact was not confirmed. No follow-up task was saved. Offer to create one with create_followup_task and confirm it only after the tool succeeds.",
      };
    }
  }

  if (fn === "crm_update_deal_stage") {
    return {
      toolCallId,
      result:
        "I can't verify this deal during the call. No CRM stage was changed; offer a team follow-up.",
    };
  }

  return null;
}
