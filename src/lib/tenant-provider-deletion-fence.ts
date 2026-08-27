import { AsyncLocalStorage } from "node:async_hooks";

import {
  acquireAccountOperationLease,
  PROVIDER_OPERATION_LEASE_MS,
  releaseAccountOperationLease,
} from "./account-operation-lease";

export type TenantProviderWorkOutcome<T> =
  | { performed: false; reason: "account_erased_or_terminal_deletion" }
  | { performed: true; result: T };

type RetainOnSuccess<T> = boolean | ((result: T) => boolean);

type ActiveProviderLease = {
  retainUntilExpiry: boolean;
};

const activeProviderLeases = new AsyncLocalStorage<Map<string, ActiveProviderLease>>();

function retentionRequested<T>(policy: RetainOnSuccess<T> | undefined, result: T): boolean {
  return typeof policy === "function" ? policy(result) : Boolean(policy);
}

function applyRetentionPolicy<T>(
  lease: ActiveProviderLease,
  policy: RetainOnSuccess<T> | undefined,
  result: T,
): void {
  try {
    lease.retainUntilExpiry ||= retentionRequested(policy, result);
  } catch (error) {
    // A broken classification must fail safe after provider work: keep the
    // durable lease rather than deleting the account beneath an unknown result.
    lease.retainUntilExpiry = true;
    throw error;
  }
}

/**
 * Protect system-owned fan-out jobs at the actual tenant boundary.
 *
 * `cadence_tick` and `callback_tick` are queued under the system user, so the
 * generic worker fence cannot know which account their next provider call
 * belongs to. Admission still occurs under the same advisory lock as terminal
 * purge, but the operation is represented by a durable lease while provider
 * work and evidence writes run. This avoids pinning a pooled DB connection and
 * prevents terminal erasure until the lease settles or reaches its crash TTL.
 */
export async function runTenantProviderWorkWithDeletionFence<T>(input: {
  userId: string;
  perform: () => Promise<T>;
  operation?: string;
  ttlMs?: number;
  retainOnSuccess?: RetainOnSuccess<T>;
}): Promise<TenantProviderWorkOutcome<T>> {
  if (!input.userId) {
    throw new Error("Tenant provider deletion fence requires a userId.");
  }

  // Cadence and callback ticks already own a tenant lease around their entire
  // provider step. Reuse that same lease at nested provider boundaries instead
  // of creating redundant rows. A nested operation can upgrade the outer lease
  // to retain-until-expiry when it accepts or ambiguously reaches a provider.
  const activeLease = activeProviderLeases.getStore()?.get(input.userId);
  if (activeLease) {
    let completed = false;
    try {
      const result = await input.perform();
      completed = true;
      applyRetentionPolicy(activeLease, input.retainOnSuccess, result);
      return { performed: true, result };
    } finally {
      if (!completed) activeLease.retainUntilExpiry = true;
    }
  }

  const lease = await acquireAccountOperationLease({
    userId: input.userId,
    kind: "provider",
    operation: input.operation || "tenant_provider_work",
    ttlMs: input.ttlMs ?? PROVIDER_OPERATION_LEASE_MS,
  });
  if (!lease) {
    return { performed: false, reason: "account_erased_or_terminal_deletion" };
  }

  const leaseState: ActiveProviderLease = { retainUntilExpiry: false };
  const inheritedLeases = activeProviderLeases.getStore();
  const nestedLeases = new Map(inheritedLeases);
  nestedLeases.set(input.userId, leaseState);
  let completed = false;
  try {
    const result = await activeProviderLeases.run(nestedLeases, input.perform);
    completed = true;
    applyRetentionPolicy(leaseState, input.retainOnSuccess, result);
    return { performed: true, result };
  } finally {
    // A thrown provider outcome can be ambiguous. Retain the lease until its
    // safety horizon instead of erasing the only cross-deletion evidence.
    if (completed && !leaseState.retainUntilExpiry) {
      await releaseAccountOperationLease({ id: lease.id, userId: input.userId });
    }
  }
}
