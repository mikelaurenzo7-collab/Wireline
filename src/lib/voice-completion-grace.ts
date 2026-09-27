import { getCreditBalanceUsd, reverseCredit } from "./credit-wallet";
import { settleVoiceCallFunding } from "./voice-call-funding";

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
 * This intentionally permits a temporary negative Runtime Balance. Channel
 * packages reserve funding before acceptance and allow up to ten completion
 * minutes within their persisted session deadline. The completed call is charged
 * in full and the pre-call gate blocks new calls and prepaid extras until paid.
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
  const funded = await settleVoiceCallFunding({ ...opts, costUsd });
  if (funded) {
    const balance = cents(funded.balance);
    return {
      applied_usd: cents(funded.applied),
      balance_usd: balance,
      completion_grace_due_usd: Math.max(0, cents(-balance)),
      used_completion_grace: balance < 0,
    };
  }
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
    source: "openai_realtime",
    provider: "openai",
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
