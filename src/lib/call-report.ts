import { and, eq, inArray, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle, serialQueryBatch } from "./server-context";
import { toolAuditResultText } from "./post-call-follow-up";
import {
  classifyCallOutcome,
  deriveCallEmailState,
  messageContentFromTask,
  type CallEmailExecution,
  type CallOutcome,
} from "./call-outcome";

export type { CallOutcome } from "./call-outcome";
export {
  callOutcomeDetail,
  callOutcomeLabel,
  classifyCallOutcome,
  deriveCallEmailState,
} from "./call-outcome";
export type { CallEmailExecution, CallEmailState } from "./call-outcome";
export type { CallHappened } from "./call-happened";
export { callHappenedDetail, callHappenedLabel, classifyCallHappened } from "./call-happened";

/**
 * The appointment states that mean the call ended in a booking. "Requested" is
 * left out on purpose: it is waiting for the owner to confirm or decline.
 */
export const BOOKED_APPOINTMENT_STATUSES = [
  "Scheduled",
  "Confirmed",
  "Rescheduled",
  "Completed",
] as const;

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
  const emailTaskStatuses = new Map<string, Array<string | null>>();
  const emailExecutions = new Map<string, CallEmailExecution[]>();
  const bookedCalls = new Set<string>();
  if (ids.length) {
    // One pooled client for all five reads. As separate root queries they each
    // checked out their own tenant-scoped client, so a single Calls page held
    // the whole five-connection pool and a second request waited on it.
    const [emailRows, taskRows, emailTaskRows, emailExecutionRows, bookingRows] =
      await drizzle.transaction((tx) =>
        serialQueryBatch([
          tx
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
          tx
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
          // The approval record for emails this call produced: a send_email task
          // stays the truth until it completes (sent) or is withdrawn.
          tx
            .select({
              sourceId: schema.followUpTasks.sourceId,
              status: schema.followUpTasks.status,
            })
            .from(schema.followUpTasks)
            .where(
              and(
                eq(schema.followUpTasks.userId, userId),
                eq(schema.followUpTasks.sourceType, "phone_call"),
                inArray(schema.followUpTasks.sourceId, ids),
                eq(schema.followUpTasks.taskType, "send_email"),
              ),
            ),
          // The execution ledger for those approvals: an approved send records
          // its real outcome here, including failures the task row cannot show.
          tx
            .select({ metadata: schema.auditLog.metadata })
            .from(schema.auditLog)
            .where(
              and(
                eq(schema.auditLog.userId, userId),
                eq(schema.auditLog.eventType, "action.execution"),
                eq(schema.auditLog.resourceType, "action_engine_execution"),
                sql`${schema.auditLog.metadata}->>'actionType' = 'send_email'`,
                sql`${schema.auditLog.metadata}->>'sourceType' = 'phone_call'`,
                sql`${schema.auditLog.metadata}->>'phase' = 'auto'`,
                sql`${schema.auditLog.metadata}->>'sourceId' in (${sql.join(
                  ids.map((id) => sql`${id}`),
                  sql`, `,
                )})`,
              ),
            ),
          // Appointments the Bot booked on these calls. A request still waiting
          // for the owner is not a booking yet (the digest and the Bot both say
          // so), and a cancelled one no longer stands for what the call achieved.
          tx
            .select({ callId: schema.appointments.callId })
            .from(schema.appointments)
            .where(
              and(
                eq(schema.appointments.userId, userId),
                inArray(schema.appointments.callId, ids),
                inArray(schema.appointments.status, [...BOOKED_APPOINTMENT_STATUSES]),
              ),
            ),
        ]),
      );
    for (const row of bookingRows) {
      if (row.callId) bookedCalls.add(row.callId);
    }
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
    for (const row of emailTaskRows) {
      if (!row.sourceId) continue;
      const statuses = emailTaskStatuses.get(row.sourceId) ?? [];
      statuses.push(row.status);
      emailTaskStatuses.set(row.sourceId, statuses);
    }
    for (const row of emailExecutionRows) {
      const metadata =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      const callId = typeof metadata.sourceId === "string" ? metadata.sourceId : "";
      if (!callId) continue;
      const output =
        metadata.output && typeof metadata.output === "object" && !Array.isArray(metadata.output)
          ? (metadata.output as Record<string, unknown>)
          : {};
      const executions = emailExecutions.get(callId) ?? [];
      executions.push({
        status: typeof metadata.status === "string" ? metadata.status : null,
        success: typeof output.success === "boolean" ? output.success : null,
        queued: typeof output.queued === "boolean" ? output.queued : null,
      });
      emailExecutions.set(callId, executions);
    }
  }

  return calls.map((call) => ({
    ...call,
    happened: classifyCallOutcome({
      outcomeTag: call.outcomeTag,
      endedReason: call.endedReason,
      emailAccepted: Boolean(call.vapiCallId && emailCalls.has(call.vapiCallId)),
      emailState: deriveCallEmailState({
        liveAccepted: Boolean(call.vapiCallId && emailCalls.has(call.vapiCallId)),
        taskStatuses: call.vapiCallId ? (emailTaskStatuses.get(call.vapiCallId) ?? []) : [],
        executions: call.vapiCallId ? (emailExecutions.get(call.vapiCallId) ?? []) : [],
      }),
      messageContent: call.vapiCallId ? (messageContentByCall.get(call.vapiCallId) ?? null) : null,
      hasFollowUpTask: Boolean(call.vapiCallId && followUpCalls.has(call.vapiCallId)),
      hasBooking: Boolean(call.vapiCallId && bookedCalls.has(call.vapiCallId)),
      hasTranscript: call.hasTranscript ?? Boolean(call.transcript?.trim()),
      hasSummary: call.hasSummary ?? Boolean(call.summary?.trim()),
      durationSeconds: call.durationSeconds,
    }),
  }));
}
