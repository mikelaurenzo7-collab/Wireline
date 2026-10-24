import { and, eq, inArray, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle } from "./server-context";
import { toolAuditResultText } from "./post-call-follow-up";
import {
  classifyCallHappened,
  deriveCallEmailState,
  type CallEmailExecution,
  type CallHappened,
} from "./call-happened";

export type { CallHappened } from "./call-happened";
export {
  callHappenedDetail,
  callHappenedLabel,
  classifyCallHappened,
  deriveCallEmailState,
} from "./call-happened";

type CallFactRow = {
  vapiCallId?: string | null;
  outcomeTag?: string | null;
  endedReason?: string | null;
};

/** Attach what the call did, using the live email audit and saved messages. */
export async function annotateCallsWithHappened<T extends CallFactRow>(
  userId: string,
  calls: T[],
): Promise<Array<T & { happened: CallHappened }>> {
  const ids = [
    ...new Set(calls.map((call) => call.vapiCallId).filter((id): id is string => Boolean(id))),
  ];
  const emailCalls = new Set<string>();
  const messageCalls = new Set<string>();
  const emailTaskStatuses = new Map<string, Array<string | null>>();
  const emailExecutions = new Map<string, CallEmailExecution[]>();
  if (ids.length) {
    const [emailRows, taskRows, emailTaskRows, emailExecutionRows] = await Promise.all([
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
        .select({ sourceId: schema.followUpTasks.sourceId })
        .from(schema.followUpTasks)
        .where(
          and(
            eq(schema.followUpTasks.userId, userId),
            eq(schema.followUpTasks.sourceType, "phone_call"),
            inArray(schema.followUpTasks.sourceId, ids),
            eq(schema.followUpTasks.taskType, "internal_task"),
          ),
        ),
      // The approval record for emails this call produced: a send_email task
      // stays the truth until it completes (sent) or is withdrawn.
      drizzle
        .select({ sourceId: schema.followUpTasks.sourceId, status: schema.followUpTasks.status })
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
      drizzle
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
      if (row.sourceId) messageCalls.add(row.sourceId);
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
    happened: classifyCallHappened({
      outcomeTag: call.outcomeTag,
      endedReason: call.endedReason,
      emailState: deriveCallEmailState({
        liveAccepted: Boolean(call.vapiCallId && emailCalls.has(call.vapiCallId)),
        taskStatuses: call.vapiCallId ? (emailTaskStatuses.get(call.vapiCallId) ?? []) : [],
        executions: call.vapiCallId ? (emailExecutions.get(call.vapiCallId) ?? []) : [],
      }),
      messageTaken: Boolean(call.vapiCallId && messageCalls.has(call.vapiCallId)),
    }),
  }));
}
