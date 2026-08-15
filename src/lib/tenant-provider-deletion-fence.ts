import { and, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle } from "./server-context";
import { writeTransactionConfig } from "./job-queue";
import { runTenantProviderWorkAfterDeletionFence } from "./account-deletion-fence";

export type TenantProviderWorkOutcome<T> =
  | { performed: false; reason: "account_erased_or_terminal_deletion" }
  | { performed: true; result: T };

/**
 * Protect system-owned fan-out jobs at the actual tenant boundary.
 *
 * `cadence_tick` and `callback_tick` are queued under the system user, so the
 * generic worker fence cannot know which account their next provider call
 * belongs to. Acquire the same per-account advisory lock used by terminal
 * purge, re-check that the account still exists and is not due/purging, and
 * retain the lock until provider work and its evidence writes finish.
 */
export async function runTenantProviderWorkWithDeletionFence<T>(input: {
  userId: string;
  perform: () => Promise<T>;
}): Promise<TenantProviderWorkOutcome<T>> {
  if (!input.userId) {
    throw new Error("Tenant provider deletion fence requires a userId.");
  }

  return drizzle.transaction(
    (tx) =>
      runTenantProviderWorkAfterDeletionFence({
        executor: tx,
        userId: input.userId,
        providerWorkAllowed: async () => {
          const [eligible] = await tx
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(
              and(
                eq(schema.users.id, input.userId),
                sql`NOT EXISTS (
                  SELECT 1
                  FROM ${schema.deletionQueue}
                  WHERE ${schema.deletionQueue.userId} = ${input.userId}
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
                )`,
              ),
            )
            .limit(1);
          return Boolean(eligible);
        },
        perform: input.perform,
      }).then((outcome) =>
        outcome.performed
          ? outcome
          : ({
              performed: false,
              reason: "account_erased_or_terminal_deletion",
            } as const),
      ),
    writeTransactionConfig(),
  );
}
