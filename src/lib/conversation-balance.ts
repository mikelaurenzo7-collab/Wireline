/**
 * Conversation Balance is Wireline's prepaid live-work safety wallet.
 *
 * Paid plans include monthly live-call minutes. Conversation Balance covers
 * extra calls, texts, and heavier usage without automatic overage invoices.
 */
export const CONVERSATION_BALANCE_MIN_USD = 10;
export const CONVERSATION_BALANCE_MAX_USD = 1_000;
export const CONVERSATION_BALANCE_PRESETS_USD = [10, 25, 50, 100] as const;

export const CONVERSATION_BALANCE_COPY = {
  title: "Conversation Balance",
  subtitle:
    "Your plan includes monthly live-call minutes. Add prepaid balance only when you need extra calls, texts, or heavier usage.",
  reassurance:
    "No automatic overages or auto-refill by default. Live usage pauses when included minutes and balance are depleted.",
} as const;

export function isConversationBalanceAmount(amountUsd: number): boolean {
  return (
    Number.isInteger(amountUsd) &&
    amountUsd >= CONVERSATION_BALANCE_MIN_USD &&
    amountUsd <= CONVERSATION_BALANCE_MAX_USD
  );
}
