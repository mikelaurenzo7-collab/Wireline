import { db, log } from "./server-context";
import { type ActionItem, type ActionResult } from "./action-types";
import { getErrorMessage } from "./server-utils";
import { IntegrationService } from "./integrations";
import { CRMService } from "./crm-service";
import { sendContract } from "./docusign-service";
import { searchLeads, enrichLead } from "./apollo-service";
import { sendTenantMessage } from "./twilio-service";
import { postMessage as slackPostMessage, getDefaultChannel } from "./slack-service";

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

    // Per-agent autonomy overrides tenant setting when not "inherit"
    let autonomy = settings?.autonomy_level || "draft";
    if (action.agentId) {
      const { data: agent } = await db.from("wireline_agents")
        .select("autonomy_level")
        .eq("id", action.agentId)
        .eq("user_id", userId)
        .single();
      if (agent?.autonomy_level && agent.autonomy_level !== "inherit") {
        autonomy = agent.autonomy_level;
      }
    }
    log.info("Executing autonomous action", { userId, type: action.type, priority: action.priority, autonomy });

    if (autonomy === "auto") {
      const service = new IntegrationService(userId);
      switch (action.type) {
        case "send_email": {
          const emailOk = await service.sendEmail({
            to: action.payload.to,
            subject: action.payload.subject,
            body: action.payload.body
          });
          return { success: emailOk };
        }
        case "send_text_message":
          return await handleSendTextMessage(userId, action, context);
        case "schedule_calendar": {
          // Simple parsing for the payload
          const startTime = new Date(`${action.payload.date} ${action.payload.time}`).toISOString();
          const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();
          const calOk = await service.bookAppointment({
            title: action.payload.event_name || "Meeting",
            description: action.reasoning || "Scheduled via AI Agent",
            startTime,
            endTime,
            agentId: action.agentId,
          });
          return { success: calOk };
        }
        case "update_crm_lead":
          return await handleUpdateCRM(userId, action, context);
        case "create_internal_task":
          return await handleCreateInternalTask(userId, action, context);
        case "send_contract":
          return await handleSendContract(userId, action, context);
        case "prospect_leads":
          return await handleProspectLeads(userId, action, context);
        case "notify_slack":
          return await handleNotifySlack(userId, action);
      }
    }

    // Default: draft/manual handling — mirror the send_email/schedule_calendar
    // pattern. We queue every action type into `wireline_fleet_tasks` (or
    // `wireline_outbound_leads` for prospect runs) for operator approval
    // instead of touching DocuSign / Apollo directly. Operators flip
    // autonomy_level to "auto" to bypass this gate.
    switch (action.type) {
      case "send_email":
        return await handleSendEmail(userId, action, context);
      case "send_text_message":
        return await handleDraftSendTextMessage(userId, action, context);
      case "schedule_calendar":
        return await handleScheduleCalendar(userId, action, context);
      case "update_crm_lead":
        return await handleUpdateCRM(userId, action, context);
      case "create_internal_task":
        return await handleCreateInternalTask(userId, action, context);
      case "send_contract":
        return await handleDraftSendContract(userId, action, context);
      case "prospect_leads":
        return await handleDraftProspectLeads(userId, action, context);
      case "notify_slack":
        return await handleNotifySlack(userId, action);
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

async function handleSendTextMessage(userId: string, action: ActionItem, context: { sourceId: string }) {
  const outcome = await sendTenantMessage(userId, {
    to: action.payload.to,
    body: action.payload.body,
    channel: action.payload.channel === "whatsapp" ? "whatsapp" : "sms",
  });

  if (!outcome.ok) {
    return await handleDraftSendTextMessage(userId, action, context, outcome.reason);
  }

  return { success: true, actionId: outcome.sid };
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

// ────────────────────────────────────────────────────────────────────
//  Draft-queue handlers (autonomy_level !== "auto")
//
//  The two integration-backed actions (DocuSign send, Apollo prospect)
//  are *destructive in the world outside Wireline* — they email a real
//  contract for signature, or burn Apollo credits and seed your CRM
//  with possibly-noisy leads. We therefore mirror the existing
//  send_email / schedule_calendar pattern and queue the work as a
//  pending fleet task that the operator approves in the UI before it
//  actually executes. Operators who flip autonomy_level to "auto"
//  bypass this gate (see the `if (autonomy === "auto")` branch above).
// ────────────────────────────────────────────────────────────────────

async function handleDraftSendContract(userId: string, action: ActionItem, context: { sourceId: string }) {
  const { data, error } = await db.from("wireline_fleet_tasks").insert({
    user_id: userId,
    task_type: "contract_draft",
    description: `[AI Draft] Send contract to ${action.payload.recipient_name || action.payload.recipient_email || "recipient"}`,
    payload: {
      recipient_name: action.payload.recipient_name,
      recipient_email: action.payload.recipient_email,
      template_id: action.payload.template_id,
      subject: action.payload.subject,
      message: action.payload.message,
      prefill_fields: action.payload.prefill_fields,
      reasoning: action.reasoning,
    },
    priority: action.priority,
    status: "pending",
    source_type: "phone_call",
    source_id: context.sourceId,
  }).select("id").single();

  if (error) throw error;
  return { success: true, actionId: data.id };
}

async function handleDraftSendTextMessage(
  userId: string,
  action: ActionItem,
  context: { sourceId: string },
  failureReason?: string,
) {
  const channel = action.payload.channel === "whatsapp" ? "whatsapp" : "sms";
  const description = `[AI Draft] ${channel.toUpperCase()} ${action.payload.to || "recipient"}${failureReason ? ` (${failureReason})` : ""}`;
  const { data, error } = await db.from("wireline_fleet_tasks").insert({
    user_id: userId,
    task_type: "text_message_draft",
    description,
    payload: {
      to: action.payload.to,
      body: action.payload.body,
      channel,
      reasoning: action.reasoning,
      failure_reason: failureReason,
    },
    priority: action.priority,
    status: "pending",
    source_type: "phone_call",
    source_id: context.sourceId,
    target_channel: "sms",
  }).select("id").single();

  if (error) throw error;
  return { success: true, actionId: data.id };
}

async function handleDraftProspectLeads(userId: string, action: ActionItem, context: { sourceId: string }) {
  const { data, error } = await db.from("wireline_fleet_tasks").insert({
    user_id: userId,
    task_type: "prospect_draft",
    description: `[AI Draft] Prospect Apollo for ${(action.payload.titles || []).join(", ") || "lead criteria"}`,
    payload: {
      titles: action.payload.titles,
      industries: action.payload.industries,
      states: action.payload.states,
      employee_ranges: action.payload.employee_ranges,
      limit: action.payload.limit || 25,
      reasoning: action.reasoning,
    },
    priority: action.priority,
    status: "pending",
    source_type: "phone_call",
    source_id: context.sourceId,
  }).select("id").single();

  if (error) throw error;
  return { success: true, actionId: data.id };
}

async function handleNotifySlack(userId: string, action: ActionItem): Promise<ActionResult> {
  const channel = action.payload.channel || await getDefaultChannel(userId);
  if (!channel) {
    return { success: false, error: "No Slack channel configured" };
  }
  const text = action.payload.message || action.reasoning || "Notification from your Wireline agent";
  const ok = await slackPostMessage(userId, channel, text);
  return { success: ok, error: ok ? undefined : "Slack message delivery failed" };
}
