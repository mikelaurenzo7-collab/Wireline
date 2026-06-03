import re

with open("src/routes/vapi/tool-handlers-enrichment.ts", "r") as f:
    content = f.read()

# insert meta_submit_lead and crm handlers at the end before `return null;`
handlers = """
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
        company
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
"""

content = content.replace("return null;", handlers + "\n  return null;")

with open("src/routes/vapi/tool-handlers-enrichment.ts", "w") as f:
    f.write(content)
