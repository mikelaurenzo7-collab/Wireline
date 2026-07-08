/**
 * SMS usage billing — Conversation Balance at a fixed segment rate.
 */
import { debitForVoiceUsage } from "./credit-wallet";
import { log } from "./server-context";

/** Customer-facing SMS rate (Twilio ~$0.008 + margin). */
export const SMS_COST_PER_SEGMENT_USD = 0.02;

/**
 * Debit Conversation Balance for outbound SMS. Idempotent per message sid.
 * Returns USD debited (0 if insufficient balance or on error).
 */
export async function billSmsMessage(
  userId: string,
  twilioMessageSid: string,
  segmentCount: number,
): Promise<number> {
  if (!userId || !twilioMessageSid) return 0;
  const segments = Math.max(1, Math.floor(segmentCount) || 1);
  const costUsd = Math.round(SMS_COST_PER_SEGMENT_USD * segments * 100) / 100;
  try {
    const debited = await debitForVoiceUsage(userId, costUsd, `sms_${twilioMessageSid}`);
    return debited;
  } catch (error: unknown) {
    log.warn("sms billing debit failed", {
      userId,
      twilioMessageSid,
      segments,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
