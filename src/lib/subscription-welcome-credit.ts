/**
 * One-time welcome Conversation Balance on first Team/Business subscription.
 */
import { addCredit } from "./credit-wallet";
import { log } from "./server-context";

export const WELCOME_SUBSCRIPTION_CREDIT_USD = 10;

const WELCOME_PLANS = new Set(["team", "business"]);

export async function grantWelcomeSubscriptionCredit(
  userId: string,
  subscriptionId: string,
  planId: string | null | undefined,
): Promise<void> {
  if (!planId || !WELCOME_PLANS.has(planId)) return;
  if (!subscriptionId) return;

  const { applied } = await addCredit(
    userId,
    WELCOME_SUBSCRIPTION_CREDIT_USD,
    "welcome_subscription",
    {
      type: "welcome_subscription",
      id: userId,
      entryKind: "grant",
      source: "stripe",
      provider: "stripe",
      customerReason: "Welcome Conversation Balance on your first shared capacity plan",
      metadata: {
        plan_id: planId,
        subscription_id: subscriptionId,
        welcome_credit_usd: WELCOME_SUBSCRIPTION_CREDIT_USD,
      },
    },
  );

  if (applied > 0) {
    log.info("welcome subscription credit granted", { userId, planId, subscriptionId, applied });
  }
}
