import { and, eq, inArray, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle } from "./server-context";
import { toolAuditResultText } from "./post-call-follow-up";
import { classifyCallHappened, type CallHappened } from "./call-happened";

export type { CallHappened } from "./call-happened";
export { callHappenedDetail, callHappenedLabel, classifyCallHappened } from "./call-happened";

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
  }

  return calls.map((call) => ({
    ...call,
    happened: classifyCallHappened({
      outcomeTag: call.outcomeTag,
      endedReason: call.endedReason,
      emailAccepted: Boolean(call.vapiCallId && emailCalls.has(call.vapiCallId)),
      messageTaken: Boolean(call.vapiCallId && messageCalls.has(call.vapiCallId)),
    }),
  }));
}
