import {
  ACCOUNT_ENVIRONMENT_UNAVAILABLE,
  type AccountEnvironment,
  type LiveExternalActionPolicy,
  liveExternalActionPolicyForUser,
} from "./account-environment-policy";

export type TwilioInboundEnvironmentDecision =
  | { allowed: true; environment: "production"; code: null }
  | {
      allowed: false;
      environment: Exclude<AccountEnvironment, "production"> | null;
      code: string;
    };

type TwilioInboundEnvironmentDependencies = {
  policyForUser: (userId: string) => Promise<LiveExternalActionPolicy>;
};

const defaultDependencies: TwilioInboundEnvironmentDependencies = {
  policyForUser: liveExternalActionPolicyForUser,
};

/**
 * Signed inbound callbacks may always preserve provider/compliance evidence,
 * but only an explicitly production tenant may make BotBound speak, dial,
 * record, or emit an application-generated SMS reply. Classification lookup
 * failures are deliberately indistinguishable from a missing classification.
 */
export async function resolveTwilioInboundEnvironment(
  userId: string,
  dependencies: TwilioInboundEnvironmentDependencies = defaultDependencies,
): Promise<TwilioInboundEnvironmentDecision> {
  try {
    const policy = await dependencies.policyForUser(userId);
    if (policy.allowed) return { allowed: true, environment: "production", code: null };
    return {
      allowed: false,
      environment: policy.environment,
      code: policy.code,
    };
  } catch {
    return {
      allowed: false,
      environment: null,
      code: ACCOUNT_ENVIRONMENT_UNAVAILABLE,
    };
  }
}
