/**
 * Per-tenant ceiling on simultaneous live calls, enforced at inbound
 * assistant-request time.
 *
 * The inbound grace gate reads post-call ledger state, so N simultaneous
 * inbound calls all passed it before any of them settled — a tenant could
 * accumulate N × (3600s × reserve) of provider spend from one burst. Outbound
 * is already admission-gated pre-dial (wallet, quota, dial limiter); this
 * closes the inbound side by refusing new AI work at known capacity exhaustion.
 * Already admitted calls keep their existing duration and settlement policy.
 *
 * The count reads live-floor presence (wireline_signal_presence), whose rows
 * are created on ringing/queued/in-progress and deleted on end. A lost end
 * webhook must not wedge the line shut, so only rows younger than the
 * staleness window count — comfortably above the 3600s per-call ceiling, so a
 * genuinely live call is never aged out of the count.
 *
 * A lookup failure is retryable before provider acceptance. Unknown concurrency
 * must not grant a full voice session after the separate AI cap is removed.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { AppError } from "./api-error";

const DEFAULT_INBOUND_CONCURRENT_CALL_CEILING = 10;
const PRESENCE_STALENESS_MS = 2 * 60 * 60 * 1000;

export function inboundConcurrentCallCeiling(): number {
  const parsed = Number.parseInt(process.env.WIRELINE_INBOUND_CONCURRENT_CALL_CEILING || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_INBOUND_CONCURRENT_CALL_CEILING;
}

export async function inboundConcurrencyExceeded(userId: string): Promise<boolean> {
  try {
    const freshSince = new Date(Date.now() - PRESENCE_STALENESS_MS);
    const [row] = await drizzle
      .select({ live: sql<string>`count(*)` })
      .from(schema.signalPresence)
      .where(
        and(
          eq(schema.signalPresence.userId, userId),
          gte(schema.signalPresence.startedAt, freshSince),
          // Outbound campaign presence uses `${agent} · Outbound`. Counting it
          // here would degrade inbound to take-message during dial bursts.
          sql`coalesce(${schema.signalPresence.label}, '') not like ${"% · Outbound"}`,
        ),
      );
    const live = Number(row?.live);
    if (!Number.isSafeInteger(live) || live < 0) {
      throw new Error("Voice concurrency lookup returned no valid count.");
    }
    return live >= inboundConcurrentCallCeiling();
  } catch (error: unknown) {
    log.error("inbound concurrency check failed closed", {
      userId,
      error: getErrorMessage(error),
    });
    throw AppError.serviceUnavailable("Voice capacity could not be verified. Please try again.");
  }
}
