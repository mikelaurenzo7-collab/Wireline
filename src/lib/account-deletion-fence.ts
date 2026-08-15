import { sql } from "drizzle-orm";

export function accountDeletionFenceKey(userId: string): string {
  return `account-deletion:${userId}`;
}

/**
 * Serialize terminal account erasure with provider work that may still hold a
 * tenant PII snapshot. The transaction-scoped advisory lock is released on
 * commit/rollback, including when the protected provider operation rejects.
 */
export async function acquireAccountDeletionFence(
  executor: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
  userId: string,
): Promise<void> {
  await executor.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${accountDeletionFenceKey(userId)}))`,
  );
}

export async function withAccountDeletionFence<T>(
  executor: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
  userId: string,
  work: () => Promise<T>,
): Promise<T> {
  await acquireAccountDeletionFence(executor, userId);
  return work();
}

/**
 * Keep the irreversible deletion sequence structurally ordered: the durable
 * terminal marker must commit before any provider resource is released, and
 * local erasure must wait for that release attempt to finish. The generic
 * shape keeps the ordering behavior testable without provider/database mocks.
 */
export async function runTerminalDeletionSequence<TQueueRow, TRelease, TPurge>(input: {
  establishTerminalState: () => Promise<TQueueRow | null>;
  releaseExternalResources: (queueRow: TQueueRow) => Promise<TRelease>;
  purgeLocalAccount: (queueRow: TQueueRow, release: TRelease) => Promise<TPurge>;
}): Promise<
  | { started: false; queueRow: null; release: null; purge: null }
  | { started: true; queueRow: TQueueRow; release: TRelease; purge: TPurge }
> {
  const queueRow = await input.establishTerminalState();
  if (!queueRow) return { started: false, queueRow: null, release: null, purge: null };

  const release = await input.releaseExternalResources(queueRow);
  const purge = await input.purgeLocalAccount(queueRow, release);
  return { started: true, queueRow, release, purge };
}

/** Fail closed at worker dispatch without treating privacy skips as retries. */
export async function runTenantJobAfterDeletionCheck<T>(input: {
  terminalDeletionExists: () => Promise<boolean>;
  perform: () => Promise<T>;
}): Promise<{ performed: false } | { performed: true; result: T }> {
  if (await input.terminalDeletionExists()) return { performed: false };
  return { performed: true, result: await input.perform() };
}

/**
 * System fan-out jobs do not carry a tenant owner on the queue row. Compose
 * the deletion lock and the under-lock eligibility recheck at the concrete
 * tenant boundary so callers cannot accidentally perform either in the wrong
 * order.
 */
export async function runTenantProviderWorkAfterDeletionFence<T>(input: {
  executor: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };
  userId: string;
  providerWorkAllowed: () => Promise<boolean>;
  perform: () => Promise<T>;
}): Promise<{ performed: false } | { performed: true; result: T }> {
  return withAccountDeletionFence(input.executor, input.userId, async () => {
    if (!(await input.providerWorkAllowed())) return { performed: false };
    return { performed: true, result: await input.perform() };
  });
}
