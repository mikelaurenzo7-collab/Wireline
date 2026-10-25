/** Stripe accepts meter events asynchronously. HTTP acceptance is not settlement. */
import { and, eq, inArray, sql } from "drizzle-orm";
import { usageBillingPeriods, usageMeterEvents } from "../db/usage-billing-schema";
import { drizzle, log } from "./server-context";
import { usageMeterEventName } from "./usage-billing-config";
import { USAGE_METERS, type UsageMeterKey } from "./usage-billing-catalog";
import {
  claimStripeEvent,
  completeStripeEventClaim,
  releaseStripeEventClaim,
} from "./stripe-event-claim";

export const USAGE_METER_ERROR_TYPES = [
  "v1.billing.meter.error_report_triggered",
  "v1.billing.meter.no_meter_found",
];

export type MeterErrorNotice = {
  id: string;
  type: string;
  data: {
    reason: {
      error_count: number;
      error_types: Array<{
        code: string;
        error_count: number;
        sample_errors: Array<{ request?: { identifier?: string } }>;
      }>;
    };
  };
};

/** Samples need not enumerate every error. Never infer that unsampled work succeeded. */
export function meterErrorScope(event: MeterErrorNotice) {
  if (!USAGE_METER_ERROR_TYPES.includes(event.type)) throw new Error("Unexpected meter event type");
  const count = event.data?.reason?.error_count;
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid meter error count");
  const identifiers = new Set<string>();
  let samples = 0;
  for (const kind of event.data.reason.error_types) {
    for (const sample of kind.sample_errors) {
      const identifier = sample.request?.identifier;
      if (typeof identifier === "string" && identifier) {
        identifiers.add(identifier);
        samples++;
      }
    }
  }
  return {
    identifiers: [...identifiers],
    complete: samples === count && identifiers.size === count,
  };
}

/** Called only with an authenticated Stripe API response, never client JSON. */
export async function holdStripeMeterError(
  event: MeterErrorNotice,
  eventName: string | null,
): Promise<number> {
  const scope = meterErrorScope(event);
  const configuredNames = (Object.keys(USAGE_METERS) as UsageMeterKey[]).map((key) =>
    usageMeterEventName(key),
  );
  if (eventName && !configuredNames.includes(eventName)) return 0;
  const known = scope.identifiers.filter((id) => id.startsWith("usage:"));
  if (scope.complete && !known.length) return 0;
  // For incomplete error samples, conservatively freeze all recent periods
  // that submitted to this meter. Replaying unknown events could double bill.
  const matching = scope.complete
    ? sql`${usageMeterEvents.reportAttempt}->>'identifier' IN (${sql.join(
        known.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : and(
        sql`${usageMeterEvents.reportAttempt}->>'eventName' IN (${sql.join(
          (eventName ? [eventName] : configuredNames).map((name) => sql`${name}`),
          sql`, `,
        )})`,
        sql`${usageMeterEvents.occurredAt} >= now() - interval '35 days'`,
      );
  const periods = await drizzle
    .selectDistinct({ userId: usageMeterEvents.userId, periodKey: usageMeterEvents.periodKey })
    .from(usageMeterEvents)
    .where(and(matching, sql`${usageMeterEvents.reportAttempt} IS NOT NULL`));
  for (const period of periods) {
    await drizzle.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`usage-report:${period.userId}`}))`,
      );
      await tx
        .update(usageBillingPeriods)
        .set({
          blockedReason: sql`coalesce(${usageBillingPeriods.blockedReason}, 'stripe_meter_error_requires_reconciliation')`,
        })
        .where(
          and(
            eq(usageBillingPeriods.userId, period.userId),
            eq(usageBillingPeriods.periodKey, period.periodKey),
          ),
        );
      await tx
        .update(usageMeterEvents)
        .set({
          status: "reconciliation_required",
          lastError: `stripe_async_meter_error:${event.id}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(usageMeterEvents.userId, period.userId),
            eq(usageMeterEvents.periodKey, period.periodKey),
            matching,
            inArray(usageMeterEvents.status, ["pending", "reported"]),
          ),
        );
    });
  }
  if (periods.length)
    log.error("Stripe usage needs invoice reconciliation", {
      eventId: event.id,
      periods: periods.length,
    });
  return periods.length;
}

/** Overlapping 29-day scans and durable event claims survive missed cron runs. */
export async function reconcileStripeMeterErrors(): Promise<void> {
  const [work] = await drizzle
    .select({ id: usageMeterEvents.id })
    .from(usageMeterEvents)
    .where(sql`${usageMeterEvents.reportAttempt} IS NOT NULL`)
    .limit(1);
  if (!work) return;
  const { stripe } = await import("./stripe-helpers");
  let scanned = 0;
  for await (const event of stripe.v2.core.events.list({
    types: USAGE_METER_ERROR_TYPES,
    limit: 100,
    created: { gte: Math.floor(Date.now() / 1000) - 29 * 86400 },
  })) {
    if (++scanned > 1000)
      throw new Error("Stripe meter reconciliation backlog exceeds its safety limit");
    if (
      event.type !== "v1.billing.meter.error_report_triggered" &&
      event.type !== "v1.billing.meter.no_meter_found"
    )
      continue;
    const result = await claimStripeEvent(event.id, event.type);
    if (result.kind === "already_processed") continue;
    if (result.kind === "in_flight")
      throw new Error("Stripe meter error reconciliation is already running");
    try {
      const eventName =
        event.type === "v1.billing.meter.error_report_triggered"
          ? (await stripe.billing.meters.retrieve(event.related_object.id)).event_name
          : null;
      await holdStripeMeterError(event, eventName);
      await completeStripeEventClaim(result.claim);
    } catch (error) {
      await releaseStripeEventClaim(result.claim);
      throw error;
    }
  }
}
