import * as schema from "../db/schema";
import { normalizeDncPhone } from "./compliance";
import { reportError } from "./error-reporter";
import { auditLogger, drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";

/**
 * Persist a spoken opt-out before metering or call-finalization work. Throwing
 * on a database failure keeps the provider retry path fail-closed for the
 * legally significant suppression write.
 */
export async function persistTranscriptDncSuppression(input: {
  userId: string;
  callId: string | null;
  rawCallerNumber: string;
  matchedPattern: string | undefined;
}): Promise<void> {
  const normalizedCallerNumber = normalizeDncPhone(input.rawCallerNumber);
  if (!normalizedCallerNumber) {
    const error = new Error(
      "Transcript contained a DNC request without a suppressible caller number",
    );
    log.error("transcript DNC suppression missing caller number", {
      userId: input.userId,
      callId: input.callId,
    });
    reportError(error, {
      userId: input.userId,
      callId: input.callId,
      tags: { compliance: "dnc_suppression_missing_number" },
    });
    return;
  }

  try {
    const inserted = await drizzle
      .insert(schema.dncList)
      .values({
        userId: input.userId,
        phone: normalizedCallerNumber,
        phoneRaw: input.rawCallerNumber,
        reason: "spoken opt-out on call",
        source: "call_transcript",
      })
      .onConflictDoNothing({
        target: [schema.dncList.userId, schema.dncList.phone],
      })
      .returning({ id: schema.dncList.id });

    if (inserted.length === 0) return;

    void auditLogger
      .logDnc("added", {
        userId: input.userId,
        count: 1,
        metadata: {
          phone: input.rawCallerNumber,
          source: "call_transcript",
          matched_pattern: input.matchedPattern || null,
        },
      })
      .catch((error) =>
        log.warn("audit logDnc(call_transcript) failed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );

    const { SentinelService } = await import("../services/sentinel");
    const sentinel = new SentinelService();
    void sentinel.terminateActiveCallsForNumber(normalizedCallerNumber, input.userId).catch((error) =>
      log.error("sentinel terminate-on-transcript-DNC failed", {
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  } catch (error) {
    log.error("transcript DNC suppression failed", {
      userId: input.userId,
      callId: input.callId,
      error: getErrorMessage(error),
    });
    reportError(error instanceof Error ? error : new Error("transcript DNC suppression failed"), {
      userId: input.userId,
      callId: input.callId,
      tags: { compliance: "dnc_suppression_failed" },
    });
    throw error;
  }
}
