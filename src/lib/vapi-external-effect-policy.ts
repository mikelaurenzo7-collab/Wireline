import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { liveExternalActionPolicy } from "./account-environment-policy";
import { isLaunchHardBlocked } from "./launch-readiness";
import { drizzle, log, tenantStore } from "./server-context";

export type VapiExternalEffectAction =
  | "vapi_end_of_call_external_effects"
  | "vapi_conversation_update_external_effects"
  | "vapi_post_call_digest";

type VapiExternalEffectInput<T> = {
  userId: string;
  action: VapiExternalEffectAction;
  perform: () => Promise<T>;
};

export type VapiExternalEffectResult<T> =
  | { performed: true; result: T }
  | {
      performed: false;
      reason: "launch_hold" | "account_environment" | "subscription_inactive";
    };

/**
 * Admit only optional Vapi work that creates fresh provider spend or sends a
 * new external effect. Signed webhook evidence, compliance writes, call-log
 * persistence, and retry-safe voice accounting must run before this boundary.
 *
 * A launch hold, inactive subscription, or non-production/missing account
 * classification skips the optional effect without failing the evidence job.
 * A policy lookup failure is deliberately allowed to throw so the durable job
 * retries, still before the callback can make a provider request.
 */
export async function runVapiExternalEffectsIfAllowed<T>(
  input: VapiExternalEffectInput<T>,
): Promise<VapiExternalEffectResult<T>> {
  if (isLaunchHardBlocked()) {
    log.info("Vapi optional external effects skipped during launch hold", {
      userId: input.userId,
      action: input.action,
    });
    return { performed: false, reason: "launch_hold" };
  }

  const [settings] = await tenantStore.run(input.userId, () =>
    drizzle
      .select({
        accountEnvironment: schema.settings.accountEnvironment,
        subscriptionStatus: schema.settings.subscriptionStatus,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, input.userId))
      .limit(1),
  );
  const policy = liveExternalActionPolicy(settings?.accountEnvironment);
  if (!policy.allowed) {
    log.info("Vapi optional external effects skipped by account environment", {
      userId: input.userId,
      action: input.action,
      accountEnvironment: policy.environment ?? "missing",
      code: policy.code,
    });
    return { performed: false, reason: "account_environment" };
  }

  if (settings?.subscriptionStatus !== "active") {
    log.info("Vapi optional external effects skipped for inactive subscription", {
      userId: input.userId,
      action: input.action,
      subscriptionStatus: settings?.subscriptionStatus ?? "missing",
    });
    return { performed: false, reason: "subscription_inactive" };
  }

  return { performed: true, result: await input.perform() };
}
