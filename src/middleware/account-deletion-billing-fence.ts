import type { NextFunction, Response } from "express";

import {
  acquireAccountOperationLease,
  BILLING_OPERATION_LEASE_MS,
  releaseAccountOperationLease,
} from "../lib/account-operation-lease";
import type { AuthenticatedRequest } from "../types/auth";
import { liveExternalActionPolicyForUser } from "../lib/account-environment-policy";

/**
 * Admit the complete payable-URL request under the account-deletion lock.
 *
 * The lock is held only long enough to persist a short-lived lease. This keeps
 * the ordering exact without pinning a five-slot Postgres pool while Stripe is
 * in flight. Deletion refuses the active lease; a later billing request sees
 * the pending marker and stops. A disconnected request retains the lease until
 * expiry because the provider call may still be running after the socket closes.
 */
export async function fencePayableBillingDuringAccountDeletion(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const environmentPolicy = await liveExternalActionPolicyForUser(req.user.id);
    if (!environmentPolicy.allowed) {
      res.status(environmentPolicy.status).json({
        code: environmentPolicy.code,
        error: environmentPolicy.message,
      });
      return;
    }

    const lease = await acquireAccountOperationLease({
      userId: req.user.id,
      kind: "billing",
      operation: `${req.method} ${req.path}`,
      ttlMs: BILLING_OPERATION_LEASE_MS,
    });
    if (!lease) {
      res.status(409).json({
        code: "ACCOUNT_DELETION_PENDING",
        error: "Cancel the pending account deletion before starting a new billing session.",
      });
      return;
    }

    let settled = false;
    const detach = () => {
      res.off("finish", onFinish);
      res.off("close", onClose);
    };
    const onFinish = () => {
      if (settled) return;
      settled = true;
      detach();
      void releaseAccountOperationLease({ id: lease.id, userId: req.user.id });
    };
    const onClose = () => {
      if (settled) return;
      settled = true;
      detach();
      // Do not release: Stripe may still be in flight after a browser abort.
      // The bounded lease plus deletion reconciliation closes the ambiguity.
    };
    res.once("finish", onFinish);
    res.once("close", onClose);
    try {
      next();
    } catch (error) {
      detach();
      await releaseAccountOperationLease({ id: lease.id, userId: req.user.id });
      next(error);
    }
  } catch (error) {
    if (!res.headersSent) next(error);
  }
}
