import { getCreditBalanceUsd, reverseCredit } from "./credit-wallet";

export type VoiceCompletionCharge = {
  applied_usd: number;
  balance_usd: number;
  completion_grace_due_usd: number;
  used_completion_grace: boolean;
};

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Finalize prepaid voice usage after a provider call has ended.
 *
 * This intentionally permits a temporary negative Conversation Balance. Wireline
 * never terminates an active call because the included pool or prepaid balance is
 * exhausted mid-conversation. Instead, the completed call is charged in full and
 * the pre-call gate blocks the next live action until the amount due is restored.
 *
 * The ledger reference is idempotent per provider call id, so webhook retries do
 * not duplicate the charge.
 */
export async function chargeCompletedVoiceUsage(opts: {
  userId: string;
  costUsd: number;
  providerCallId: string;
  billableMinutes: number;
  rateUsd: number;
}): Promise<VoiceCompletionCharge> {
  const costUsd = cents(opts.costUsd);
  if (!(costUsd > 0)) {
    const balance = cents(await getCreditBalanceUsd(opts.userId));
    return {
      applied_usd: 0,
      balance_usd: balance,
      completion_grace_due_usd: Math.max(0, cents(-balance)),
      used_completion_grace: balance < 0,
    };
  }

  const result = await reverseCredit(opts.userId, costUsd, "voice_completion_grace", {
    type: "voice_completion",
    id: opts.providerCallId,
    idempotencyKey: `voice_completion:${opts.providerCallId}`,
    entryKind: "burn",
    source: "vapi",
    provider: "vapi",
    providerObjectId: opts.providerCallId,
    customerReason: "Completed live-call usage",
    metadata: {
      policy: "finish_current_block_next",
      billable_minutes: opts.billableMinutes,
      rate_usd: opts.rateUsd,
      charged_usd: costUsd,
    },
  });

  const balance = cents(result.balance);
  const due = Math.max(0, cents(-balance));
  return {
    applied_usd: cents(result.applied),
    balance_usd: balance,
    completion_grace_due_usd: due,
    used_completion_grace: due > 0,
  };
}
