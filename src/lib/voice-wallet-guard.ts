/**
 * Pre-call Conversation Balance gate for PSTN voice.
 * Balance-funded tenants must hold at least one billable minute before outbound
 * or inbound spend is allowed. That includes accounts without a subscription row
 * and explicit Personal rows — Personal is create/train-free, live-work prepaid.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { planById } from "./plan-catalog";
import { getCreditBalanceUsd } from "./credit-wallet";
import { isBalanceFundedVoicePlan } from "./voice-billing-policy";

export const MIN_BILLABLE_MINUTES_BUFFER = 1;

export type VoiceWalletSnapshot = {
  is_pay_as_you_go: boolean;
  balance_usd: number;
  minute_rate_usd: number;
  required_usd: number;
  sufficient: boolean;
};

export async function getVoiceWalletSnapshot(userId: string): Promise<VoiceWalletSnapshot> {
  const [sub] = await drizzle
    .select({ plan: schema.subscriptions.plan })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  const planId = sub?.plan ?? null;
  const isPayAsYouGo = isBalanceFundedVoicePlan(planId);
  const plan = planById(planId ?? "personal");
  const minuteRate = plan?.overage_per_min_usd ?? 0.18;
  const balance = await getCreditBalanceUsd(userId);
  const requiredUsd = Math.round(minuteRate * MIN_BILLABLE_MINUTES_BUFFER * 100) / 100;

  if (!isPayAsYouGo) {
    return {
      is_pay_as_you_go: false,
      balance_usd: balance,
      minute_rate_usd: minuteRate,
      required_usd: 0,
      sufficient: true,
    };
  }

  return {
    is_pay_as_you_go: true,
    balance_usd: balance,
    minute_rate_usd: minuteRate,
    required_usd: requiredUsd,
    sufficient: balance >= requiredUsd,
  };
}

export async function assertVoiceWalletSolvent(userId: string): Promise<void> {
  const snapshot = await getVoiceWalletSnapshot(userId);
  if (snapshot.sufficient) return;

  const err = new Error("Insufficient Conversation Balance for voice.");
  (err as Error & { status: number; body: Record<string, unknown> }).status = 402;
  (err as Error & { status: number; body: Record<string, unknown> }).body = {
    code: "INSUFFICIENT_BALANCE",
    error:
      "Add Conversation Balance before placing live calls. Personal plans bill per minute from your balance.",
    balance_usd: snapshot.balance_usd,
    required_usd: snapshot.required_usd,
    minute_rate_usd: snapshot.minute_rate_usd,
    recovery_path: "/settings/billing",
    recovery_action: "add_conversation_balance",
  };
  throw err;
}
