import { and, eq, inArray, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle } from "./server-context";
import { toolAuditResultText } from "./post-call-follow-up";
import {
  classifyCallOutcome,
  messageContentFromTask,
  type CallOutcome,
} from "./call-outcome";

export type { CallOutcome } from "./call-outcome";
export { callOutcomeDetail, callOutcomeLabel, classifyCallOutcome } from "./call-outcome";
export type { CallHappened } from "./call-happened";
export { callHappenedDetail, callHappenedLabel, classifyCallHappened } from "./call-happened";

type CallFactRow = {
  vapiCallId?: string | null;
  outcomeTag?: string | null;
  endedReason?: string | null;
  transcript?: string | null;
  summary?: string | null;
  durationSeconds?: number | null;
  /** Precomputed presence flags, for callers that do not load the text. */
  hasTranscript?: boolean;
  hasSummary?: boolean;
};

/**
 * Attach what the call did, using the live email audit and saved follow-ups.
 *
 * The outcome comes from the shared classifier (./call-outcome), the same one
 * Insights Reliability aggregates, so a call is labelled identically on both
 * surfaces. A saved task only counts as "Message taken" when the task itself
 * carries the caller's message; a task without content — including a pending
 * send-email draft — is follow-up evidence, never a message.
 */
export async function annotateCallsWithHappened<T extends CallFactRow>(
  userId: string,
  calls: T[],
): Promise<Array<T & { happened: CallOutcome }>> {
  const ids = [
    ...new Set(calls.map((call) => call.vapiCallId).filter((id): id is string => Boolean(id))),
  ];
  const emailCalls = new Set<string>();
  const messageContentByCall = new Map<string, string>();
  const followUpCalls = new Set<string>();
  if (ids.length) {
    const [emailRows, taskRows] = await Promise.all([
      drizzle
        .select({ metadata: schema.auditLog.metadata })
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.userId, userId),
            eq(schema.auditLog.action, "agent_tool.send_email"),
            eq(schema.auditLog.eventType, "voice.tool_call"),
            sql`${schema.auditLog.metadata}->>'status' = 'completed'`,
            sql`${schema.auditLog.metadata}->>'callId' in (${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        ),
      drizzle
        .select({
          sourceId: schema.followUpTasks.sourceId,
          description: schema.followUpTasks.description,
          payload: schema.followUpTasks.payload,
        })
        .from(schema.followUpTasks)
        .where(
          and(
            eq(schema.followUpTasks.userId, userId),
            eq(schema.followUpTasks.sourceType, "phone_call"),
            inArray(schema.followUpTasks.sourceId, ids),
            inArray(schema.followUpTasks.taskType, ["internal_task", "send_email"]),
          ),
        ),
    ]);
    for (const row of emailRows) {
      const metadata =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      const callId = typeof metadata.callId === "string" ? metadata.callId : "";
      if (callId && toolAuditResultText(metadata).startsWith("SUBMISSION_OK")) {
        emailCalls.add(callId);
      }
    }
    for (const row of taskRows) {
      if (!row.sourceId) continue;
      followUpCalls.add(row.sourceId);
      if (!messageContentByCall.has(row.sourceId)) {
        const content = messageContentFromTask({
          description: row.description,
          payload: row.payload,
        });
        if (content) messageContentByCall.set(row.sourceId, content);
      }
    }
  }

  return calls.map((call) => ({
    ...call,
    happened: classifyCallOutcome({
      outcomeTag: call.outcomeTag,
      endedReason: call.endedReason,
      emailAccepted: Boolean(call.vapiCallId && emailCalls.has(call.vapiCallId)),
      messageContent: call.vapiCallId
        ? (messageContentByCall.get(call.vapiCallId) ?? null)
        : null,
      hasFollowUpTask: Boolean(call.vapiCallId && followUpCalls.has(call.vapiCallId)),
      hasTranscript: call.hasTranscript ?? Boolean(call.transcript?.trim()),
      hasSummary: call.hasSummary ?? Boolean(call.summary?.trim()),
      durationSeconds: call.durationSeconds,
    }),
  }));
}
