import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { drizzle } from "../lib/server-context";
import { stripe, stripeAvailable } from "../lib/stripe-helpers";
import {
  getCapacityUpgradeStatus,
  scheduleCapacityUpgrade,
  releaseOwnedCapacitySchedule,
  type CapacityBinding,
} from "../lib/stripe-capacity-upgrade";
import { authenticateUser } from "../middleware/auth";
import { fencePayableBillingDuringAccountDeletion } from "../middleware/account-deletion-billing-fence";
import {
  enforceLaunchHardGate,
  enforceSelfServeBillingRelease,
} from "../middleware/launch-hard-gate";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
async function bindingFor(
  userId: string,
  reader: Pick<typeof drizzle, "select"> = drizzle,
): Promise<CapacityBinding | null> {
  const [row] = await reader
    .select({
      customerId: schema.subscriptions.stripeCustomerId,
      subscriptionId: schema.subscriptions.stripeSubscriptionId,
      planId: schema.subscriptions.plan,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);
  if (!row?.customerId || !row.subscriptionId) return null;
  return {
    userId,
    customerId: row.customerId,
    subscriptionId: row.subscriptionId,
    planId: row.planId,
  };
}
router.get(
  "/api/billing/capacity-upgrade",
  authenticateUser,
  async (req: AuthenticatedRequest, res) => {
    const binding = await bindingFor(req.user.id);
    if (!binding)
      return res.json({
        current_plan_id: null,
        interval: "month",
        effective_at: null,
        eligible_plan_ids: [],
        pending: null,
        available: false,
      });
    if (!stripeAvailable())
      throw AppError.serviceUnavailable("Billing capacity is temporarily unavailable.");
    return res.json(await getCapacityUpgradeStatus(binding, stripe));
  },
);
router.post(
  "/api/billing/capacity-upgrade",
  authenticateUser,
  enforceSelfServeBillingRelease,
  enforceLaunchHardGate,
  fencePayableBillingDuringAccountDeletion,
  async (req: AuthenticatedRequest, res) => {
    const targetId = req.body?.plan_id;
    if (typeof targetId !== "string" || !targetId.trim())
      throw AppError.badRequest("Choose a capacity.");
    if (!stripeAvailable())
      throw AppError.serviceUnavailable("Billing capacity is temporarily unavailable.");
    const result = await drizzle.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`billing-capacity:${req.user.id}`}))`,
      );
      const [deleting] = await tx
        .select({ id: schema.deletionQueue.id })
        .from(schema.deletionQueue)
        .where(
          and(
            eq(schema.deletionQueue.userId, req.user.id),
            inArray(schema.deletionQueue.status, ["pending", "purging"]),
          ),
        )
        .limit(1);
      if (deleting)
        throw new AppError(
          409,
          "ACCOUNT_DELETION_PENDING",
          "Cancel the pending account deletion before changing capacity.",
        );
      // Binding is re-read inside the operation lock; webhook state is always
      // checked against the authoritative provider subscription before mutation.
      const binding = await bindingFor(req.user.id, tx);
      if (!binding) throw AppError.badRequest("An active channel subscription is required.");
      return scheduleCapacityUpgrade(binding, targetId.trim(), stripe);
    });
    return res.json(result);
  },
);
router.delete(
  "/api/billing/capacity-upgrade",
  authenticateUser,
  async (req: AuthenticatedRequest, res) => {
    if (!stripeAvailable())
      throw AppError.serviceUnavailable("Billing capacity is temporarily unavailable.");
    await drizzle.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`billing-capacity:${req.user.id}`}))`,
      );
      const binding = await bindingFor(req.user.id, tx);
      if (binding) await releaseOwnedCapacitySchedule(binding, stripe);
    });
    return res.json({ status: "removed" });
  },
);
export default router;
