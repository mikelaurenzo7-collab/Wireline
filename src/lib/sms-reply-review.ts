import { and, eq, inArray, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { handoffAdvisoryLockKey } from "./conversation-outcome";
import { queueNeedsYouNotice } from "./needs-you-notice";
import { touchNavCounts } from "./nav-counts-invalidate";
import { ACTIVE_OPERATOR_TASK_STATUSES } from "./operator-work-status";
import { formatPhone } from "./safe-number";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";

/** Marks the item this file writes, among the other follow-ups on a conversation. */
export const SMS_REPLY_REVIEW_KIND = "sms_reply_review";

const clean = (value: string, max: number) => {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

/**
 * A customer texted and the Bot's answer needs its owner: a refund, an
 * unverified fact, something that reads as sales. The Bot's suggested reply
 * used to be thrown away, and the text only showed as unread in Texts. It is
 * now handed to the owner in Needs You, with the reason and the suggestion,
 * and the owner is told by email as for anything else a Bot leaves them.
 *
 * One item per conversation: a later text that also needs the owner brings
 * the item up to date instead of adding another. Nothing is sent to the
 * customer here; the owner replies from the conversation.
 *
 * Never throws. The text stays unread in Texts whatever happens here.
 */
export async function handSmsReplyToOwner(input: {
  userId: string;
  agentId: string;
  threadId: string;
  inboundMessageId: string;
  customerNumber: string;
  suggestedReply: string;
  reason: string;
}): Promise<"filed" | "updated" | "already_filed" | "failed"> {
  const from = formatPhone(input.customerNumber, "") || "a customer";
  const suggestion = clean(input.suggestedReply, 320);
  const reason = clean(input.reason, 300) || "The reply needs your judgement before it goes out.";
  const payload = {
    kind: SMS_REPLY_REVIEW_KIND,
    thread_id: input.threadId,
    inbound_message_id: input.inboundMessageId,
    customer_number: input.customerNumber,
    suggested_reply: suggestion,
    reasoning: reason,
  };
  const description = suggestion
    ? `A text from ${from} needs your reply. Your Bot suggests: "${suggestion}"`
    : `A text from ${from} needs your reply.`;
  try {
    const outcome = await drizzle.transaction(async (tx) => {
      // The same lock the conversation's own hand-off and outcome use, so an
      // owner closing the conversation and this write cannot cross.
      const lockKey = handoffAdvisoryLockKey(input.userId, "sms_thread", input.threadId);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const [open] = await tx
        .select({ id: schema.followUpTasks.id, payload: schema.followUpTasks.payload })
        .from(schema.followUpTasks)
        .where(
          and(
            eq(schema.followUpTasks.userId, input.userId),
            eq(schema.followUpTasks.sourceType, "sms_thread"),
            eq(schema.followUpTasks.sourceId, input.threadId),
            eq(schema.followUpTasks.taskType, "follow_up"),
            inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES]),
            sql`${schema.followUpTasks.payload}->>'kind' = ${SMS_REPLY_REVIEW_KIND}`,
          ),
        )
        .limit(1);
      if (open) {
        const filedFor =
          open.payload && typeof open.payload === "object" && !Array.isArray(open.payload)
            ? (open.payload as Record<string, unknown>).inbound_message_id
            : null;
        // A retried job for the same text changes nothing.
        if (filedFor === input.inboundMessageId) return "already_filed" as const;
        await tx
          .update(schema.followUpTasks)
          .set({ description, payload })
          .where(
            and(
              eq(schema.followUpTasks.id, open.id),
              eq(schema.followUpTasks.userId, input.userId),
            ),
          );
        return "updated" as const;
      }
      await tx.insert(schema.followUpTasks).values({
        userId: input.userId,
        sourceType: "sms_thread",
        sourceId: input.threadId,
        targetChannel: "manual",
        agentId: input.agentId,
        customerInfo: { phone: input.customerNumber },
        payload,
        taskType: "follow_up",
        description,
        status: "pending",
        priority: "high",
      });
      return "filed" as const;
    });
    if (outcome === "filed") await queueNeedsYouNotice(input.userId);
    if (outcome !== "already_filed") touchNavCounts(input.userId);
    return outcome;
  } catch (error) {
    log.warn("A text reply that needs the owner could not be handed to them", {
      userId: input.userId,
      threadId: input.threadId,
      error: getErrorMessage(error),
    });
    return "failed";
  }
}
