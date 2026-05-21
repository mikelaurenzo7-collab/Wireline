import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { type ActionItem, type ActionResult } from "./action-types";
import { getErrorMessage } from "./server-utils";
import { IntegrationService } from "./integrations";
import { CRMService } from "./crm-service";
import { sendContract } from "./docusign-service";
import { searchLeads } from "./apollo-service";
import { sendTenantMessage } from "./twilio-service";
import { postMessage as slackPostMessage, getDefaultChannel } from "./slack-service";
import { resolveAgentTools } from "./agent-capabilities";
import { sendMetaConversion } from "./meta-service";
import { superviseClientCommunication } from "./claude-brain";

/**
 * The Action Engine is responsible for executing tasks extracted by the AI
 * from voice or text interactions.
 */
export async function executeAction(
  userId: string,
  action: ActionItem,
  context: { sourceId: string; sourceType: string },
  autonomyOverride?: "auto" | "draft",
): Promise<ActionResult> {
  try {
    let autonomy: string = autonomyOverride || "draft";

    if (!autonomyOverride) {
      const [settings] = await drizzle
        .select({ autonomyLevel: schema.settings.autonomyLevel })
        .from(schema.settings)
        .where(eq(schema.settings.userId, userId))
        .limit(1);

      // Per-agent autonomy overrides tenant setting when not "inherit"
      autonomy = settings?.autonomyLevel || "draft";
      if (action.agentId) {
        const [agent] = await drizzle
          .select({ autonomyLevel: schema.agents.autonomyLevel })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, action.agentId), eq(schema.agents.userId, userId)))
          .limit(1);

        if (agent?.autonomyLevel && agent.autonomyLevel !== "inherit") {
          autonomy = agent.autonomyLevel;
        }
      }
    }
    log.info("Executing autonomous action", {
      userId,
      type: action.type,
      priority: action.priority,
      autonomy,
    });

    // Per-agent tool gating — if the action targets a specific agent and
    // that agent's enabled_tools array excludes this action type, refuse
    // the action regardless of autonomy mode. Operators control this from
    // FleetSettings → agent detail → Channels. When enabled_tools is null
    // (the default), fall back to role-based defaults (resolveAgentTools).
    if (action.agentId) {
      const [agentRow] = await drizzle
        .select({
          role: schema.agents.role,
          enabledTools: schema.agents.enabledTools,
        })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, action.agentId), eq(schema.agents.userId, userId)))
        .limit(1);

      if (agentRow) {
        const allowedTools = resolveAgentTools(agentRow.role ?? undefined, agentRow.enabledTools);
        if (!allowedTools.includes(action.type as any)) {
          log.warn("Action blocked — agent not authorized for tool", {
            userId,
            agentId: action.agentId,
            type: action.type,
          });
          return {
            success: false,
            error: `This agent is not authorized to use "${action.type}". Enable it in Agents → Channels.`,
          };
        }
      }
    }

    if (autonomy === "auto") {
      const service = new IntegrationService(userId);
      switch (action.type) {
        case "send_email": {
          const reviewed = await superviseClientCommunication({
            channel: "email",
            agentName: action.agentId,
            source: "action_engine",
            purpose: action.reasoning || "autonomous follow-up",
            recipient: action.payload.to,
            subject: action.payload.subject,
            body: action.payload.body,
            context: `Autonomy mode: ${autonomy}. Source type: ${context.sourceType}.`,
          });
          if (!reviewed.approved) {
            return await handleSendEmail(
              userId,
              {
                ...action,
                payload: {
                  ...action.payload,
                  subject: reviewed.subject || action.payload.subject,
                  body: reviewed.body,
                },
                reasoning:
                  `${action.reasoning || ""}\nSupervisor note: ${reviewed.rationale}`.trim(),
              },
              context,
            );
          }
          const emailOk = await service.sendEmail({
            to: action.payload.to,
            subject: reviewed.subject || action.payload.subject,
            body: reviewed.body,
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
          // Fire Meta CAPI "Schedule" conversion when configured. Lets
          // marketers attribute booked meetings back to the Meta ad that
          // sourced the lead. Non-blocking — if CAPI isn't set up, the
          // call returns { ok: false } without throwing.
          if (calOk) {
            void sendMetaConversion({
              eventName: "Schedule",
              eventId: `schedule:${context.sourceId}:${startTime}`,
              email: action.payload.customer_email,
              phone: action.payload.customer_number,
              sourceUrl: `https://trywireline.com/calls/${context.sourceId}`,
            }).catch(() => {});
          }
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
  const [data] = await drizzle
    .insert(schema.fleetTasks)
    .values({
      userId: userId,
      taskType: "email_draft",
      description: `[AI Draft] ${action.payload.subject || "Follow-up"}`,
      payload: {
        to: action.payload.to,
        subject: action.payload.subject,
        body: action.payload.body,
        reasoning: action.reasoning,
      },
      priority: action.priority,
      status: "pending",
      sourceType: "phone_call",
      sourceId: context.sourceId,
    })
    .returning({ id: schema.fleetTasks.id });

  if (!data) throw new Error("Failed to insert email draft task");
  return { success: true, actionId: data.id };
}

async function handleScheduleCalendar(
  userId: string,
  action: ActionItem,
  context: { sourceId: string },
) {
  const [data] = await drizzle
    .insert(schema.fleetTasks)
    .values({
      userId: userId,
      taskType: "calendar_invite",
      description: `[AI Request] Schedule ${action.payload.event_name || "Meeting"}`,
      payload: action.payload,
      priority: action.priority,
      status: "pending",
      sourceType: "phone_call",
      sourceId: context.sourceId,
    })
    .returning({ id: schema.fleetTasks.id });

  if (!data) throw new Error("Failed to insert calendar invite task");
  return { success: true, actionId: data.id };
}

/**
 * Per-agent SMS authorization gate.
 *
 * Resolves the agent's enabled_tools (jsonb on wireline_agents) — null
 * means "use role defaults" (which include send_text_message for every
 * role). An explicit array that omits send_text_message means the
 * operator has turned SMS off for this specific agent. Refuse the send.
 *
 * Backward-compatible: existing agents with null enabledTools keep
 * full role-default behavior.
 */
async function agentMaySendSms(
  userId: string,
  agentId: string | undefined,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if (!agentId) return { allowed: true }; // no agent context = tenant-level action
  try {
    const [row] = await drizzle
      .select({ role: schema.agents.role, enabledTools: schema.agents.enabledTools })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
      .limit(1);
    if (!row) return { allowed: true };
    const tools = resolveAgentTools(row.role ?? undefined, row.enabledTools);
    if (!tools.includes("send_text_message")) {
      return {
        allowed: false,
        reason: "Agent has SMS disabled. Enable it in Fleet → Agent → Channels.",
      };
    }
    return { allowed: true };
  } catch {
    // Fail OPEN — never block sending on a DB blip
    return { allowed: true };
  }
}

async function handleSendTextMessage(
  userId: string,
  action: ActionItem,
  context: { sourceId: string },
) {
  const gate = await agentMaySendSms(userId, action.agentId);
  if (gate.allowed === false) {
    log.info("SMS blocked by per-agent tool gate", { userId, agentId: action.agentId });
    return { success: false, error: gate.reason };
  }

  const reviewed = await superviseClientCommunication({
    channel: "sms",
    agentName: action.agentId,
    source: "action_engine",
    purpose: action.reasoning || "autonomous follow-up",
    recipient: action.payload.to,
    body: action.payload.body,
    context: `Requested channel: ${action.payload.channel === "whatsapp" ? "whatsapp" : "sms"}.`,
  });
  if (!reviewed.approved) {
    return await handleDraftSendTextMessage(
      userId,
      {
        ...action,
        payload: { ...action.payload, body: reviewed.body },
        reasoning: `${action.reasoning || ""}\nSupervisor note: ${reviewed.rationale}`.trim(),
      },
      context,
      reviewed.rationale,
    );
  }

  const outcome = await sendTenantMessage(userId, {
    to: action.payload.to,
    body: reviewed.body,
    channel: action.payload.channel === "whatsapp" ? "whatsapp" : "sms",
  });

  if (!outcome.ok) {
    return await handleDraftSendTextMessage(userId, action, context, outcome.reason);
  }

  return { success: true, actionId: outcome.sid };
}

async function handleUpdateCRM(userId: string, action: ActionItem, context: { sourceId: string }) {
  // 1. Update internal Wireline leads table
  try {
    await drizzle
      .update(schema.outboundLeads)
      .set({
        status: action.payload.status,
        lastContactSummary: action.payload.notes || "Updated by AI Action Engine",
      })
      .where(
        and(
          eq(schema.outboundLeads.userId, userId),
          eq(schema.outboundLeads.customerNumber, action.payload.customer_number),
        ),
      );
  } catch (err: any) {
    log.warn("Internal CRM update failed", { error: err.message });
  }

  // 2. Sync with external CRM if configured. Resolve the active CRM from the
  // OAuth connection (most accurate signal) AND from settings.crmType (legacy).
  // If neither is set, report honestly so the agent doesn't tell the caller
  // "I've updated your CRM" when no CRM is wired.
  const [settings] = await drizzle
    .select({ crmType: schema.settings.crmType })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  let crmSynced = false;
  let crmType: "salesforce" | "hubspot" | null = null;
  if (settings?.crmType === "salesforce" || settings?.crmType === "hubspot") {
    crmType = settings.crmType;
  }

  if (crmType) {
    try {
      const crm = new CRMService(userId);
      crmSynced = await crm.updateLead({
        crmType,
        customerNumber: action.payload.customer_number,
        status: action.payload.status,
        notes: action.payload.notes,
      });
    } catch (err: any) {
      log.warn("External CRM sync failed", { userId, crmType, error: err?.message });
      crmSynced = false;
    }
  }

  // Fire Meta CAPI "Purchase" conversion when a lead transitions to a
  // won state. Status strings vary by CRM convention — handle the
  // common cases ("won", "closed-won", "qualified", "converted").
  const status = (action.payload.status || "").toLowerCase();
  const wonSignals = ["won", "closed_won", "closed-won", "converted", "qualified"];
  if (wonSignals.some((s) => status.includes(s))) {
    void sendMetaConversion({
      eventName: "Purchase",
      eventId: `won:${context.sourceId}:${action.payload.customer_number}`,
      phone: action.payload.customer_number,
      email: action.payload.customer_email,
      value: action.payload.value,
      sourceUrl: `https://trywireline.com/calls/${context.sourceId}`,
    }).catch(() => {});
  }

  return {
    success: true,
    detail: crmType
      ? crmSynced
        ? `Synced status update to ${crmType}.`
        : `Logged locally — ${crmType} sync didn't find a matching contact.`
      : "Logged locally — connect a CRM in Settings to push updates externally.",
  };
}

async function handleCreateInternalTask(
  userId: string,
  action: ActionItem,
  context: { sourceId: string },
) {
  const [data] = await drizzle
    .insert(schema.fleetTasks)
    .values({
      userId: userId,
      taskType: "internal_followup",
      description: action.payload.description || "Manual follow-up required",
      payload: action.payload,
      priority: action.priority,
      status: "pending",
      sourceType: "phone_call",
      sourceId: context.sourceId,
    })
    .returning({ id: schema.fleetTasks.id });

  if (!data) throw new Error("Failed to insert internal follow-up task");
  return { success: true, actionId: data.id };
}

async function handleSendContract(
  userId: string,
  action: ActionItem,
  context: { sourceId: string },
) {
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
    return await handleCreateInternalTask(
      userId,
      {
        ...action,
        type: "create_internal_task",
        payload: {
          ...action.payload,
          description: `[DocuSign Pending] Send contract to ${action.payload.recipient_email}`,
        },
      },
      context,
    );
  }

  // Log the envelope to the database for tracking
  await drizzle.insert(schema.fleetTasks).values({
    userId: userId,
    taskType: "contract_sent",
    description: `Contract sent to ${action.payload.recipient_name}`,
    payload: { envelope_id: result.envelopeId, status: result.status, ...action.payload },
    priority: action.priority,
    status: "completed",
    sourceType: "phone_call",
    sourceId: context.sourceId,
  });

  log.info("Contract sent via DocuSign", { userId, envelopeId: result.envelopeId });
  return { success: true, actionId: result.envelopeId };
}

async function handleProspectLeads(
  userId: string,
  action: ActionItem,
  _context: { sourceId: string },
) {
  const leads = await searchLeads(
    {
      titles: action.payload.titles,
      industries: action.payload.industries,
      states: action.payload.states,
      employee_ranges: action.payload.employee_ranges,
      limit: action.payload.limit || 25,
    },
    userId,
  );

  if (leads.length === 0) {
    log.info("Apollo prospect search returned 0 results", { userId });
    return { success: true };
  }

  // Insert discovered leads into the outbound leads table
  const rows = leads.map((lead) => ({
    userId: userId,
    customerNumber: lead.phone,
    customerName: `${lead.first_name} ${lead.last_name}`.trim(),
    customerEmail: lead.email,
    company: lead.company,
    title: lead.title,
    linkedinUrl: lead.linkedin_url || null,
    status: "new",
    source: "apollo_ai",
    notes: `Auto-prospected: ${lead.title} at ${lead.company}`,
  }));

  try {
    await drizzle
      .insert(schema.outboundLeads)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.outboundLeads.userId, schema.outboundLeads.customerNumber],
        set: { updatedAt: new Date() }, // Just a dummy update to handle conflict
      });
  } catch (err: any) {
    log.error("Failed to insert Apollo leads", { error: err.message });
    return { success: false, error: err.message };
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

async function handleDraftSendContract(
  userId: string,
  action: ActionItem,
  context: { sourceId: string },
) {
  const [data] = await drizzle
    .insert(schema.fleetTasks)
    .values({
      userId: userId,
      taskType: "contract_draft",
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
      sourceType: "phone_call",
      sourceId: context.sourceId,
    })
    .returning({ id: schema.fleetTasks.id });

  if (!data) throw new Error("Failed to insert contract draft task");
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
  const [data] = await drizzle
    .insert(schema.fleetTasks)
    .values({
      userId: userId,
      taskType: "text_message_draft",
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
      sourceType: "phone_call",
      sourceId: context.sourceId,
    })
    .returning({ id: schema.fleetTasks.id });

  if (!data) throw new Error("Failed to insert text message draft task");
  return { success: true, actionId: data.id };
}

async function handleDraftProspectLeads(
  userId: string,
  action: ActionItem,
  context: { sourceId: string },
) {
  const [data] = await drizzle
    .insert(schema.fleetTasks)
    .values({
      userId: userId,
      taskType: "prospect_draft",
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
      sourceType: "phone_call",
      sourceId: context.sourceId,
    })
    .returning({ id: schema.fleetTasks.id });

  if (!data) throw new Error("Failed to insert prospect draft task");
  return { success: true, actionId: data.id };
}

async function handleNotifySlack(userId: string, action: ActionItem): Promise<ActionResult> {
  const channel = action.payload.channel || (await getDefaultChannel(userId));
  if (!channel) {
    return { success: false, error: "No Slack channel configured" };
  }
  const text =
    action.payload.message || action.reasoning || "Notification from your Wireline agent";
  const ok = await slackPostMessage(userId, channel, text);
  return { success: ok, error: ok ? undefined : "Slack message delivery failed" };
}
