/**
 * Conversation Balance — the customer-facing on-demand wallet.
 *
 * Wireline Personal is free to build and test. To go live, the buyer adds a
 * small prepaid balance ("Add $5 to start handling live conversations") that is
 * spent across voice, email, and text. Internally this is the same prepaid USD
 * ledger as `credit-wallet.ts`; this module owns the *product* concerns:
 *
 *   - the top-up amounts we offer ($5 / $10 / $25 / $50) and the floor,
 *   - the customer-facing language (never "API credits" — that's internal
 *     economics, not what people are buying),
 *   - a lightweight per-task spend estimate so we can show "this may use up to
 *     $X" and enforce a hard budget BEFORE a live conversation starts.
 *
 * One wallet, weighted channel cost: a $5 balance does not mean every channel
 * consumes the same amount. Drafting an email is cheap; sitting on hold or
 * using premium realtime voice is not. The weights below let us offer the
 * simplicity of one balance while protecting margins.
 */
import { VOICE_VARIABLE_COST_PER_MIN_USD } from "./plan-catalog";

/** Smallest top-up — the "one annoying conversation" first-use balance. */
export const CONVERSATION_BALANCE_MIN_USD = 5;
/** Upper bound on a single top-up (fraud / fat-finger guard). */
export const CONVERSATION_BALANCE_MAX_USD = 1000;
/** Top-up amounts surfaced in the UI, smallest first. */
export const CONVERSATION_BALANCE_PRESETS_USD = [5, 10, 25, 50] as const;

/** Customer-facing copy. Deliberately product language, not cost language. */
export const CONVERSATION_BALANCE_COPY = {
  title: "Conversation Balance",
  /** Primary CTA subtitle on the top-up card. */
  subtitle:
    "Add $5 to start handling live conversations. Use it across voice, email, and text — you stay in control of the budget.",
  /** Reassurance line shown next to the amount buttons. */
  reassurance: "No subscription. No auto-reload. You approve every external action.",
} as const;

/**
 * Channels a conversation can spend balance on. The estimate is always in real
 * USD (matching the wallet ledger) so the number the customer sees is the
 * number that gets debited — weighting is expressed as cost-per-unit, not an
 * abstract credit.
 */
export type ConversationChannel =
  | "email_draft"
  | "email_send"
  | "sms_send"
  | "voice_standard"
  | "voice_premium";

/**
 * Weighted per-unit consumption (USD). Email/text are flat per message; voice
 * is per minute. Voice rates reserve above blended provider cost
 * (VOICE_VARIABLE_COST_PER_MIN_USD) so long holds and premium realtime voice
 * don't erode margin. Tune once 30–60 days of real telemetry lands.
 */
export const CHANNEL_UNIT_COST_USD: Record<ConversationChannel, number> = {
  email_draft: 0.01, // low — drafting only, no send
  email_send: 0.02, // low
  sms_send: 0.05, // low-to-medium, carrier dependent
  voice_standard: Number((VOICE_VARIABLE_COST_PER_MIN_USD * 1.6).toFixed(3)), // ~0.205/min
  voice_premium: Number((VOICE_VARIABLE_COST_PER_MIN_USD * 3).toFixed(3)), // ~0.384/min realtime
};

/** A fixed handling reserve per live task (recap, routing, orchestration). */
const TASK_BASE_RESERVE_USD = 0.1;

export interface ConversationEstimateInput {
  channel: ConversationChannel;
  /** Expected voice minutes for voice channels. */
  voiceMinutes?: number;
  /** Expected message count for email/SMS channels. */
  messages?: number;
}

export interface ConversationEstimate {
  channel: ConversationChannel;
  /** Expected spend for the task ("this may use up to $X of your balance"). */
  estimate_usd: number;
  /** Hard pause threshold — stop the task if spend reaches this. */
  cap_usd: number;
}

function round2(usd: number): number {
  return Math.round(usd * 100) / 100;
}

/**
 * Lightweight pre-flight estimate for a task. Returns the expected spend plus a
 * conservative pause cap (~1.6× the estimate, floored at $2) so the runtime can
 * enforce a hard budget before live work begins and pause if it runs long.
 */
export function estimateConversationCostUsd(
  input: ConversationEstimateInput,
): ConversationEstimate {
  const unit = CHANNEL_UNIT_COST_USD[input.channel] ?? 0;
  const isVoice = input.channel === "voice_standard" || input.channel === "voice_premium";
  const quantity = isVoice
    ? Math.max(0, input.voiceMinutes ?? 1)
    : Math.max(0, input.messages ?? 1);

  const estimate = round2(TASK_BASE_RESERVE_USD + unit * quantity);
  const cap = round2(Math.max(2, Math.ceil(estimate * 1.6 * 100) / 100));
  return { channel: input.channel, estimate_usd: estimate, cap_usd: cap };
}

/**
 * Hard budget gate: may a live conversation start given the current balance and
 * the task estimate? We require the balance to cover at least the *estimate*
 * (not the cap) so a $5 balance can still take on a $1.20 task; the runtime
 * pauses at the cap to prevent surprise overruns.
 */
export function canStartLiveConversation(
  balanceUsd: number,
  estimate: ConversationEstimate,
): boolean {
  return balanceUsd >= estimate.estimate_usd;
}
