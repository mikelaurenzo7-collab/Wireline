import { and, eq, inArray, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle } from "./server-context";
import { toolAuditResultText } from "./post-call-follow-up";

export type CallHappened = "email_sent" | "message_taken" | "booked" | "missed" | "no_request";

export function classifyCallHappened(input: {
  outcomeTag?: string | null;
  endedReason?: string | null;
  emailAccepted?: boolean;
  messageTaken?: boolean;
}): CallHappened {
  if (input.emailAccepted) return "email_sent";
  if (input.outcomeTag === "booked") return "booked";
  if (input.messageTaken) return "message_taken";
  const ended = (input.endedReason || "").toLowerCase();
  if (
    input.outcomeTag === "unreachable" ||
    /silence-timed-out|voicemail|machine-detected|customer-busy|no-answer|did-not-answer/.test(
      ended,
    )
  ) {
    return "missed";
  }
  return "no_request";
}

export function callHappenedLabel(happened: CallHappened): string {
  switch (happened) {
    case "email_sent":
      return "Email sent";
    case "message_taken":
      return "Message taken";
    case "booked":
      return "Booked";
    case "missed":
      return "Missed";
    case "no_request":
      return "No request";
  }
}

export function callHappenedDetail(happened: CallHappened): string {
  switch (happened) {
    case "email_sent":
      return "The Bot sent the email during the call.";
    case "message_taken":
      return "A message was saved for you to review.";
    case "booked":
      return "An appointment was booked.";
    case "missed":
      return "The call was missed.";
    case "no_request":
      return "The caller did not ask for a follow-up.";
  }
}

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
