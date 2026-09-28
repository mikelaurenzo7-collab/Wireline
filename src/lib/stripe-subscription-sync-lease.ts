import { AppError } from "./api-error";
import { acquireDistributedLease } from "./distributed-lease";
import { log } from "./server-context";

// Stripe requests can wait for its network timeout and retries. Keep a long
// crash horizon, renew while reading, and refuse subsequent writes after loss.
const SYNC_LEASE_MS = 15 * 60_000;
const RENEW_EVERY_MS = 60_000;
const DEADLINE_CUSHION_MS = 5_000;

export async function withStripeSubscriptionSyncLease<T>(
  customerId: string,
  perform: (assertOwned: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const acquiredAt = Date.now();
  const decision = await acquireDistributedLease(
    `stripe:subscription-sync:${customerId}`,
    SYNC_LEASE_MS,
  );
  if (decision.status !== "acquired") {
    throw AppError.serviceUnavailable(
      decision.status === "held"
        ? "This customer's billing update is already running. Please retry."
        : "Billing synchronization is temporarily unavailable. Please retry.",
    );
  }

  let finished = false;
  let lost = false;
  let safeUntil = acquiredAt + SYNC_LEASE_MS - DEADLINE_CUSHION_MS;
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  const lostError = () =>
    AppError.serviceUnavailable("Billing synchronization lost its update lease. Please retry.");
  const assertOwned = async (): Promise<void> => {
    if (finished || lost || Date.now() >= safeUntil) {
      lost = true;
      throw lostError();
    }
    const startedAt = Date.now();
    let renewed = false;
    try {
      renewed = await decision.lease.renew();
    } catch {
      lost = true;
    }
    if (!renewed || lost || finished || Date.now() >= safeUntil) {
      lost = true;
      throw lostError();
    }
    safeUntil = Math.max(safeUntil, startedAt + SYNC_LEASE_MS - DEADLINE_CUSHION_MS);
  };
  const scheduleRenewal = () => {
    heartbeat = setTimeout(async () => {
      try {
        await assertOwned();
      } catch {
        lost = true;
      } finally {
        if (!finished && !lost) scheduleRenewal();
      }
    }, RENEW_EVERY_MS);
    heartbeat.unref?.();
  };

  scheduleRenewal();
  try {
    await assertOwned();
    const result = await perform(assertOwned);
    await assertOwned();
    return result;
  } finally {
    finished = true;
    if (heartbeat) clearTimeout(heartbeat);
    // Compare-release cannot remove a later owner's lease after this expires.
    await decision.lease.release().catch(() => {
      log.warn("Stripe synchronization lease release deferred to expiry");
    });
  }
}
