import { db, log } from "./server-context";
import { type ActionItem, type ActionResult } from "./action-types";
import { getErrorMessage } from "./server-utils";
import { IntegrationService } from "./integrations";

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
  // Update the outbound lead status directly if we have a match.
  const { error } = await db.from("wireline_outbound_leads")
    .update({ 
      status: action.payload.status,
      last_contact_summary: action.payload.notes || "Updated by AI Action Engine"
    })
    .eq("user_id", userId)
    .eq("customer_number", action.payload.customer_number);

  if (error) {
    log.warn("CRM update failed, falling back to task", { error: error.message });
    return await handleCreateInternalTask(userId, action, context);
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
