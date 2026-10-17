/* eslint-disable @typescript-eslint/no-explicit-any -- Live tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import { and, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { NotificationService } from "../notifications";
import { createMeeting as createZoomMeeting } from "../zoom-service";
import { sanitizePhone } from "../agent-runtime-helpers";
import {
  CALLER_LINKED_LIVE_WRITE_DENIAL,
  PRIVATE_LIVE_READ_DENIAL,
} from "../unverified-live-tools";
import { recordEscalationOutcome } from "../call-reliability-capture";
import {
  externalEntityActionPolicyForUser,
  liveExternalActionPolicyForUser,
} from "../account-environment-policy";

import type { ToolCallContext, ToolCallResult } from "../agent-tool-types";

async function warmTransferExternalActionBlock(
  userId: string,
  phone: string | null,
): Promise<string | null> {
  try {
    const environmentPolicy = await liveExternalActionPolicyForUser(userId);
    if (!environmentPolicy.allowed) {
      return "I recorded this for the team's queue. Live alerts and transfers are disabled in this workspace.";
    }
    if (phone) {
      const entityPolicy = await externalEntityActionPolicyForUser(userId, { phone });
      if (!entityPolicy.allowed) {
        return "I recorded this for the team's queue, but that transfer destination is a showcase fixture and cannot be dialed.";
      }
    }
    return null;
  } catch {
    return "I recorded this for the team's queue. Live transfer eligibility could not be verified, so no transfer was started.";
  }
}

export async function handleWorkflowToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const { agent, agentVoiceName, drizzle, log, message, payload, toolCallId, webhookAgentId } =
    context;

  // Workflow Handlers
  if (fn === "generate_zoom_link") {
    try {
      const { topic, start_time, duration } = args || {};
      const zoomMeeting = await createZoomMeeting(agent.user_id, {
        topic,
        startTime: start_time,
        duration: duration ? Number(duration) : undefined,
      });
      return {
        toolCallId,
        result: zoomMeeting
          ? `Meeting link created: ${zoomMeeting.join_url}`
          : "I wasn't able to create the meeting link right now. I'll have someone follow up with the link.",
      };
    } catch {
      return {
        toolCallId,
        result:
          "I ran into a hiccup creating the meeting link. I'll have someone follow up with it.",
      };
    }
  }

  if (fn === "log_payment_promise") {
    try {
      const { amount_promised, payment_date, payment_method } = args || {};
      await drizzle.insert(schema.auditLog).values({
        userId: agent.user_id,
        action: "payment_promise",
        metadata: { amount_promised, payment_date, payment_method },
      });
      return {
        toolCallId,
        result: "Payment promise legally recorded in compliance ledger.",
      };
    } catch {
      return {
        toolCallId,
        result:
          "I wasn't able to record that commitment right now. Let me note the details and have someone confirm.",
      };
    }
  }

  if (fn === "create_support_ticket") {
    try {
      const { issue_summary, error_codes, severity } = args || {};
      const [task] = await drizzle
        .insert(schema.followUpTasks)
        .values({
          userId: agent?.user_id,
          agentId: webhookAgentId,
          taskType: "ticket",
          description: `[${severity.toUpperCase()}] ${issue_summary} (Codes: ${error_codes || "None"})`,
          priority: severity === "critical" ? "high" : severity === "high" ? "high" : "medium",
          status: "pending",
          sourceType: "phone_call",
          targetChannel: "manual",
        })
        .returning({ id: schema.followUpTasks.id });
      return {
        toolCallId,
        result: `Support ticket #${task.id.split("-")[0]} created.`,
      };
    } catch {
      return {
        toolCallId,
        result:
          "I wasn't able to create the support ticket. Tell the caller it could not be recorded and offer another contact channel. Do not promise follow-up.",
      };
    }
  }

  if (fn === "leave_voicemail") {
    return {
      toolCallId,
      result: "Voicemail recorded. Please say goodbye and end the call now.",
    };
  }

  if (fn === "schedule_callback") {
    return { toolCallId, result: CALLER_LINKED_LIVE_WRITE_DENIAL };
  }

  if (fn === "capture_customer_profile") {
    try {
      await drizzle.insert(schema.followUpTasks).values({
        userId: agent?.user_id,
        agentId: webhookAgentId,
        taskType: "customer_profile_captured",
        description: JSON.stringify(args),
        priority: "medium",
        status: "completed",
        sourceType: "phone_call",
        targetChannel: "manual",
        createdAt: new Date(),
      });
      return {
        toolCallId,
        result: "Customer profile structured and saved.",
      };
    } catch {
      return { toolCallId, result: "I've noted your information." };
    }
  }

  if (fn === "escalate_to_human") {
    const callId =
      (payload.call as { id?: string } | undefined)?.id ||
      (message.call as { id?: string } | undefined)?.id;
    try {
      const { reason } = args || {};

      // Look up this agent's escalation routing config to decide:
      //   - Warm-transfer the live caller? (handoff_enabled + phone)
      //   - Or just send an async alert (default)?
      // One DB read; failures degrade gracefully to the async path.
      let warmTransferPhone: string | null = null;
      if (agent?.id) {
        try {
          const [row] = await drizzle
            .select({
              phone: schema.agents.escalationPhone,
              transferPhone: schema.agents.transferPhone,
              enabled: schema.agents.escalationHandoffEnabled,
            })
            .from(schema.agents)
            .where(eq(schema.agents.id, agent.id))
            .limit(1);
          // transferPhone is the workspace-chat-settable destination ("transfer
          // calls to 555-…"); it backs up escalationPhone so the field the
          // planner writes actually influences live transfers instead of being
          // stored and never read.
          const destination = sanitizePhone(row?.phone?.trim() || row?.transferPhone?.trim() || "");
          if (row?.enabled && destination.replace(/\D/g, "").length >= 10) {
            warmTransferPhone = destination;
          }
        } catch (lookupErr: any) {
          log.warn("escalate_to_human: warm-transfer lookup failed; using async path", {
            agentId: agent.id,
            error: lookupErr?.message,
          });
        }
      }

      if (!agent?.user_id) throw new Error("Escalation tenant could not be resolved");

      // A customer-facing promise is backed by a durable operator task before
      // best-effort Slack/SMS/email fan-out. Replayed tool calls reuse the
      // same call/tool source instead of fabricating a second obligation.
      const escalationSourceId = callId || `tool:${toolCallId}`;
      const [existingEscalation] = await drizzle
        .select({ id: schema.followUpTasks.id })
        .from(schema.followUpTasks)
        .where(
          and(
            eq(schema.followUpTasks.userId, agent.user_id),
            eq(schema.followUpTasks.sourceType, "phone_call"),
            eq(schema.followUpTasks.sourceId, escalationSourceId),
            eq(schema.followUpTasks.taskType, "human_escalation"),
          ),
        )
        .limit(1);
      if (!existingEscalation) {
        await drizzle.insert(schema.followUpTasks).values({
          userId: agent.user_id,
          agentId: webhookAgentId,
          sourceType: "phone_call",
          sourceId: escalationSourceId,
          targetChannel: warmTransferPhone ? "voice" : "manual",
          taskType: "human_escalation",
          description: `Human escalation requested: ${reason || "Caller requested a human."}`,
          priority: "high",
          status: "pending",
          payload: {
            reason: reason || null,
            vapi_call_id: callId || null,
            tool_call_id: toolCallId,
          },
        });
      }

      // The durable operator task above is safe showcase behavior. Live
      // channel fan-out and PSTN warm transfer are not: keep both disabled for
      // demo/test workspaces, and keep reserved fixture destinations inert
      // even after an unsafe workspace promotion.
      const initialExternalActionBlock = await warmTransferExternalActionBlock(
        agent.user_id,
        warmTransferPhone,
      );
      if (initialExternalActionBlock) {
        return { toolCallId, result: initialExternalActionBlock };
      }

      // Pass agent.id so per-agent escalation overrides route the alert to the
      // right human. Channel fan-out improves speed, while the task above is
      // the durable source of truth if every provider is unavailable.
      const notifier = new NotificationService(agent.user_id, agent.id);
      await notifier.sendUrgentAlert({
        title: warmTransferPhone ? "Live Transfer Incoming" : "Agent Escalate to Human",
        message: warmTransferPhone
          ? `Caller is being warm-transferred to ${warmTransferPhone} now. Agent: ${agentVoiceName || "unknown"}. Reason: ${reason}`
          : `Agent ${agentVoiceName || "unknown"}, Reason: ${reason}`,
        callId: callId || "unknown",
      });

      if (warmTransferPhone) {
        // Notification fan-out can take long enough for an operator to
        // reclassify the tenant. Re-check after that await, then once more
        // after reliability persistence so the final check is adjacent to the
        // OpenAI SIP REFER that can cause live provider work.
        const postNotificationBlock = await warmTransferExternalActionBlock(
          agent.user_id,
          warmTransferPhone,
        );
        if (postNotificationBlock) {
          if (callId) {
            await recordEscalationOutcome({
              vapiCallId: callId,
              userId: agent.user_id,
              succeeded: false,
            });
          }
          return { toolCallId, result: postNotificationBlock };
        }

        // Tool results may include a `destination` field. The OpenAI SIP
        // session speaks `result` then REFERs the PSTN call to that number.
        if (callId) {
          await recordEscalationOutcome({
            vapiCallId: callId,
            userId: agent.user_id,
            succeeded: true,
          });
        }

        const finalExternalActionBlock = await warmTransferExternalActionBlock(
          agent.user_id,
          warmTransferPhone,
        );
        if (finalExternalActionBlock) {
          if (callId) {
            // Do not introduce another awaited gap after the final policy
            // decision. The durable task already records the obligation.
            void recordEscalationOutcome({
              vapiCallId: callId,
              userId: agent.user_id,
              succeeded: false,
            });
          }
          return { toolCallId, result: finalExternalActionBlock };
        }
        return {
          toolCallId,
          result: "Transferring you now, please hold.",
          destination: {
            type: "number",
            number: warmTransferPhone,
            message: "Please hold while I connect you with a team member.",
          },
        };
      }

      if (callId && agent?.user_id) {
        await recordEscalationOutcome({
          vapiCallId: callId,
          userId: agent.user_id,
          succeeded: true,
        });
      }
      return {
        toolCallId,
        result:
          "I recorded this escalation for the team. Tell the caller the request is in the team's queue, but do not promise a response time or guarantee that someone is immediately available.",
      };
    } catch {
      if (callId && agent?.user_id) {
        await recordEscalationOutcome({
          vapiCallId: callId,
          userId: agent.user_id,
          succeeded: false,
        });
      }
      return {
        toolCallId,
        result:
          "I couldn't record or send the escalation right now. Please use the business's other contact method or ask me to try again.",
      };
    }
  }

  if (fn === "view_recent_interactions") {
    return { toolCallId, result: PRIVATE_LIVE_READ_DENIAL };
  }

  return null;
}
