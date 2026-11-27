import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import * as schema from "../db/schema";
import { runIdempotentActionExecution } from "./action-execution-idempotency";
import {
  NO_TENANT_INTEGRATIONS,
  isSystemRuntimeTool,
  resolveAuthorizedAgentTools,
  sanitizePersistedAgentToolSelection,
} from "./agent-tool-authorization";
import { type AgentToolName } from "./agent-capabilities";
import { type ActionItem, type ActionResult } from "./action-types";
import { addMinutesToIso, localDateTimeToUtcIso, normalizeIanaTimeZone } from "./calendar-time";
import { IntegrationService } from "./integrations";
import { actionExecutionMode } from "./bot-permission";
import { bookNativeAppointment, getNativeCalendarConfiguration } from "./native-calendar";
import { touchNavCounts } from "./nav-counts-invalidate";
import { evaluateOutboundDialGate } from "./outbound-dial-gate";
import { sanitizeUntrustedOutboundMetadata } from "./outbound-call-purpose";
import { screenManualOutbound } from "./outbound-manual-screening";
import {
  cleanOutboundSmsPhone,
  recordedCallIds,
  type TextSendConfirmations,
} from "./approved-text-confirmations";
import { getErrorMessage } from "./server-utils";
import { drizzle, log } from "./server-context";
import { postAgentNotification, getDefaultChannel } from "./slack-service";
import { ClientCommunicationBlockedError, superviseClientCommunication } from "./ai-supervisor";
import { resolveClientSenderIdentity } from "./client-sender-identity";
import { dispatchWebhook } from "./webhook-helpers";
import { runInBackground } from "./background-work";
import { loadTenantIntegrationConnections } from "./tenant-integration-connections";
import { getTenantChannelEntitlements } from "./channel-entitlements";
import { sendTenantMessage } from "./twilio-service";
import {
  externalEntityActionPolicyForUser,
  liveExternalActionPolicyForUser,
} from "./account-environment-policy";

/**
 * Insert a follow-up task and emit the advertised `task.created` webhook.
 * Every task producer in this engine funnels through here so the event the
 * webhook catalog promises actually fires (it previously had no producer).
 */
async function insertFollowUpTask(values: typeof schema.followUpTasks.$inferInsert): Promise<void> {
  const [created] = await drizzle
    .insert(schema.followUpTasks)
    .values(values)
    .returning({ id: schema.followUpTasks.id });
  runInBackground("task.created webhook dispatch", () =>
    dispatchWebhook(values.userId, "task.created", {
      task_id: created?.id != null ? Number(created.id) : undefined,
      task_type: values.taskType,
      description: values.description,
      priority: values.priority,
      status: values.status,
      target_channel: values.targetChannel ?? null,
      source_type: values.sourceType ?? null,
      source_id: values.sourceId ?? null,
      agent_id: values.agentId ?? null,
    }),
  );
}

/** Action-engine names are not identical to live catalog names. */
const ACTION_TOOL_REQUIREMENTS: Readonly<Record<string, AgentToolName>> = {
  send_email: "send_email",
  send_text_message: "send_text_message",
  schedule_calendar: "book_appointment",
  create_internal_task: "create_followup_task",
  send_contract: "send_contract",
  notify_slack: "send_slack_notification",
};

const AUTONOMOUS_LIVE_EXTERNAL_ACTIONS = new Set([
  "send_email",
  "send_text_message",
  "schedule_calendar",
  "notify_slack",
]);

type ResolvedActionPolicy = {
  action: ActionItem;
  autonomy: "auto" | "draft";
  agentTimeZone: string | null;
};

export type { TextSendConfirmations } from "./approved-text-confirmations";

export type ActionExecutionContext = {
  sourceId: string;
  sourceType: string;
  approvalTaskId?: string;
  textConfirmations?: TextSendConfirmations;
};

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
      and(eq(schema.callLogs.userId, userId), eq(schema.callLogs.vapiCallId, context.sourceId)),
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
    const entitlements = await getTenantChannelEntitlements(userId).catch((error: unknown) => {
      log.warn("Action channel lookup failed; disabling customer sends", {
        userId,
        agentId: scopedAction.agentId,
        errorClass: error instanceof Error ? error.name : typeof error,
      });
      return { channels: [] };
    });
    const allowedTools = resolveAuthorizedAgentTools(
      sanitizePersistedAgentToolSelection(agentRow.enabledTools),
      {
        aiTier: agentRow.aiTier,
        twilioMessaging: Boolean(agentRow.twilioMessagingEnabled),
        twilioLookup: Boolean(agentRow.twilioLookupEnabled),
        channels: entitlements.channels,
      },
      connections,
    );
    // A note for the owner reaches no customer system. It stays available
    // whatever the Bot's selected tools, as it does during a live call;
    // otherwise a Bot with a narrow selection loses the caller's request.
    if (!isSystemRuntimeTool(requiredTool) && !allowedTools.includes(requiredTool)) {
      log.warn("Action blocked, agent tool or connection is unavailable", {
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

    let calendarBookingMode: string | null = null;
    if (scopedAction.type === "schedule_calendar" && connections.native_calendar_configured) {
      const nativeCalendar = await getNativeCalendarConfiguration(userId).catch(() => null);
      calendarBookingMode = nativeCalendar?.settings.booking_mode ?? null;
    }
    // An explicit calendar Confirmation books through Calendar, including
    // owner approval, so Inbox does not add a second approval for the same time.
    const autonomy =
      autonomyOverride ||
      actionExecutionMode({
        agentLevel: agentRow.autonomyLevel,
        tenantLevel: agentRow.tenantAutonomyLevel,
        actionType: scopedAction.type,
        calendarBookingMode,
        nativeCalendarConfigured: Boolean(connections.native_calendar_configured),
      });

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
  context: ActionExecutionContext,
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
      approvalTask: context.approvalTaskId ? { id: context.approvalTaskId, action } : undefined,
      execute: () =>
        policy.autonomy === "auto"
          ? executeAutonomousAction(
              userId,
              policy.action,
              context,
              policy.agentTimeZone,
              // Nobody chose this send: no owner approved the item and no
              // caller of this function asked for it to run now.
              !autonomyOverride && !context.approvalTaskId,
            )
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
  context: ActionExecutionContext,
  agentTimeZone: string | null,
  unattended = false,
): Promise<ActionResult> {
  if (AUTONOMOUS_LIVE_EXTERNAL_ACTIONS.has(action.type)) {
    const environmentPolicy = await liveExternalActionPolicyForUser(userId);
    if (!environmentPolicy.allowed) {
      log.warn("Autonomous action blocked by account environment", {
        userId,
        actionType: action.type,
        accountEnvironment: environmentPolicy.environment ?? "missing",
        code: environmentPolicy.code,
      });
      // Refused before any provider was called, so the same action may run
      // again and a follow-up can wait for the owner instead of being lost.
      return { success: false, error: environmentPolicy.message, retryable: true };
    }
  }

  const service = new IntegrationService(userId);
  switch (action.type) {
    case "send_email": {
      // An email nobody chose to send waits for the owner. Its address was
      // not confirmed with anyone, and mail to a misheard address carries a
      // customer's details to a stranger. During a call the Bot reads the
      // address back and sends with the live tool; an owner's approval or
      // chat request is the owner's own choice.
      if (unattended) return handleSendEmail(userId, action, context);
      const entityPolicy = await externalEntityActionPolicyForUser(userId, {
        email: action.payload.to,
      });
      if (!entityPolicy.allowed) return { success: false, error: entityPolicy.message };
      let reviewed;
      try {
        const sender = await resolveClientSenderIdentity(userId, action.agentId);
        reviewed = await superviseClientCommunication({
          channel: "email",
          agentName: sender.botName,
          businessName: sender.businessName,
          source: "action_engine",
          purpose: action.reasoning || "autonomous follow-up",
          recipient: action.payload.to,
          subject: action.payload.subject,
          body: action.payload.body,
          context: `Autonomy mode: auto. Source type: ${context.sourceType}.`,
        });
      } catch (err) {
        // Keep an existing approval pending and editable. Only autonomous work
        // needs a new draft; requeueing an approval falsely reports it as sent.
        if (err instanceof ClientCommunicationBlockedError) {
          if (context.approvalTaskId) {
            return {
              success: false,
              errorCode: "COMMUNICATION_BLOCKED",
              error: `Edit this email before approving: ${err.message}`,
            };
          }
          return handleSendEmail(
            userId,
            {
              ...action,
              reasoning: `${action.reasoning || ""}\nBlocked by supervisor: ${err.message}`.trim(),
            },
            context,
          );
        }
        throw err;
      }
      const emailOk = await service.sendEmail({
        to: action.payload.to,
        subject: reviewed.subject || action.payload.subject,
        body: reviewed.body,
        ...(action.agentId ? { agentId: action.agentId } : {}),
      });
      return { success: emailOk };
    }
    case "send_text_message":
      return handleSendTextMessage(userId, action, context, unattended);
    case "schedule_calendar": {
      const nativeCalendar = await getNativeCalendarConfiguration(userId);
      if (nativeCalendar.configured) {
        const payload = action.payload;
        const appointment = await bookNativeAppointment(userId, {
          agentId: action.agentId,
          callId: context.sourceType === "phone_call" ? context.sourceId : undefined,
          date: payload.date,
          time: payload.time,
          timeZone: payload.timezone,
          customerName: typeof payload.customer_name === "string" ? payload.customer_name : "",
          serviceType: payload.service_type || payload.event_name,
          phoneNumber: payload.customer_number,
          notes: action.reasoning,
          ownerApproved: Boolean(context.approvalTaskId),
          requestKey: `native-calendar:action:${createHash("sha256")
            .update(
              JSON.stringify([
                context.sourceType,
                context.sourceId,
                context.approvalTaskId || null,
                action.agentId || null,
                payload.date,
                payload.time,
                payload.timezone,
                payload.customer_name,
                payload.service_type || payload.event_name,
              ]),
            )
            .digest("hex")}`,
        });
        if (
          !["Scheduled", "Confirmed", "Rescheduled", "Requested"].includes(appointment.status || "")
        ) {
          return {
            success: false,
            error: "The appointment is no longer scheduled. Check Calendar.",
          };
        }
        return {
          success: true,
          ...(appointment.status === "Requested" ? { queued: true } : {}),
          actionId: appointment.id,
        };
      }
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
      const endTime = addMinutesToIso(startTime, nativeCalendar.settings.duration_minutes);
      const calOk = await service.bookAppointment({
        title: action.payload.event_name || "Meeting",
        description: `${action.reasoning || "Scheduled by your Bot"}\n\nConfirmed timezone: ${timeZone}.`,
        startTime,
        endTime,
        agentId: action.agentId,
      });
      return { success: calOk };
    }
    case "create_internal_task":
      return handleCreateInternalTask(userId, action, context);
    case "send_contract":
      return {
        success: false,
        error:
          "Automated contract sending is disabled until a tenant-owned DocuSign account and template registry are connected.",
      };
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
    case "create_internal_task":
      return handleCreateInternalTask(userId, action, context);
    case "send_contract":
      return queueSideEffectAction(userId, action, context, "send_contract", "manual");
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
  await insertFollowUpTask({
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

/**
 * A text produced from a recorded call, to that call's number, is a requested
 * follow-up. The destination has to match the stored caller. A model-supplied
 * purpose cannot create this exemption.
 */
async function liveCallTextCounterpart(
  userId: string,
  phone: string,
  context: { sourceId: string; sourceType: string },
): Promise<{ requestedOnThisCall: boolean; callEndedAt: Date | null }> {
  const none = { requestedOnThisCall: false, callEndedAt: null };
  if (context.sourceType !== "phone_call" || !context.sourceId) return none;
  const ids = recordedCallIds(context.sourceId);
  if (!ids.length) return none;
  const calls = await drizzle
    .select({
      customerNumber: schema.callLogs.customerNumber,
      createdAt: schema.callLogs.createdAt,
      durationSeconds: schema.callLogs.durationSeconds,
    })
    .from(schema.callLogs)
    .where(and(eq(schema.callLogs.userId, userId), inArray(schema.callLogs.vapiCallId, ids)))
    .limit(1);
  const caller = cleanOutboundSmsPhone(calls[0]?.customerNumber);
  if (!caller || caller !== phone) return none;
  // The record is written when the call starts; its length is added at the end.
  const startedAt = calls[0]?.createdAt;
  const callEndedAt =
    startedAt instanceof Date
      ? new Date(startedAt.getTime() + Math.max(0, Number(calls[0]?.durationSeconds) || 0) * 1000)
      : null;
  return { requestedOnThisCall: true, callEndedAt };
}

/**
 * How long after a call the Bot may text the caller back on its own. The
 * rule that lets a reply skip calling hours covers a text "during a live call
 * or within an hour of an inbound text". A follow-up job can run long after
 * that: jobs are deferred while spend is paused, retried with backoff of up
 * to an hour, and recovered after a stall. A call at 8:50pm must not become a
 * text at 2am, so past this window the text waits for the owner.
 */
export const UNATTENDED_TEXT_WINDOW_MS = 15 * 60_000;

export async function screenApprovedText(input: {
  userId: string;
  phone: string;
  requestedOnThisCall: boolean;
  confirmations?: TextSendConfirmations;
  content?: string;
  leadId?: bigint | number | string;
  lastCalledAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}): Promise<
  | { ok: true; sales: boolean; contentWarning?: string | null }
  | { ok: false; error: string; errorCode?: string; sales: boolean }
> {
  // A model purpose cannot choose this. The stored caller is the only
  // non-sales exemption. Every other single recipient is one-off sales.
  const requestedPurpose = input.requestedOnThisCall ? "appointment_service" : "sales";
  const confirmations = input.confirmations;
  const manual = await screenManualOutbound({
    userId: input.userId,
    phone: input.phone,
    channel: "sms",
    requestedPurpose,
    permissionConfirmed: confirmations?.permissionConfirmed === true,
    nonsalesConfirmed: confirmations?.nonsalesConfirmed === true,
    content: input.content,
    salesAttestationConfirmed: confirmations?.salesAttestationConfirmed === true,
    actorIp: confirmations?.actorIp,
    userAgent: confirmations?.userAgent,
  });
  if (!manual.ok) {
    return {
      ok: false,
      error: manual.error,
      errorCode: manual.code,
      sales: !input.requestedOnThisCall,
    };
  }
  const gate = await evaluateOutboundDialGate({
    userId: input.userId,
    phone: input.phone,
    leadId: input.leadId,
    lastCalledAt: input.lastCalledAt,
    metadata: sanitizeUntrustedOutboundMetadata(input.metadata || {}),
    isMarketingCall: manual.screening.isMarketingCall,
    requireFederalDncScreening: manual.screening.requireFederalDncScreening,
    salesScreening: "one_off",
    isLiveSessionFollowUp: input.requestedOnThisCall,
    hasExpressWrittenConsent: false,
    audit: manual.audit,
  });
  if (!gate.allowed) {
    return {
      ok: false,
      error: gate.customerMessage || "This text was not sent.",
      errorCode: gate.reason,
      sales: manual.screening.isMarketingCall,
    };
  }
  return {
    ok: true,
    sales: manual.screening.isMarketingCall,
    contentWarning: manual.contentWarning ?? null,
  };
}

async function handleSendTextMessage(
  userId: string,
  action: ActionItem,
  context: ActionExecutionContext,
  unattended = false,
): Promise<ActionResult> {
  const phone = cleanOutboundSmsPhone(action.payload.to);
  if (!phone) {
    return { success: false, error: "A destination number is required." };
  }
  const entityPolicy = await externalEntityActionPolicyForUser(userId, { phone });
  if (!entityPolicy.allowed)
    return { success: false, error: entityPolicy.message, retryable: true };

  const { requestedOnThisCall, callEndedAt } = await liveCallTextCounterpart(
    userId,
    phone,
    context,
  );
  // With nobody choosing this send, the Bot may only answer the person who
  // just called, and only while the call is recent. Either refusal sends
  // nothing and lets the same text wait for the owner.
  if (unattended) {
    if (!requestedOnThisCall) {
      return {
        success: false,
        retryable: true,
        errorCode: "UNATTENDED_TEXT_NOT_TO_CALLER",
        error: "Your Bot only texts the person who called on its own.",
      };
    }
    if (!callEndedAt || Date.now() - callEndedAt.getTime() > UNATTENDED_TEXT_WINDOW_MS) {
      return {
        success: false,
        retryable: true,
        errorCode: "UNATTENDED_TEXT_TOO_LATE",
        error: "Too long had passed since the call for your Bot to text on its own.",
      };
    }
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

  let screened: Awaited<ReturnType<typeof screenApprovedText>>;
  try {
    screened = await screenApprovedText({
      userId,
      phone,
      requestedOnThisCall,
      confirmations: context.textConfirmations,
      content: typeof action.payload.body === "string" ? action.payload.body : "",
      leadId: lead?.id,
      lastCalledAt: lead?.lastCalledAt,
      metadata: (lead?.metadata as Record<string, unknown> | null) || {},
    });
  } catch (err: unknown) {
    log.warn("action-engine SMS compliance gate failed, failing closed", {
      userId,
      error: getErrorMessage(err),
    });
    return { success: false, error: "Compliance gate failed (fail-closed).", retryable: true };
  }
  if (!screened.ok) {
    // Screening runs before any carrier request; the owner can fix the cause
    // (a consent box, quiet hours) and approve the same task again.
    return {
      success: false,
      error: screened.error,
      errorCode: screened.errorCode,
      retryable: true,
    };
  }

  // A text an owner approved or asked for has been read by the owner. A text
  // the Bot sends on its own has been read by nobody, so it gets the same
  // review a live text and an email get, and it is never a sales message: a
  // sales text needs the owner's own confirmation. A refusal, or a review that
  // could not run, sends nothing and says so, which lets it wait for the owner.
  let body = action.payload.body;
  if (unattended) {
    if (screened.contentWarning) {
      return {
        success: false,
        retryable: true,
        errorCode: "UNATTENDED_TEXT_READS_AS_SALES",
        error: "This reads like a sales message, which needs your own confirmation to send.",
      };
    }
    try {
      const sender = await resolveClientSenderIdentity(userId, action.agentId);
      const reviewed = await superviseClientCommunication({
        channel: "sms",
        agentName: sender.botName,
        businessName: sender.businessName,
        source: "action_engine",
        purpose: action.reasoning || "follow-up the caller asked for",
        recipient: phone,
        body: typeof action.payload.body === "string" ? action.payload.body : "",
        context: `Autonomy mode: auto. Source type: ${context.sourceType}.`,
      });
      body = reviewed.body;
    } catch (err) {
      const blocked = err instanceof ClientCommunicationBlockedError;
      if (!blocked) {
        log.warn("action-engine text review unavailable, nothing sent", {
          userId,
          error: getErrorMessage(err),
        });
      }
      return {
        success: false,
        retryable: true,
        errorCode: blocked ? "COMMUNICATION_BLOCKED" : "COMMUNICATION_REVIEW_UNAVAILABLE",
        error: blocked
          ? `The message review held this text: ${getErrorMessage(err)}`
          : "The message review was unavailable, so this text was not sent.",
      };
    }
  }

  const sent = await sendTenantMessage(userId, {
    to: phone,
    body,
    agentId: action.agentId,
  });
  return smsActionResult(sent);
}

/**
 * A text that was refused before Twilio, or that Twilio definitively
 * rejected, delivered nothing and may be approved again. An accepted or
 * ambiguous send stays final so a retry can never text twice.
 */
export function smsActionResult(sent: {
  ok: boolean;
  reason?: string;
  code?: string;
  providerOutcomeAmbiguous?: boolean;
  doNotResend?: boolean;
}): ActionResult {
  if (sent.ok) return { success: true };
  const unsent = sent.providerOutcomeAmbiguous !== true && sent.doNotResend !== true;
  return {
    success: false,
    error: sent.reason || "SMS send failed",
    ...(sent.code ? { errorCode: sent.code } : {}),
    ...(unsent ? { retryable: true } : {}),
  };
}

async function handleDraftSendTextMessage(
  userId: string,
  action: ActionItem,
  context: { sourceId: string; sourceType: string },
): Promise<ActionResult> {
  await insertFollowUpTask({
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
  await insertFollowUpTask({
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

async function handleCreateInternalTask(
  userId: string,
  action: ActionItem,
  context: { sourceId: string; sourceType: string },
): Promise<ActionResult> {
  await insertFollowUpTask({
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
  await insertFollowUpTask({
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

/**
 * A note for the owner, written directly: no tool check, no approval ledger.
 *
 * This is the last resort when a follow-up could not be finished or saved any
 * other way, so nothing may stand between it and the owner's list. The ledger
 * would remember a failed write as final and hand that failure back on every
 * retry; here a failure throws, the queue retries, and a repeat finds the
 * note it already wrote.
 */
export async function recordOwnerNote(
  userId: string,
  note: {
    description: string;
    priority?: ActionItem["priority"];
    agentId?: string;
    sourceId: string;
    sourceType: string;
  },
): Promise<void> {
  const description = note.description.trim().slice(0, 2000) || "Your Bot left you a follow-up.";
  const [existing] = await drizzle
    .select({ id: schema.followUpTasks.id })
    .from(schema.followUpTasks)
    .where(
      and(
        eq(schema.followUpTasks.userId, userId),
        eq(schema.followUpTasks.sourceType, note.sourceType),
        eq(schema.followUpTasks.sourceId, note.sourceId),
        eq(schema.followUpTasks.taskType, "internal_task"),
        eq(schema.followUpTasks.description, description),
      ),
    )
    .limit(1);
  if (existing) return;
  await insertFollowUpTask({
    userId,
    agentId: note.agentId,
    taskType: "internal_task",
    description,
    priority: note.priority || "medium",
    status: "pending",
    sourceType: note.sourceType,
    sourceId: note.sourceId,
    targetChannel: "manual",
  });
  await touchNavCounts(userId);
}

async function handleNotifySlack(userId: string, action: ActionItem): Promise<ActionResult> {
  const channel = await getDefaultChannel(userId);
  if (!channel) return { success: false, error: "No Slack channel is configured." };
  const sent = await postAgentNotification(
    userId,
    action.payload.message || action.reasoning || "BotBound action requires review.",
    { outcome: action.reasoning || undefined },
  );
  return sent ? { success: true } : { success: false, error: "Slack notification failed." };
}
