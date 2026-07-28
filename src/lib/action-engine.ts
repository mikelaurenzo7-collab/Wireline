import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { runIdempotentActionExecution } from "./action-execution-idempotency";
import {
  NO_TENANT_INTEGRATIONS,
  resolveAuthorizedAgentTools,
  sanitizePersistedAgentToolSelection,
} from "./agent-tool-authorization";
import { type AgentToolName } from "./agent-capabilities";
import { type ActionItem, type ActionResult } from "./action-types";
import { addMinutesToIso, localDateTimeToUtcIso, normalizeIanaTimeZone } from "./calendar-time";
import { CRMService } from "./crm-service";
import { IntegrationService } from "./integrations";
import { touchNavCounts } from "./nav-counts-invalidate";
import { evaluateOutboundDialGate } from "./outbound-dial-gate";
import { searchLeads } from "./apollo-service";
import { getErrorMessage } from "./server-utils";
import { drizzle, log } from "./server-context";
import { postAgentNotification, getDefaultChannel } from "./slack-service";
import { superviseClientCommunication } from "./ai-supervisor";
import { loadTenantIntegrationConnections } from "./tenant-integration-connections";
import { sendTenantMessage } from "./twilio-service";

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

/** Action-engine names are not identical to live catalog names. */
const ACTION_TOOL_REQUIREMENTS: Readonly<Record<string, AgentToolName>> = {
  send_email: "send_email",
  send_text_message: "send_text_message",
  schedule_calendar: "book_appointment",
  update_crm_lead: "crm_log_call",
  create_internal_task: "create_followup_task",
  send_contract: "send_contract",
  prospect_leads: "enrich_lead",
  notify_slack: "send_slack_notification",
};

type ResolvedActionPolicy = {
  action: ActionItem;
  autonomy: "auto" | "draft";
  agentTimeZone: string | null;
};

/** Match twilio-service cleanPhone so gate/lead lookup use the same destination. */
function cleanOutboundSmsPhone(raw: string | null | undefined): string {
  const input = String(raw || "").replace(/^whatsapp:/i, "");
  const cleaned = input.replace(/[^0-9+]/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("+") ? `+${cleaned.slice(1).replace(/\+/g, "")}` : cleaned;
}

async function recoverSourceAgentId(
  userId: string,
  action: ActionItem,
  context: { sourceId: string; sourceType: string },
): Promise<string | null> {
  if (action.agentId) return action.agentId;
  if (context.sourceType !== "phone_call" || !context.sourceId) return null;

  const [call] = await drizzle
    .select({ agentId: schema.callLogs.agentId })
    .from(schema.callLogs)
    .where(
      and(
        eq(schema.callLogs.userId, userId),
        eq(schema.callLogs.vapiCallId, context.sourceId),
      ),
    )
    .limit(1);
  return call?.agentId || null;
}

async function resolveActionPolicy(
  userId: string,
  action: ActionItem,
  context: { sourceId: string; sourceType: string },
  autonomyOverride?: "auto" | "draft",
): Promise<ResolvedActionPolicy | ActionResult> {
  const recoveredAgentId = await recoverSourceAgentId(userId, action, context).catch((error) => {
    log.warn("Action source-agent recovery failed", {
      userId,
      sourceId: context.sourceId,
      sourceType: context.sourceType,
      error: getErrorMessage(error),
    });
    return null;
  });
  const scopedAction = recoveredAgentId ? { ...action, agentId: recoveredAgentId } : action;

  if (scopedAction.agentId) {
    const [agentRow] = await drizzle
      .select({
        enabledTools: schema.agents.enabledTools,
        timeZone: schema.agents.timezone,
        autonomyLevel: schema.agents.autonomyLevel,
        tenantAutonomyLevel: schema.settings.autonomyLevel,
        aiTier: schema.settings.aiTier,
        twilioMessagingEnabled: schema.settings.twilioMessagingEnabled,
        twilioLookupEnabled: schema.settings.twilioLookupEnabled,
      })
      .from(schema.agents)
      .leftJoin(schema.settings, eq(schema.settings.userId, schema.agents.userId))
      .where(and(eq(schema.agents.id, scopedAction.agentId), eq(schema.agents.userId, userId)))
      .limit(1);

    if (!agentRow) {
      return { success: false, error: "The requested agent does not belong to this account." };
    }

    const requiredTool = ACTION_TOOL_REQUIREMENTS[scopedAction.type];
    if (!requiredTool) {
      return { success: false, error: `Unsupported action type: ${scopedAction.type}` };
    }

    const connections = await loadTenantIntegrationConnections(userId).catch((error: unknown) => {
      log.warn("Action integration lookup failed; disabling connected actions", {
        userId,
        agentId: scopedAction.agentId,
        error: getErrorMessage(error),
      });
      return NO_TENANT_INTEGRATIONS;
    });
    const allowedTools = resolveAuthorizedAgentTools(
      sanitizePersistedAgentToolSelection(agentRow.enabledTools),
      {
        aiTier: agentRow.aiTier,
        twilioMessaging: Boolean(agentRow.twilioMessagingEnabled),
        twilioLookup: Boolean(agentRow.twilioLookupEnabled),
      },
      connections,
    );
    if (!allowedTools.includes(requiredTool)) {
      log.warn("Action blocked — agent tool or connection is unavailable", {
        userId,
        agentId: scopedAction.agentId,
        actionType: scopedAction.type,
        requiredTool,
      });
      return {
        success: false,
        error: `This agent is not authorized or connected for "${requiredTool}". Review the agent's active tools and Connections.`,
      };
    }

    const inheritedAutonomy = agentRow.tenantAutonomyLevel === "auto" ? "auto" : "draft";
    const autonomy =
      autonomyOverride ||
      (agentRow.autonomyLevel && agentRow.autonomyLevel !== "inherit"
        ? agentRow.autonomyLevel === "auto"
          ? "auto"
          : "draft"
        : inheritedAutonomy);

    return {
      action: scopedAction,
      autonomy,
      agentTimeZone: agentRow.timeZone || "UTC",
    };
  }

  const [settings] = await drizzle
    .select({ autonomyLevel: schema.settings.autonomyLevel })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);
  let autonomy = autonomyOverride || (settings?.autonomyLevel === "auto" ? "auto" : "draft");

  // Background extraction must never perform tenant-wide side effects when the
  // originating agent cannot be resolved. Explicit Account Holder approval may
  // still execute a tenant-scoped task through autonomyOverride="auto".
  if (!autonomyOverride && autonomy === "auto") {
    autonomy = "draft";
    log.warn("Unscoped autonomous action downgraded to draft", {
      userId,
      actionType: scopedAction.type,
      sourceId: context.sourceId,
      sourceType: context.sourceType,
    });
  }

  return { action: scopedAction, autonomy, agentTimeZone: null };
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
    const policy = await resolveActionPolicy(userId, action, context, autonomyOverride);
    if (!("action" in policy)) return policy;

    log.info("Executing action", {
      userId,
      type: policy.action.type,
      priority: policy.action.priority,
      autonomy: policy.autonomy,
      agentId: policy.action.agentId || null,
    });

    return runIdempotentActionExecution({
      userId,
      action: policy.action,
      sourceId: context.sourceId,
      sourceType: context.sourceType,
      phase: policy.autonomy,
      execute: () =>
        policy.autonomy === "auto"
          ? executeAutonomousAction(userId, policy.action, context, policy.agentTimeZone)
          : queueDraftAction(userId, policy.action, context),
    });
  } catch (error) {
    log.error("Action execution failed", {
      userId,
      actionType: action.type,
      error: getErrorMessage(error),
    });
    return { success: false, error: getErrorMessage(error) };
  }
}

async function executeAutonomousAction(
  userId: string,
  action: ActionItem,
  context: { sourceId: string; sourceType: string },
  agentTimeZone: string | null,
): Promise<ActionResult> {
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
        context: `Autonomy mode: auto. Source type: ${context.sourceType}.`,
      });
      if (!reviewed.approved) {
        return handleSendEmail(
          userId,
          {
            ...action,
            payload: {
              ...action.payload,
              subject: reviewed.subject || action.payload.subject,
              body: reviewed.body,
            },
            reasoning: `${action.reasoning || ""}\nSupervisor note: ${reviewed.rationale}`.trim(),
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
      return handleSendTextMessage(userId, action, context);
    case "schedule_calendar": {
      const rawTimeZone = action.payload.timezone || agentTimeZone;
      if (!rawTimeZone) {
        return {
          success: false,
          error: "An exact IANA timezone is required before scheduling a calendar event.",
        };
      }
      const timeZone = normalizeIanaTimeZone(rawTimeZone);
      const startTime = localDateTimeToUtcIso({
        date: action.payload.date,
        time: action.payload.time,
        timeZone,
      });
      const endTime = addMinutesToIso(startTime, 60);
      const calOk = await service.bookAppointment({
        title: action.payload.event_name || "Meeting",
        description: `${action.reasoning || "Scheduled via AI Agent"}\n\nConfirmed timezone: ${timeZone}.`,
        startTime,
        endTime,
        agentId: action.agentId,
      });
      return { success: calOk };
    }
    case "update_crm_lead":
      return executeCrmAction(userId, action);
    case "create_internal_task":
      return handleCreateInternalTask(userId, action, context);
    case "send_contract":
      return {
        success: false,
        error:
          "Automated contract sending is disabled until a tenant-owned DocuSign account and template registry are connected.",
      };
    case "prospect_leads":
      return handleProspectLeads(userId, action, context);
    case "notify_slack":
      return handleNotifySlack(userId, action);
    default:
      return { success: false, error: `Unsupported action type: ${action.type}` };
  }
}

async function queueDraftAction(
  userId: string,
  action: ActionItem,
  context: { sourceId: string; sourceType: string },
): Promise<ActionResult> {
  switch (action.type) {
    case "send_email":
      return handleSendEmail(userId, action, context);
    case "send_text_message":
      return handleDraftSendTextMessage(userId, action, context);
    case "schedule_calendar":
      return handleScheduleCalendar(userId, action, context);
    case "update_crm_lead":
      return queueCrmAction(userId, action, context);
    case "create_internal_task":
      return handleCreateInternalTask(userId, action, context);
    case "send_contract":
      return queueSideEffectAction(userId, action, context, "send_contract", "manual");
    case "prospect_leads":
      return queueSideEffectAction(userId, action, context, "prospect_leads", "apollo");
    case "notify_slack":
      return queueSideEffectAction(userId, action, context, "notify_slack", "slack");
    default:
      return { success: false, error: `Unsupported action type: ${action.type}` };
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
