/**
 * Conversation Balance is Wireline's customer-facing prepaid live-work wallet.
 *
 * Personal users build and test for free. Before they turn an assistant loose
 * on a live workflow, they add a small balance. Business workspaces use the
 * same balance alongside their platform subscription. This module owns the
 * product contract and prevents UI, checkout, and server limits from drifting.
 */

export const CONVERSATION_BALANCE_MIN_USD = 5;
export const CONVERSATION_BALANCE_MAX_USD = 1_000;
export const CONVERSATION_BALANCE_PRESETS_USD = [5, 10, 25, 50] as const;

export const CONVERSATION_BALANCE_COPY = {
  title: "Conversation Balance",
  subtitle:
    "Build and test for free. Add $5 when you are ready to put an assistant to work.",
  reassurance: "No subscription for personal use. No automatic reload. You decide when to add more.",
} as const;

export function isConversationBalanceAmount(amountUsd: number): boolean {
  return (
    Number.isInteger(amountUsd) &&
    amountUsd >= CONVERSATION_BALANCE_MIN_USD &&
    amountUsd <= CONVERSATION_BALANCE_MAX_USD
  );
}
