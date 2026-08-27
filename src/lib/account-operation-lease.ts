import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { acquireAccountDeletionFence } from "./account-deletion-fence";
import { writeTransactionConfig } from "./job-queue";
import { drizzle, log, tenantStore } from "./server-context";
import { getErrorMessage } from "./server-utils";

export type AccountOperationLeaseKind = "billing" | "provider";

// Stripe's default network timeout is 80 seconds. Three minutes leaves room
// for local persistence and response handling without turning a crashed
// request into a long-lived deletion blocker.
export const BILLING_OPERATION_LEASE_MS = 15 * 60_000;
// Native phone provisioning has several sequential provider calls. The lease
// is normally deleted in `finally`; this is only the crash ceiling.
export const PROVIDER_OPERATION_LEASE_MS = 15 * 60_000;

export type AccountOperationLease = {
  id: string;
  expiresAt: Date;
};

function terminalDeletionPredicate(userId: string) {
  return sql`NOT EXISTS (
    SELECT 1
    FROM ${schema.deletionQueue}
    WHERE ${schema.deletionQueue.userId} = ${userId}
      AND (
        ${schema.deletionQueue.status} = 'purging'
        OR (
          ${schema.deletionQueue.status} = 'pending'
          AND (
            ${schema.deletionQueue.scheduledPurgeAt} IS NULL
            OR ${schema.deletionQueue.scheduledPurgeAt} <= now()
          )
        )
      )
  )`;
}

/**
 * Admit one external operation under the account-deletion advisory lock, then
 * return a durable lease so the caller can perform provider work without
 * holding a pooled database connection.
 */
export async function acquireAccountOperationLease(input: {
  userId: string;
  kind: AccountOperationLeaseKind;
  operation: string;
  ttlMs: number;
}): Promise<AccountOperationLease | null> {
  if (!input.userId) throw new Error("Account operation lease requires a userId.");
  if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) {
    throw new Error("Account operation lease requires a positive ttlMs.");
  }

  return tenantStore.run(input.userId, () =>
    drizzle.transaction(async (tx) => {
      await acquireAccountDeletionFence(tx, input.userId);
      await tx.execute(sql`
      DELETE FROM ${schema.accountOperationLeases}
      WHERE ${schema.accountOperationLeases.userId} = ${input.userId}
        AND ${schema.accountOperationLeases.expiresAt} <= now()
    `);

      const admissionPredicate =
        input.kind === "billing"
          ? sql`NOT EXISTS (
            SELECT 1
            FROM ${schema.deletionQueue}
            WHERE ${schema.deletionQueue.userId} = ${input.userId}
              AND ${schema.deletionQueue.status} IN ('pending', 'purging')
          )`
          : terminalDeletionPredicate(input.userId);
      const [eligible] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.id, input.userId), admissionPredicate))
        .limit(1);
      if (!eligible) return null;

      const expiresAt = new Date(Date.now() + input.ttlMs);
      const id = randomUUID();
      const [lease] = await tx
        .insert(schema.accountOperationLeases)
        .values({
          id,
          userId: input.userId,
          kind: input.kind,
          operation: input.operation.slice(0, 120),
          expiresAt,
        })
        .returning({ id: schema.accountOperationLeases.id });
      return lease ? { id: lease.id, expiresAt } : null;
    }, writeTransactionConfig()),
  );
}

/** Best-effort release; expiry is the durable crash fallback. */
export async function releaseAccountOperationLease(input: {
  id: string;
  userId: string;
}): Promise<void> {
  try {
    await tenantStore.run(input.userId, () =>
      drizzle
        .delete(schema.accountOperationLeases)
        .where(
          and(
            eq(schema.accountOperationLeases.id, input.id),
            eq(schema.accountOperationLeases.userId, input.userId),
          ),
        ),
    );
  } catch (error) {
    log.warn("account operation lease release deferred to expiry", {
      userId: input.userId,
      leaseId: input.id,
      error: getErrorMessage(error),
    });
  }
}
