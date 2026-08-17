import { and, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  CALLBACK_REQUEST_MARKER,
  parseCallbackDatetime,
} from "./callback-engine";
import { LEAD_STATUS } from "./outbound-status";
import { PRESERVED_LEAD_STATUSES } from "./vapi-helpers";
import type { ToolCallContext, ToolCallResult } from "../routes/vapi/types";

const VALID_LEAD_OUTCOMES = new Set([
  "qualified",
  "not_interested",
  "callback_requested",
  "proposal_sent",
  "closed_won",
  "closed_lost",
]);

type NativeCallContext = {
  id?: unknown;
  provider?: unknown;
  leadId?: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function callContext(context: ToolCallContext): NativeCallContext {
  const payloadCall = context.payload.call;
  if (payloadCall && typeof payloadCall === "object" && !Array.isArray(payloadCall)) {
    return payloadCall as NativeCallContext;
  }
  const messageCall = context.message.call;
  return messageCall && typeof messageCall === "object" && !Array.isArray(messageCall)
    ? (messageCall as NativeCallContext)
    : {};
}

function exactNativeLead(context: ToolCallContext): {
  leadId: bigint;
  callId: string;
} | null {
  const call = callContext(context);
  if (call.provider !== "xai") return null;
  const leadId = String(call.leadId || "").trim();
  if (!/^\d+$/.test(leadId)) return null;
  return {
    leadId: BigInt(leadId),
    callId: String(call.id || "native-call").slice(0, 500),
  };
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Native outbound calls carry an authenticated lead id in their SIP correlation
 * token. Handle lead-mutating tools against that exact row before the legacy
 * phone-number fallback handlers. A phone number can legitimately appear in
 * several campaigns, so a fuzzy phone match can update or schedule the wrong
 * record even when the tool call itself is authentic.
 */
export async function handleNativeVoiceToolCall(
  fn: string,
  args: unknown,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const exact = exactNativeLead(context);
  if (!exact || !context.agent?.user_id || !context.agent?.id) return null;
  const values = record(args);

  if (fn === "update_lead_status") {
    const status = text(values.status, 80).toLowerCase();
    const notes = text(values.notes, 2_000);
    if (!VALID_LEAD_OUTCOMES.has(status) || !notes) {
      return {
        toolCallId: context.toolCallId,
        result:
          "The lead status was not updated because the outcome or notes were invalid. Reconfirm the call outcome before trying again.",
      };
    }

    return context.drizzle.transaction(async (tx: typeof context.drizzle) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`xai-outbound:${String(exact.leadId)}`}))`,
      );
      const [lead] = await tx
        .select({ status: schema.outboundLeads.status })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.id, exact.leadId),
            eq(schema.outboundLeads.userId, context.agent.user_id),
            eq(schema.outboundLeads.agentId, context.agent.id),
          ),
        )
        .limit(1);
      if (!lead) {
        return {
          toolCallId: context.toolCallId,
          result:
            "The exact lead for this native call could not be found, so no status was changed.",
        };
      }
      if (PRESERVED_LEAD_STATUSES.includes(lead.status || "")) {
        return {
          toolCallId: context.toolCallId,
          result: `The lead already has the protected status '${lead.status}', so it was not overwritten.`,
        };
      }

      await tx
        .update(schema.outboundLeads)
        .set({
          status,
          lastContactSummary: notes,
          lastCalledAt: new Date(),
        })
        .where(
          and(
            eq(schema.outboundLeads.id, exact.leadId),
            eq(schema.outboundLeads.userId, context.agent.user_id),
            eq(schema.outboundLeads.agentId, context.agent.id),
          ),
        );
      return {
        toolCallId: context.toolCallId,
        result: `Lead status updated to '${status}' for this exact call record.`,
      };
    });
  }

  if (fn === "schedule_callback") {
    const dueAt = parseCallbackDatetime(values.callback_datetime);
    const notes = text(values.notes, 2_000);
    if (!dueAt) {
      return {
        toolCallId: context.toolCallId,
        result:
          "The callback was not scheduled because the requested date and time could not be verified. Ask for an exact date, time, and timezone.",
      };
    }

    return context.drizzle.transaction(async (tx: typeof context.drizzle) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`xai-outbound:${String(exact.leadId)}`}))`,
      );
      const [lead] = await tx
        .select({
          id: schema.outboundLeads.id,
          metadata: schema.outboundLeads.metadata,
        })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.id, exact.leadId),
            eq(schema.outboundLeads.userId, context.agent.user_id),
            eq(schema.outboundLeads.agentId, context.agent.id),
          ),
        )
        .limit(1);
      if (!lead) {
        return {
          toolCallId: context.toolCallId,
          result:
            "The exact lead for this native call could not be found, so no callback was scheduled.",
        };
      }

      await tx
        .update(schema.outboundLeads)
        .set({
          callbackScheduledAt: dueAt,
          status: LEAD_STATUS.CALLBACK_SCHEDULED,
          metadata: {
            ...record(lead.metadata),
            callback_notes: notes || null,
            [CALLBACK_REQUEST_MARKER]: "phone_call",
            callback_deferrals: 0,
          },
        })
        .where(
          and(
            eq(schema.outboundLeads.id, exact.leadId),
            eq(schema.outboundLeads.userId, context.agent.user_id),
            eq(schema.outboundLeads.agentId, context.agent.id),
          ),
        );

      await tx.insert(schema.followUpTasks).values({
        userId: context.agent.user_id,
        agentId: context.agent.id,
        taskType: "callback",
        description: `Scheduled Callback: ${notes || "caller requested a return call"}`,
        priority: "high",
        status: "scheduled",
        sourceType: "phone_call",
        sourceId: exact.callId,
        targetChannel: "voice",
        dueDate: dueAt,
        createdAt: new Date(),
      });

      return {
        toolCallId: context.toolCallId,
        result: `Callback scheduled for ${dueAt.toISOString()}.`,
      };
    });
  }

  return null;
}
