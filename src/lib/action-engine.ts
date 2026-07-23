/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { type ActionItem, type ActionResult } from "./action-types";
import { getErrorMessage } from "./server-utils";
import { IntegrationService } from "./integrations";
import { CRMService } from "./crm-service";
import { sendContract } from "./docusign-service";
import { searchLeads } from "./apollo-service";
import { sendTenantMessage } from "./twilio-service";
import { postAgentNotification, getDefaultChannel } from "./slack-service";
import { resolveAgentTools } from "./agent-capabilities";
import { sendMetaConversion } from "./meta-service";
import { superviseClientCommunication } from "./ai-supervisor";
import { touchNavCounts } from "./nav-counts-invalidate";
import { evaluateOutboundDialGate } from "./outbound-dial-gate";

/**
 * Roles whose auto SMS is treated as non-marketing (service / ops).
 * Everything else — including unknown roles and missing agentId — fails
 * closed as marketing so federal DNC + express consent apply.
 */
const NON_MARKETING_SMS_ROLES = new Set([
  "customer_service",
  "technical_support",
  "receptionist",
  "scheduler",
  "personal_assistant",
  "ecommerce",
]);

/** Match twilio-service cleanPhone so gate/lead lookup use the same destination. */
function cleanOutboundSmsPhone(raw: string | null | undefined): string {
  const input = String(raw || "").replace(/^whatsapp:/i, "");
  const cleaned = input.replace(/[^0-9+]/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("+") ? `+${cleaned.slice(1).replace(/\+/g, "")}` : cleaned;
}

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
    // the action regardless of autonomy mode. Account Holders control this from
    // AssistantSettings → agent detail → Channels. When enabled_tools is null
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
          return await executeCrmAction(userId, action);
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
    // pattern. We queue every action type into `wireline_follow_up_tasks` (or
    // `wireline_outbound_leads` for prospect runs) for Account Holder approval
    // instead of touching DocuSign / Apollo directly. Account Holders flip
    // autonomy_level to "auto" to bypass this gate.
    switch (action.type) {
      case "send_email":
        return await handleSendEmail(userId, action, context);
      case "send_text_message":
        return await handleDraftSendTextMessage(userId, action, context);
      case "schedule_calendar":
        return await handleScheduleCalendar(userId, action, context);
      case "update_crm_lead":
        return await queueCrmAction(userId, action, context);
      case "create_internal_task":
        return await handleCreateInternalTask(userId, action, context);
      case "send_contract":
        return await queueSideEffectAction(userId, action, context, "send_contract", "docusign");
      case "prospect_leads":
        return await queueSideEffectAction(userId, action, context, "prospect_leads", "apollo");
      case "notify_slack":
        return await queueSideEffectAction(userId, action, context, "notify_slack", "slack");
      default:
        return { success: false, error: `Unsupported action type: ${action.type}` };
    }
  } catch (error) {
    log.error("Action execution failed", {
      userId,
      actionType: action.type,
      error: getErrorMessage(error),
    });
    return { success: false, error: getErrorMessage(error) };
  }
}

async function handleSendEmail(
  userId: string,
  action: ActionItem,
  context: { sourceId: string; sourceType: string },
): Promise<ActionResult> {
  const description = `Email draft to ${action.payload.to || "recipient"}: ${action.payload.subject || "No subject"}`;
  await drizzle.insert(schema.followUpTasks).values({
    userId,
    agentId: action.agentId,
    taskType: "send_email",
    description,
    priority: action.priority || "medium",
    status: "pending",
    sourceType: context.sourceType,
    sourceId: context.sourceId,
    targetChannel: "email",
    payload: action.payload,
  });
  await touchNavCounts(userId);
  return { success: true, queued: true };
}
async function handleSendTextMessage(
  userId: string,
  action: ActionItem,
  _context: { sourceId: string; sourceType: string },
): Promise<ActionResult> {
  const phone = cleanOutboundSmsPhone(action.payload.to);
  if (!phone) {
    return { success: false, error: "A destination number is required." };
  }

  // Match cadence-engine: every auto-sent SMS clears the shared TCPA / DNC /
  // quiet-hours / duplicate gate. Non-service roles are marketing (federal
  // DNC + express written consent via outbound-lead metadata when present).
  let isMarketingCall = true;
  if (action.agentId) {
    const [agent] = await drizzle
      .select({ role: schema.agents.role })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, action.agentId), eq(schema.agents.userId, userId)))
      .limit(1);
    const role = String(agent?.role || "").toLowerCase();
    isMarketingCall = !NON_MARKETING_SMS_ROLES.has(role);
  }

  const [lead] = await drizzle
    .select({
      id: schema.outboundLeads.id,
      lastCalledAt: schema.outboundLeads.lastCalledAt,
      metadata: schema.outboundLeads.metadata,
    })
    .from(schema.outboundLeads)
    .where(
      and(eq(schema.outboundLeads.userId, userId), eq(schema.outboundLeads.customerNumber, phone)),
    )
    .limit(1);

  try {
    const gate = await evaluateOutboundDialGate({
      userId,
      phone,
      leadId: lead?.id,
      lastCalledAt: lead?.lastCalledAt,
      metadata: (lead?.metadata as Record<string, unknown> | null) || {},
      isMarketingCall,
    });
    if (!gate.allowed) {
      return {
        success: false,
        error: `Outbound SMS blocked (${gate.reason}).`,
      };
    }
  } catch (err: unknown) {
    log.warn("action-engine SMS compliance gate failed — failing closed", {
      userId,
      error: getErrorMessage(err),
    });
    return { success: false, error: "Compliance gate failed (fail-closed)." };
  }

  const sent = await sendTenantMessage(userId, {
    to: phone,
    body: action.payload.body,
    agentId: action.agentId,
  });
  return sent.ok ? { success: true } : { success: false, error: sent.reason || "SMS send failed" };
}
async function handleDraftSendTextMessage(
  userId: string,
  action: ActionItem,
  context: { sourceId: string; sourceType: string },
): Promise<ActionResult> {
  await drizzle.insert(schema.followUpTasks).values({
    userId,
    agentId: action.agentId,
    taskType: "send_text_message",
    description: `SMS draft to ${action.payload.to || "recipient"}`,
    priority: action.priority || "medium",
    status: "pending",
    sourceType: context.sourceType,
    sourceId: context.sourceId,
    targetChannel: "sms",
    payload: action.payload,
  });
  await touchNavCounts(userId);
  return { success: true, queued: true };
}
async function handleScheduleCalendar(
  userId: string,
  action: ActionItem,
  context: { sourceId: string; sourceType: string },
): Promise<ActionResult> {
  await drizzle.insert(schema.followUpTasks).values({
    userId,
    agentId: action.agentId,
    taskType: "schedule_calendar",
    description: `Calendar request: ${action.payload.event_name || "Meeting"}`,
    priority: action.priority || "medium",
    status: "pending",
    sourceType: context.sourceType,
    sourceId: context.sourceId,
    targetChannel: "calendar",
    payload: action.payload,
  });
  await touchNavCounts(userId);
  return { success: true, queued: true };
}

function isCrmCallLogPayload(payload: Record<string, unknown>): boolean {
  const crmType = payload.crm_type ?? payload.crmType;
  return (
    (crmType === "hubspot" || crmType === "salesforce") &&
    (typeof payload.subject === "string" || typeof payload.description === "string")
  );
}

async function queueCrmAction(
  userId: string,
  action: ActionItem,
  context: { sourceId: string; sourceType: string },
): Promise<ActionResult> {
  const payload = (action.payload || {}) as Record<string, unknown>;
  const description =
    action.reasoning ||
    (isCrmCallLogPayload(payload)
      ? `CRM call log: ${payload.subject || "Post-call note"}`
      : "CRM lead update");

  await drizzle.insert(schema.followUpTasks).values({
    userId,
    agentId: action.agentId,
    taskType: "update_crm_lead",
    description,
    priority: action.priority || "medium",
    status: "pending",
    sourceType: context.sourceType,
    sourceId: context.sourceId,
    targetChannel: "crm",
    payload: action.payload,
  });
  await touchNavCounts(userId);
  return { success: true, queued: true };
}

async function executeCrmAction(userId: string, action: ActionItem): Promise<ActionResult> {
  const crm = new CRMService(userId);
  const payload = (action.payload || {}) as Record<string, unknown>;
  const callLogShape = isCrmCallLogPayload(payload);

  if (callLogShape) {
    const crmType = (payload.crm_type ?? payload.crmType) as "hubspot" | "salesforce";
    const logId = await crm.logCall({
      crmType,
      subject: String(payload.subject || "Call"),
      description: String(payload.description || ""),
      to_number: String(payload.to_number || payload.customerNumber || ""),
      duration_minutes:
        typeof payload.duration_minutes === "number" ? payload.duration_minutes : undefined,
      outcome: typeof payload.outcome === "string" ? payload.outcome : undefined,
    });
    return { success: !!logId };
  }

  const updated = await crm.updateLead(action.payload as Parameters<CRMService["updateLead"]>[0]);
  return { success: updated };
}
async function handleCreateInternalTask(
  userId: string,
  action: ActionItem,
  context: { sourceId: string; sourceType: string },
): Promise<ActionResult> {
  await drizzle.insert(schema.followUpTasks).values({
    userId,
    agentId: action.agentId,
    taskType: "internal_task",
    description: action.payload.description || action.reasoning || "Internal follow-up",
    priority: action.priority || "medium",
    status: "pending",
    sourceType: context.sourceType,
    sourceId: context.sourceId,
    targetChannel: "manual",
  });
  await touchNavCounts(userId);
  return { success: true };
}
async function queueSideEffectAction(
  userId: string,
  action: ActionItem,
  context: { sourceId: string; sourceType: string },
  taskType: string,
  targetChannel: string,
): Promise<ActionResult> {
  await drizzle.insert(schema.followUpTasks).values({
    userId,
    agentId: action.agentId,
    taskType,
    description:
      action.reasoning ||
      action.payload?.message ||
      action.payload?.description ||
      `${taskType.replace(/_/g, " ")} awaiting approval`,
    priority: action.priority || "medium",
    status: "pending",
    sourceType: context.sourceType,
    sourceId: context.sourceId,
    targetChannel,
    payload: action.payload,
  });
  await touchNavCounts(userId);
  return { success: true, queued: true };
}

async function handleSendContract(
  userId: string,
  action: ActionItem,
  _context: { sourceId: string; sourceType: string },
): Promise<ActionResult> {
  const response = await sendContract(action.payload as Parameters<typeof sendContract>[0]);
  return { success: !!response };
}
async function handleProspectLeads(
  userId: string,
  action: ActionItem,
  _context: { sourceId: string; sourceType: string },
): Promise<ActionResult> {
  const leads = await searchLeads(action.payload as Parameters<typeof searchLeads>[0], userId);
  return { success: Array.isArray(leads) };
}
async function handleNotifySlack(userId: string, action: ActionItem): Promise<ActionResult> {
  const channel = await getDefaultChannel(userId);
  if (!channel) return { success: false, error: "No Slack channel is configured." };
  await postAgentNotification(
    userId,
    channel,
    action.payload.message || action.reasoning || "Wireline action requires review.",
  );
  return { success: true };
}
