/** Wholesale processing ceiling, separate from the customer's retail spending limit. */
import { and, eq, sql } from "drizzle-orm";
import { usageMeterEvents } from "../db/usage-billing-schema";
import { createUsageStore } from "./usage-billing-store";
import { priceMeterExact, usageTier, type UsageTierId } from "./usage-billing-catalog";

/** Reserve the plan's Computer budget, then at most 40% of its extra earned work. */
export function computerProviderBudgetUsd(
  computerWorkUsd: number,
  tier: UsageTierId = "starter",
): number {
  if (!Number.isFinite(computerWorkUsd) || computerWorkUsd < 0) return 0;
  const plan = usageTier(tier);
  return plan.computerBudgetUsd + 0.4 * Math.max(0, computerWorkUsd - plan.includedWorkUsd);
}

export async function usageComputerCostWindow(
  reader: Parameters<typeof createUsageStore>[0],
  userId: string,
  now: Date,
) {
  if (!reader) return null;
  const store = createUsageStore(reader);
  const identity = await store.billingIdentity(userId);
  const period = await store.billingPeriod(userId, identity.periodKey);
  if (
    !identity.usagePlanActive ||
    !period ||
    period.blockedReason ||
    period.stripeCustomerId !== identity.stripeCustomerId ||
    now < period.startsAt ||
    now >= period.endsAt
  )
    return null;
  const [row] = await reader
    .select({
      minutes: sql<string>`coalesce(sum(coalesce(${usageMeterEvents.billableQuantity}, ${usageMeterEvents.quantity})), 0)`,
    })
    .from(usageMeterEvents)
    .where(
      and(
        eq(usageMeterEvents.userId, userId),
        eq(usageMeterEvents.periodKey, identity.periodKey),
        eq(usageMeterEvents.meter, "computer_minutes"),
        sql`${usageMeterEvents.status} IN ('pending', 'reported')`,
      ),
    );
  // Only completed receipts earn more processing capacity; open reservations,
  // reconciliation holds and a higher customer cap cannot manufacture budget.
  const workUsd = priceMeterExact("computer_minutes", Number(row?.minutes ?? 0));
  return {
    start: period.startsAt,
    end: period.endsAt,
    key: identity.periodKey,
    limitUsd: computerProviderBudgetUsd(workUsd, period.tier),
  };
}
