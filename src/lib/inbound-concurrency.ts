/**
 * Per-tenant ceiling on simultaneous live calls. The early admission read is
 * advisory; each fresh SIP/fallback claim also holds the same tenant lock while
 * checking capacity and inserting its pending presence in the claim transaction.
 *
 * The inbound grace gate reads post-call ledger state, so N simultaneous
 * inbound calls all passed it before any of them settled — a tenant could
 * accumulate N × (3600s × reserve) of provider spend from one burst. Outbound
 * is already admission-gated pre-dial (wallet, quota, dial limiter); this
 * closes the inbound side by refusing new AI work at known capacity exhaustion.
 * Already admitted calls keep their existing duration and settlement policy.
 *
 * The count reads live-floor presence (wireline_signal_presence), whose rows
 * are created before provider acceptance/Dial and deleted on end. A lost end
 * webhook must not wedge the line shut, so only rows younger than the
 * staleness window count — comfortably above the 3600s per-call ceiling, so a
 * genuinely live call is never aged out of the count.
 *
 * A lookup failure is retryable before provider acceptance. Unknown concurrency
 * must not grant a full voice session after the separate AI cap is removed.
 */
import { and, eq, gte, or, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { AppError } from "./api-error";
import { planById } from "./plan-catalog";

const DEFAULT_INBOUND_CONCURRENT_CALL_CEILING = 10;
const PRESENCE_STALENESS_MS = 2 * 60 * 60 * 1000;

export function inboundConcurrentCallCeiling(): number {
  const parsed = Number.parseInt(process.env.WIRELINE_INBOUND_CONCURRENT_CALL_CEILING || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_INBOUND_CONCURRENT_CALL_CEILING;
}

type CapacityReader = Pick<typeof drizzle, "select">;
type CapacityTransaction = Parameters<Parameters<typeof drizzle.transaction>[0]>[0];

/** Caller must insert its pending presence before this transaction commits. */
export async function hasInboundCapacityInTransaction(
  tx: CapacityTransaction,
  userId: string,
): Promise<boolean> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`inbound-capacity:${userId}`}))`);
  return !(await inboundConcurrencyExceeded(userId, tx));
}

export async function inboundConcurrencyExceeded(
  userId: string,
  reader: CapacityReader = drizzle,
): Promise<boolean> {
  try {
    const freshSince = new Date(Date.now() - PRESENCE_STALENESS_MS);
    const [row] = await reader
      .select({ live: sql<string>`count(*)` })
      .from(schema.signalPresence)
      .where(
        and(
          eq(schema.signalPresence.userId, userId),
          or(
            gte(schema.signalPresence.startedAt, freshSince),
            eq(schema.signalPresence.status, "settling"),
          ),
          // Outbound campaign presence uses `${agent} · Outbound`. Counting it
          // here would refuse inbound during unrelated outbound dial bursts.
          sql`coalesce(${schema.signalPresence.label}, '') not like ${"% · Outbound"}`,
        ),
      );
    const live = Number(row?.live);
    if (!Number.isSafeInteger(live) || live < 0) {
      throw new Error("Voice concurrency lookup returned no valid count.");
    }
    const [subscription] = await reader
      .select({ plan: schema.subscriptions.plan })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId));
    // One-Bot channel packages share one pending/active inbound slot. Reading
    // the plan through the claim transaction keeps competing SIP/fallback
    // requests under the same tenant lock and protects their finite pool.
    const ceiling =
      planById(subscription?.plan)?.catalogFamily === "channels"
        ? 1
        : inboundConcurrentCallCeiling();
    return live >= ceiling;
  } catch (error: unknown) {
    log.error("inbound concurrency check failed closed", {
      userId,
      error: getErrorMessage(error),
    });
    throw AppError.serviceUnavailable("Voice capacity could not be verified. Please try again.");
  }
}
