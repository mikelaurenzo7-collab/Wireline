/**
 * Per-tenant ceiling on simultaneous live calls, enforced at inbound
 * assistant-request time.
 *
 * The inbound grace gate reads post-call ledger state, so N simultaneous
 * inbound calls all passed it before any of them settled — a tenant could
 * accumulate N × (2400s × reserve) of provider spend from one burst. Outbound
 * is already admission-gated pre-dial (wallet, quota, dial limiter); this
 * closes the inbound side by degrading overflow to the bounded take-a-message
 * assistant instead of the full agent. Callers are never hung up on.
 *
 * The count reads live-floor presence (wireline_signal_presence), whose rows
 * are created on ringing/queued/in-progress and deleted on end. A lost end
 * webhook must not wedge the line shut, so only rows younger than the
 * staleness window count — comfortably above the 2400s per-call ceiling, so a
 * genuinely live call is never aged out of the count.
 *
 * Fail posture is OPEN, matching the inbound grace gate: a DB blip must not
 * degrade a paying tenant's line, and every admitted call remains individually
 * duration-capped.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";

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
        ),
      );
    return Number(row?.live ?? 0) >= inboundConcurrentCallCeiling();
  } catch (error: unknown) {
    log.error("inbound concurrency check failed, admitting call", {
      userId,
      error: getErrorMessage(error),
    });
    return false;
  }
}
