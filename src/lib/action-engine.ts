import { db, log } from "./server-context";
import { type ActionItem, type ActionResult } from "./action-types";
import { getErrorMessage } from "./server-utils";
import { IntegrationService } from "./integrations";
import { CRMService } from "./crm-service";
import { sendContract } from "./docusign-service";
import { searchLeads, enrichLead } from "./apollo-service";

/**
 * The Action Engine is responsible for executing tasks extracted by the AI
 * from voice or text interactions.
 */
export async function executeAction(
  userId: string, 
  action: ActionItem,
  context: { sourceId: string; sourceType: string }
): Promise<ActionResult> {
  try {
    const { data: settings } = await db.from("wireline_settings")
      .select("autonomy_level")
      .eq("user_id", userId)
      .single();
    
    const autonomy = settings?.autonomy_level || "draft";
    log.info("Executing autonomous action", { userId, type: action.type, priority: action.priority, autonomy });

    if (autonomy === "auto") {
      const service = new IntegrationService(userId);
      switch (action.type) {
        case "send_email":
          const emailOk = await service.sendEmail({
            to: action.payload.to,
            subject: action.payload.subject,
            body: action.payload.body
          });
          return { success: emailOk };
        case "schedule_calendar":
          // Simple parsing for the payload
          const startTime = new Date(`${action.payload.date} ${action.payload.time}`).toISOString();
          const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();
          const calOk = await service.bookAppointment({
            title: action.payload.event_name || "Meeting",
            description: action.reasoning || "Scheduled via AI Agent",
            startTime,
            endTime
          });
          return { success: calOk };
        case "update_crm_lead":
          return await handleUpdateCRM(userId, action, context);
        case "create_internal_task":
          return await handleCreateInternalTask(userId, action, context);
        case "send_contract":
          return await handleSendContract(userId, action, context);
        case "prospect_leads":
          return await handleProspectLeads(userId, action, context);
      }
    }

    // Default: draft/manual handling
    switch (action.type) {
      case "send_email":
        return await handleSendEmail(userId, action, context);
      case "schedule_calendar":
        return await handleScheduleCalendar(userId, action, context);
      case "update_crm_lead":
        return await handleUpdateCRM(userId, action, context);
      case "create_internal_task":
        return await handleCreateInternalTask(userId, action, context);
      case "send_contract":
        return await handleSendContract(userId, action, context);
      case "prospect_leads":
        return await handleProspectLeads(userId, action, context);
      default:
        return { success: false, error: `Unsupported action type: ${action.type}` };
    }
  } catch (err) {
    const error = getErrorMessage(err);
    log.error("Action execution failed", { userId, type: action.type, error });
    return { success: false, error };
  }
}

async function handleSendEmail(userId: string, action: ActionItem, context: { sourceId: string }) {
  // For now, we save as a "Draft Task" in the fleet_tasks table for human approval.
  // Future: Integration with Postmark/SendGrid for auto-sending.
  const { data, error } = await db.from("wireline_fleet_tasks").insert({
    user_id: userId,
    task_type: "email_draft",
    description: `[AI Draft] ${action.payload.subject || "Follow-up"}`,
    payload: {
      to: action.payload.to,
      subject: action.payload.subject,
      body: action.payload.body,
      reasoning: action.reasoning
    },
    priority: action.priority,
    status: "pending",
    source_type: "phone_call",
    source_id: context.sourceId
  }).select("id").single();

  if (error) throw error;
  return { success: true, actionId: data.id };
}

async function handleScheduleCalendar(userId: string, action: ActionItem, context: { sourceId: string }) {
  const { data, error } = await db.from("wireline_fleet_tasks").insert({
    user_id: userId,
    task_type: "calendar_invite",
    description: `[AI Request] Schedule ${action.payload.event_name || "Meeting"}`,
    payload: action.payload,
    priority: action.priority,
    status: "pending",
    source_type: "phone_call",
    source_id: context.sourceId
  }).select("id").single();

  if (error) throw error;
  return { success: true, actionId: data.id };
}

async function handleUpdateCRM(userId: string, action: ActionItem, context: { sourceId: string }) {
  // 1. Update internal Wireline leads table
  const { error: internalError } = await db.from("wireline_outbound_leads")
    .update({ 
      status: action.payload.status,
      last_contact_summary: action.payload.notes || "Updated by AI Action Engine"
    })
    .eq("user_id", userId)
    .eq("customer_number", action.payload.customer_number);

  if (internalError) {
    log.warn("Internal CRM update failed", { error: internalError.message });
  }

  // 2. Sync with external CRM if configured
  const { data: settings } = await db.from("wireline_settings")
    .select("crm_type")
    .eq("user_id", userId)
    .single();

  if (settings?.crm_type && (settings.crm_type === "salesforce" || settings.crm_type === "hubspot")) {
    const crm = new CRMService(userId);
    await crm.updateLead({
      crmType: settings.crm_type,
      customerNumber: action.payload.customer_number,
      status: action.payload.status,
      notes: action.payload.notes
    });
  }
  
  return { success: true };
}

async function handleCreateInternalTask(userId: string, action: ActionItem, context: { sourceId: string }) {
  const { data, error } = await db.from("wireline_fleet_tasks").insert({
    user_id: userId,
    task_type: "internal_followup",
    description: action.payload.description || "Manual follow-up required",
    payload: action.payload,
    priority: action.priority,
    status: "pending",
    source_type: "phone_call",
    source_id: context.sourceId
  }).select("id").single();

  if (error) throw error;
  return { success: true, actionId: data.id };
}

async function handleSendContract(userId: string, action: ActionItem, context: { sourceId: string }) {
  const result = await sendContract({
    recipientName: action.payload.recipient_name,
    recipientEmail: action.payload.recipient_email,
    templateId: action.payload.template_id,
    subject: action.payload.subject,
    message: action.payload.message,
    prefillFields: action.payload.prefill_fields,
  });

  if (!result) {
    // Fallback: save as a task for human to send manually
    return await handleCreateInternalTask(userId, {
      ...action,
      type: "create_internal_task",
      payload: { ...action.payload, description: `[DocuSign Pending] Send contract to ${action.payload.recipient_email}` }
    }, context);
  }

  // Log the envelope to the database for tracking
  await db.from("wireline_fleet_tasks").insert({
    user_id: userId,
    task_type: "contract_sent",
    description: `Contract sent to ${action.payload.recipient_name}`,
    payload: { envelope_id: result.envelopeId, status: result.status, ...action.payload },
    priority: action.priority,
    status: "completed",
    source_type: "phone_call",
    source_id: context.sourceId,
  });

  log.info("Contract sent via DocuSign", { userId, envelopeId: result.envelopeId });
  return { success: true, actionId: result.envelopeId };
}

async function handleProspectLeads(userId: string, action: ActionItem, context: { sourceId: string }) {
  const leads = await searchLeads({
    titles: action.payload.titles,
    industries: action.payload.industries,
    states: action.payload.states,
    employee_ranges: action.payload.employee_ranges,
    limit: action.payload.limit || 25,
  });

  if (leads.length === 0) {
    log.info("Apollo prospect search returned 0 results", { userId });
    return { success: true };
  }

  // Insert discovered leads into the outbound leads table
  const rows = leads.map(lead => ({
    user_id: userId,
    customer_number: lead.phone,
    customer_name: `${lead.first_name} ${lead.last_name}`.trim(),
    customer_email: lead.email,
    company: lead.company,
    title: lead.title,
    linkedin_url: lead.linkedin_url || null,
    status: "new",
    source: "apollo_ai",
    notes: `Auto-prospected: ${lead.title} at ${lead.company}`,
  }));

  const { error } = await db.from("wireline_outbound_leads").upsert(rows, {
    onConflict: "user_id,customer_number",
    ignoreDuplicates: true,
  });

  if (error) {
    log.error("Failed to insert Apollo leads", { error: error.message });
    return { success: false, error: error.message };
  }

  log.info("Apollo leads imported", { userId, count: leads.length });
  return { success: true };
}
