import { and, eq, gt, inArray } from "drizzle-orm";

import * as schema from "../db/schema";
import { acquireAccountDeletionFence } from "./account-deletion-fence";
import { stopRenewalForDeletion, type RenewalChangeResult } from "./account-deletion-billing";
import { AppError } from "./api-error";
import { writeTransactionConfig } from "./job-queue";
import { drizzle, tenantStore } from "./server-context";

export type PendingAccountDeletionResult = {
  row: typeof schema.deletionQueue.$inferSelect;
  alreadyPending: boolean;
  renewal: RenewalChangeResult;
};

export type CancelPendingAccountDeletionResult =
  | { state: "cancelled"; rowsCancelled: number; scheduledPurgeAt: Date | null }
  | { state: "not_found" }
  | { state: "terminal"; scheduledPurgeAt: Date | null };

export const ACCOUNT_DELETION_BILLING_RECONCILIATION_MS = 60 * 60_000;

/** Schedule exactly one future billing reconciliation while deletion is pending. */
export async function schedulePendingDeletionBillingReconciliation(input: {
  userId: string;
  runAt: Date;
}): Promise<boolean> {
  return tenantStore.run(input.userId, () =>
    drizzle.transaction(async (tx) => {
      await acquireAccountDeletionFence(tx, input.userId);
      const [pendingDeletion] = await tx
        .select({ id: schema.deletionQueue.id })
        .from(schema.deletionQueue)
        .where(
          and(
            eq(schema.deletionQueue.userId, input.userId),
            eq(schema.deletionQueue.status, "pending"),
          ),
        )
        .limit(1);
      if (!pendingDeletion) return false;

      const [waiting] = await tx
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(
          and(
            eq(schema.jobs.userId, input.userId),
            eq(schema.jobs.type, "account_deletion_billing_reconciliation"),
            eq(schema.jobs.status, "pending"),
          ),
        )
        .limit(1);
      if (waiting) return false;

      await tx.insert(schema.jobs).values({
        userId: input.userId,
        type: "account_deletion_billing_reconciliation",
        status: "pending",
        payload: { user_id: input.userId },
        runAt: input.runAt,
        maxAttempts: 5,
      });
      return true;
    }, writeTransactionConfig()),
  );
}

/**
 * Create the reversible deletion marker while excluding every payable billing
 * request. Admission leases are checked and `pending` is committed under one
 * short advisory-lock transaction. Stripe closure then runs without pinning a
 * database connection; no later billing request can start after the marker.
 */
export async function ensurePendingAccountDeletion(input: {
  userId: string;
  requestedAt: Date;
  scheduledPurgeAt: Date;
  ip: string | null;
  userAgent: string | null;
}): Promise<PendingAccountDeletionResult> {
  const marker = await drizzle.transaction(async (tx) => {
    await acquireAccountDeletionFence(tx, input.userId);
    const now = new Date();
    const [activeBilling] = await tx
      .select({ expiresAt: schema.accountOperationLeases.expiresAt })
      .from(schema.accountOperationLeases)
      .where(
        and(
          eq(schema.accountOperationLeases.userId, input.userId),
          eq(schema.accountOperationLeases.kind, "billing"),
          gt(schema.accountOperationLeases.expiresAt, now),
        ),
      )
      .orderBy(schema.accountOperationLeases.expiresAt)
      .limit(1);
    if (activeBilling) {
      throw new AppError(
        409,
        "BILLING_OPERATION_IN_FLIGHT",
        "A billing request is still settling. Try account deletion again in a few minutes.",
        {
          retry_after_seconds: Math.max(
            1,
            Math.ceil((activeBilling.expiresAt.getTime() - now.getTime()) / 1_000),
          ),
        },
      );
    }
    const [existing] = await tx
      .select()
      .from(schema.deletionQueue)
      .where(
        and(
          eq(schema.deletionQueue.userId, input.userId),
          eq(schema.deletionQueue.status, "pending"),
        ),
      )
      .limit(1);

    let row = existing;
    if (!row) {
      [row] = await tx
        .insert(schema.deletionQueue)
        .values({
          userId: input.userId,
          requestedAt: input.requestedAt,
          scheduledPurgeAt: input.scheduledPurgeAt,
          status: "pending",
          ip: input.ip,
          userAgent: input.userAgent,
        })
        .returning();
    }
    if (!row) throw new Error("Account deletion request could not be persisted.");

    const [existingReconciliation] = await tx
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, input.userId),
          eq(schema.jobs.type, "account_deletion_billing_reconciliation"),
          inArray(schema.jobs.status, ["pending", "running", "failed"]),
        ),
      )
      .limit(1);
    if (!existingReconciliation) {
      await tx.insert(schema.jobs).values({
        userId: input.userId,
        type: "account_deletion_billing_reconciliation",
        status: "pending",
        payload: { user_id: input.userId },
        runAt: new Date(Date.now() + 30_000),
        maxAttempts: 5,
      });
    }
    return { row, alreadyPending: Boolean(existing) };
  }, writeTransactionConfig());
  const renewal = await stopRenewalForDeletion(input.userId);
  return { ...marker, renewal };
}

/**
 * Cancel every pending deletion marker under the same advisory fence used by
 * new requests and terminal purge. This only changes the deletion decision;
 * it never performs an inverse Stripe mutation or silently resumes renewal.
 */
export async function cancelPendingAccountDeletion(input: {
  userId: string;
  cancelledAt?: Date;
}): Promise<CancelPendingAccountDeletionResult> {
  const cancelledAt = input.cancelledAt ?? new Date();
  return drizzle.transaction(async (tx) => {
    await acquireAccountDeletionFence(tx, input.userId);
    const activeRows = await tx
      .select({
        id: schema.deletionQueue.id,
        status: schema.deletionQueue.status,
        scheduledPurgeAt: schema.deletionQueue.scheduledPurgeAt,
      })
      .from(schema.deletionQueue)
      .where(
        and(
          eq(schema.deletionQueue.userId, input.userId),
          inArray(schema.deletionQueue.status, ["pending", "purging"]),
        ),
      )
      .orderBy(schema.deletionQueue.scheduledPurgeAt);

    if (activeRows.length === 0) return { state: "not_found" };
    const terminal = activeRows.find(
      (row) =>
        row.status === "purging" ||
        !row.scheduledPurgeAt ||
        row.scheduledPurgeAt.getTime() <= cancelledAt.getTime(),
    );
    if (terminal) {
      return { state: "terminal", scheduledPurgeAt: terminal.scheduledPurgeAt ?? null };
    }

    const cancelled = await tx
      .update(schema.deletionQueue)
      .set({ status: "cancelled", cancelledAt })
      .where(
        and(
          eq(schema.deletionQueue.userId, input.userId),
          eq(schema.deletionQueue.status, "pending"),
          gt(schema.deletionQueue.scheduledPurgeAt, cancelledAt),
        ),
      )
      .returning({ id: schema.deletionQueue.id });
    if (cancelled.length === 0) {
      return {
        state: "terminal",
        scheduledPurgeAt: activeRows[0]?.scheduledPurgeAt ?? null,
      };
    }
    return {
      state: "cancelled",
      rowsCancelled: cancelled.length,
      scheduledPurgeAt: activeRows[0]?.scheduledPurgeAt ?? null,
    };
  }, writeTransactionConfig());
}
