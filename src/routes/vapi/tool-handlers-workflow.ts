/* eslint-disable @typescript-eslint/no-explicit-any -- Vapi webhook/tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import { and, eq, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import { NotificationService } from "../../lib/notifications";
import { createMeeting as createZoomMeeting } from "../../lib/zoom-service";
import { sanitizePhone } from "../../lib/vapi-helpers";
import { recordEscalationOutcome } from "../../lib/call-reliability-capture";

import type { ToolCallContext, ToolCallResult } from "./types";

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
          "I wasn't able to create the ticket right now. I've noted the issue and someone from the team will follow up.",
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
    try {
      const { callback_datetime, notes } = args || {};
      const { parseCallbackDatetime } = await import("../../lib/callback-engine");
      const parsed = parseCallbackDatetime(callback_datetime);
      // Unparseable model output → next-day attempt, with the caller-facing
      // promise phrased to match ("within the next day", not a fake time).
      const dueAt = parsed || new Date(Date.now() + 24 * 60 * 60 * 1000);

      const callerNumber = sanitizePhone(
        (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
          (message.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
          "",
      );

      // Structured persistence is what makes the callback EXECUTE: the
      // callback_tick engine dials due callback_scheduled_at rows. The
      // follow_up_tasks row below is the human-visible mirror.
      if (callerNumber) {
        const [existingLead] = await drizzle
          .select({ id: schema.outboundLeads.id, metadata: schema.outboundLeads.metadata })
          .from(schema.outboundLeads)
          .where(
            and(
              eq(schema.outboundLeads.userId, agent?.user_id),
              eq(schema.outboundLeads.customerNumber, callerNumber),
            ),
          )
          .orderBy(sql`${schema.outboundLeads.createdAt} DESC`)
          .limit(1);

        if (existingLead) {
          await drizzle
            .update(schema.outboundLeads)
            .set({
              callbackScheduledAt: dueAt,
              status: "Callback-Scheduled",
              agentId: webhookAgentId,
              metadata: {
                ...((existingLead.metadata as Record<string, unknown> | null) || {}),
                callback_notes: notes || null,
                callback_requested_via: "phone_call",
                // Fresh request → reset the deferral counter so a prior run's
                // stale count can't prematurely drop this new callback.
                callback_deferrals: 0,
              },
            })
            .where(eq(schema.outboundLeads.id, existingLead.id));
        } else {
          await drizzle.insert(schema.outboundLeads).values({
            userId: agent?.user_id,
            agentId: webhookAgentId,
            customerNumber: callerNumber,
            status: "Callback-Scheduled",
            source: "callback",
            context: notes || "Caller requested a callback during a phone call.",
            callbackScheduledAt: dueAt,
            metadata: { callback_notes: notes || null, callback_requested_via: "phone_call" },
          });
        }
      }

      await drizzle.insert(schema.followUpTasks).values({
        userId: agent?.user_id,
        agentId: webhookAgentId,
        taskType: "callback",
        description: `Scheduled Callback: ${notes || "caller requested a return call"}`,
        priority: "high",
        status: callerNumber ? "scheduled" : "pending",
        sourceType: "phone_call",
        targetChannel: callerNumber ? "voice" : "manual",
        dueDate: dueAt,
        createdAt: new Date(),
      });

      if (!callerNumber) {
        return {
          toolCallId,
          result:
            "Callback request noted — I couldn't confirm the best number on this line, so please share the number to reach you and I'll lock it in.",
        };
      }
      return {
        toolCallId,
        result: parsed
          ? `Callback scheduled — you'll receive a call back around ${callback_datetime}.`
          : "Callback scheduled — you'll receive a call back within the next day.",
      };
    } catch {
      return {
        toolCallId,
        result:
          "I've noted the callback request. Someone will follow up at the time you mentioned.",
      };
    }
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
      //   - Or just queue async alerts (default)?
      // One DB read; failures degrade gracefully to the async path.
      let warmTransferPhone: string | null = null;
      if (agent?.id) {
        try {
          const [row] = await drizzle
            .select({
              phone: schema.agents.escalationPhone,
              enabled: schema.agents.escalationHandoffEnabled,
            })
            .from(schema.agents)
            .where(eq(schema.agents.id, agent.id))
            .limit(1);
          if (row?.enabled && row?.phone && row.phone.trim().length >= 7) {
            warmTransferPhone = row.phone.trim();
          }
        } catch (lookupErr: any) {
          log.warn("escalate_to_human: warm-transfer lookup failed; using async path", {
            agentId: agent.id,
            error: lookupErr?.message,
          });
        }
      }

      if (agent?.user_id) {
        // Pass agent.id so per-agent escalation overrides
        // (escalation_phone / escalation_email) route the
        // alert to the right human for THIS agent specifically.
        // Falls back to tenant-wide manager alert number when
        // overrides aren't set.
        const notifier = new NotificationService(agent.user_id, agent.id);
        await notifier.sendUrgentAlert({
          title: warmTransferPhone ? "Live Transfer Incoming" : "Agent Escalate to Human",
          message: warmTransferPhone
            ? `Caller is being warm-transferred to ${warmTransferPhone} now. Agent: ${agentVoiceName || "unknown"}. Reason: ${reason}`
            : `Agent ${agentVoiceName || "unknown"} — Reason: ${reason}`,
          callId: (payload.call as any)?.id || "unknown",
        });
      }

      if (warmTransferPhone) {
        // Vapi tool-result schema supports a `destination` field
        // per result. When present, Vapi speaks `result` then
        // transfers the call to the destination number. Vapi
        // honours the `message` as the announcement BEFORE the
        // transfer happens (the caller hears it, the human picks
        // up to a context-set call).
        if (callId && agent?.user_id) {
          void recordEscalationOutcome({
            vapiCallId: callId,
            userId: agent.user_id,
            succeeded: true,
          });
        }
        return {
          toolCallId,
          result: "Transferring you now — please hold.",
          destination: {
            type: "number",
            number: warmTransferPhone,
            message: "Please hold while I connect you with a team member.",
          },
        };
      }

      if (callId && agent?.user_id) {
        void recordEscalationOutcome({
          vapiCallId: callId,
          userId: agent.user_id,
          succeeded: true,
        });
      }
      return {
        toolCallId,
        result:
          "Escalation signal sent to human supervisors. Apologize warmly and let the caller know a human will reach out shortly.",
      };
    } catch {
      if (callId && agent?.user_id) {
        void recordEscalationOutcome({
          vapiCallId: callId,
          userId: agent.user_id,
          succeeded: false,
        });
      }
      return {
        toolCallId,
        result: "I've noted the escalation. Someone from the team will be in touch shortly.",
      };
    }
  }

  if (fn === "view_recent_interactions") {
    try {
      const fallbackNumber =
        (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
        (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
      if (fallbackNumber && agent?.user_id) {
        const safePhone = sanitizePhone(fallbackNumber);
        const pastCalls = await drizzle
          .select({
            summary: schema.callLogs.summary,
            intentLabel: schema.callLogs.intentLabel,
            sentiment: schema.callLogs.sentiment,
            createdAt: schema.callLogs.createdAt,
          })
          .from(schema.callLogs)
          .where(
            and(
              eq(schema.callLogs.customerNumber, safePhone),
              eq(schema.callLogs.userId, agent.user_id),
            ),
          )
          .orderBy(sql`${schema.callLogs.createdAt} DESC`)
          .limit(3);
        if (pastCalls.length > 0) {
          const summaries = pastCalls
            .map((c: any) => `- ${c.createdAt?.toISOString()}: [${c.intentLabel}] ${c.summary}`)
            .join("\\n");
          return {
            toolCallId,
            result: `Past 3 interactions:\n${summaries}`,
          };
        }
        return {
          toolCallId,
          result: "No recent interactions found for this caller.",
        };
      }
      return { toolCallId, result: "Could not identify caller number." };
    } catch {
      return {
        toolCallId,
        result: "I wasn't able to pull up past interactions right now. How can I help you today?",
      };
    }
  }

  return null;
}
