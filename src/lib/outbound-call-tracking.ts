import { eq } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "./server-utils";

/** Summary written when Vapi accepts an outbound dial — replaced by end-of-call report. */
export const OUTBOUND_CALL_PLACEHOLDER_SUMMARY = "Outbound call in progress…";

/** pipeline_error marker while the call is ringing / in flight. */
export const OUTBOUND_CALL_DIALING_MARKER = "dialing";

export function isOutboundCallPlaceholder(row: {
  summary?: string | null;
  pipelineError?: string | null;
}): boolean {
  return (
    row.pipelineError === OUTBOUND_CALL_DIALING_MARKER ||
    row.summary === OUTBOUND_CALL_PLACEHOLDER_SUMMARY
  );
}

/**
 * Insert a stub call log as soon as Vapi accepts the dial so Phone → Call
 * History shows the attempt before the end-of-call webhook lands.
 */
export async function recordOutboundCallPlaced(input: {
  userId: string;
  agentId: string;
  vapiCallId: string;
  customerNumber: string;
}): Promise<void> {
  try {
    await drizzle.insert(schema.callLogs).values({
      userId: input.userId,
      vapiCallId: input.vapiCallId,
      agentId: input.agentId,
      direction: "outbound",
      customerNumber: input.customerNumber,
      durationSeconds: 0,
      cost: "0",
      summary: OUTBOUND_CALL_PLACEHOLDER_SUMMARY,
      transcript: "",
      pipelineError: OUTBOUND_CALL_DIALING_MARKER,
    });
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    if ((err as { code?: string })?.code === "23505" || /duplicate key/i.test(msg)) {
      return;
    }
    log.warn("Outbound call placeholder log skipped", {
      vapiCallId: input.vapiCallId,
      error: msg,
    });
  }
}

export async function findCallLogByVapiCallId(vapiCallId: string) {
  const [row] = await drizzle
    .select({
      id: schema.callLogs.id,
      summary: schema.callLogs.summary,
      pipelineError: schema.callLogs.pipelineError,
    })
    .from(schema.callLogs)
    .where(eq(schema.callLogs.vapiCallId, vapiCallId))
    .limit(1);
  return row ?? null;
}
