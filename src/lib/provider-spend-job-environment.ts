import { AppError } from "./api-error";
import {
  ACCOUNT_ENVIRONMENT_UNAVAILABLE,
  assertLiveExternalActionAllowed,
} from "./account-environment-policy";
import { isPausableProviderSpendJobType } from "./provider-spend-job-pause";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

type ProviderSpendJobIdentity = {
  type: string;
  userId?: string | null;
};

/**
 * Fail-closed account-environment admission for durable provider-spend work.
 *
 * Reconciliation, teardown, cleanup, accounting, and platform canaries are
 * deliberately absent from PAUSABLE_PROVIDER_SPEND_JOB_TYPES and therefore do
 * not enter this gate. Explicit system-owned jobs keep their existing platform
 * identity. Every tenant-owned spend job, however, must resolve to an explicit
 * production workspace before its handler can make a provider call.
 */
export async function assertProviderSpendJobEnvironmentAllowed(
  job: ProviderSpendJobIdentity,
): Promise<void> {
  if (!isPausableProviderSpendJobType(job.type)) return;

  const userId = String(job.userId || "").trim();
  if (userId === SYSTEM_USER_ID) return;
  if (!userId) {
    throw new AppError(
      503,
      ACCOUNT_ENVIRONMENT_UNAVAILABLE,
      "Provider-spend work is unavailable until its workspace owner can be verified.",
    );
  }

  await assertLiveExternalActionAllowed(userId, `background_provider_spend:${job.type}`);
}
