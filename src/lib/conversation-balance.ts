/**
 * Runtime Balance is Wireline's prepaid safety wallet for optional and overflow work.
 *
 * Plans with Calls include monthly live-voice minutes and a smaller flexible
 * Runtime Allowance for SMS, platform-funded AI/research, enrichment, and generated
 * business artifacts. Runtime Balance covers usage beyond those included amounts
 * without automatic postpaid invoices.
 *
 * The legacy exported constant names remain stable to avoid breaking mobile and API
 * consumers while the customer-facing product language moves to Runtime Balance.
 */
export const CONVERSATION_BALANCE_MIN_USD = 10;
export const CONVERSATION_BALANCE_MAX_USD = 1_000;
export const CONVERSATION_BALANCE_PRESETS_USD = [10, 25, 50, 100] as const;

export const CONVERSATION_BALANCE_COPY = {
  title: "Runtime Balance",
  subtitle:
    "Your plan includes capacity for your selected channels. Add prepaid balance when you need more.",
  reassurance:
    "No automatic charges or auto-refill. Calls have up to 10 minutes of completion credit; any amount due pauses new calls and prepaid extras until you top up.",
} as const;

export function isConversationBalanceAmount(amountUsd: number): boolean {
  return (
    Number.isInteger(amountUsd) &&
    amountUsd >= CONVERSATION_BALANCE_MIN_USD &&
    amountUsd <= CONVERSATION_BALANCE_MAX_USD
  );
}
