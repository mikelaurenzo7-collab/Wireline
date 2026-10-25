/** Read-only invoice/aggregation evidence. Never resends, adjusts, charges or clears a hold. */
import { and, eq, sql } from "drizzle-orm";
import { drizzle, tenantStore } from "../src/lib/server-context";
import { usageBillingPeriods, usageMeterEvents } from "../src/db/usage-billing-schema";
import { stripe, stripeSubscriptionIdForInvoice } from "../src/lib/stripe-helpers";
import { usagePriceId } from "../src/lib/usage-billing-config";

const args = process.argv.slice(2);
const value = (name: string) => args[args.indexOf(name) + 1];
const userId = args.includes("--user") ? value("--user") : "";
const periodKey = args.includes("--period") ? value("--period") : "";
const invoiceId = args.includes("--invoice") ? value("--invoice") : "";
if (
  !/^[0-9a-f-]{36}$/i.test(userId) ||
  !periodKey ||
  (invoiceId && !/^in_[A-Za-z0-9]+$/.test(invoiceId))
) {
  console.error(
    "Usage: node --import tsx scripts/stripe-usage-reconcile.mts --user UUID --period PERIOD_KEY [--invoice in_ID]",
  );
  process.exit(2);
}

try {
  await tenantStore.run(userId, async () => {
    const [period] = await drizzle
      .select()
      .from(usageBillingPeriods)
      .where(
        and(eq(usageBillingPeriods.userId, userId), eq(usageBillingPeriods.periodKey, periodKey)),
      )
      .limit(1);
    if (!period) throw new Error("The tenant's billing period does not exist.");
    const start = Math.floor(period.startsAt.getTime() / 60_000) * 60;
    const end = Math.ceil(period.endsAt.getTime() / 60_000) * 60;
    // Stripe summary windows are minute aligned. Include adjacent receipts in
    // those boundary minutes, and explicitly prevent an invoice-level pass.
    const rows = await drizzle
      .select()
      .from(usageMeterEvents)
      .where(
        and(
          eq(usageMeterEvents.userId, userId),
          sql`${usageMeterEvents.occurredAt} >= to_timestamp(${start})`,
          sql`${usageMeterEvents.occurredAt} < to_timestamp(${end})`,
        ),
      );
    const boundaryOverlap = rows.some((row) => row.periodKey !== periodKey);
    const meters = [];
    for (const key of ["work"] as const) {
      const priceId = usagePriceId(key, process.env, period.tier);
      if (!priceId) throw new Error(`The ${key} price is not configured.`);
      const price = await stripe.prices.retrieve(priceId);
      const meterId = price.recurring?.meter;
      if (!meterId) throw new Error(`The ${key} price has no meter.`);
      const meter = await stripe.billing.meters.retrieve(meterId);
      const selected = rows;
      if (
        selected.some(
          (row) => row.reportAttempt && row.reportAttempt.eventName !== meter.event_name,
        )
      )
        throw new Error(
          `The ${key} meter differs from the frozen requests. Resolve configuration drift first.`,
        );
      let aggregated = 0;
      for await (const summary of stripe.billing.meters.listEventSummaries(meterId, {
        customer: period.stripeCustomerId,
        start_time: start,
        end_time: end,
        limit: 100,
      }))
        aggregated += summary.aggregated_value;
      const accepted = selected
        .filter((row) => row.status === "reported")
        .reduce((total, row) => total + Number(row.reportAttempt?.value ?? 0), 0);
      const unresolved = selected.filter(
        (row) => !["reported", "skipped"].includes(row.status),
      ).length;
      const recent = selected.some(
        (row) => row.reportedAt && Date.now() - row.reportedAt.getTime() < 15 * 60_000,
      );
      meters.push({
        meter: key,
        accepted,
        aggregated,
        unresolved,
        aggregationDelayPossible: recent,
        matched: !unresolved && !recent && Math.abs(accepted - aggregated) < 0.00005,
      });
    }
    let invoice = null;
    if (invoiceId) {
      const current = await stripe.invoices.retrieve(invoiceId);
      const customerId =
        typeof current.customer === "string" ? current.customer : current.customer?.id;
      if (
        customerId !== period.stripeCustomerId ||
        stripeSubscriptionIdForInvoice(current) !== period.stripeSubscriptionId
      )
        throw new Error("The invoice does not belong to this tenant and subscription.");
      invoice = {
        status: current.status,
        currency: current.currency,
        subtotal: current.subtotal,
        total: current.total,
        amountPaid: current.amount_paid,
        amountRemaining: current.amount_remaining,
        paid: current.status === "paid" && current.amount_remaining === 0,
      };
    }
    const matched = meters.every((meter) => meter.matched) && !boundaryOverlap;
    console.log(
      JSON.stringify(
        {
          observedAt: new Date().toISOString(),
          readOnly: true,
          blockedReason: period.blockedReason,
          boundaryOverlap,
          meters,
          aggregationMatched: matched,
          invoice,
          invoiceReviewRequired: true,
          nextAction: matched
            ? "Review exact invoice lines, proration, tax and payment before resolving any period hold."
            : "Keep the hold; resolve missing, delayed or ambiguous receipts without replaying frozen attempts.",
        },
        null,
        2,
      ),
    );
    if (!matched) process.exitCode = 1;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Usage reconciliation failed.");
  process.exitCode = 1;
}
