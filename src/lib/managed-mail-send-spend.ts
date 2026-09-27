import {
  commitPlatformCostReservation,
  markPlatformCostReservationAmbiguous,
  reservePlatformCostRecord,
} from "../middleware/audit-middleware";

/** Purchased send-capacity allocation; not a per-message customer invoice. */
export const MANAGED_EMAIL_SEND_RESERVE_USD = 0.002;

/** Each actual transport attempt needs its own durable debit, including retries. */
export async function sendFundedManagedEmail(options: {
  userId: string;
  provider: "agentmail" | "resend";
  perform: () => Promise<boolean>;
}): Promise<boolean> {
  const decision = await reservePlatformCostRecord({
    userId: options.userId,
    action: "platform.email.send",
    provider: options.provider,
    model: options.provider === "agentmail" ? "smtp" : "transactional",
    costUsd: MANAGED_EMAIL_SEND_RESERVE_USD,
  });
  if (!decision.reserved) return false;

  try {
    const accepted = await options.perform();
    if (accepted) await commitPlatformCostReservation(decision.reservation);
    else await markPlatformCostReservationAmbiguous(decision.reservation);
    return accepted;
  } catch (error) {
    // A timeout or failed SMTP response does not prove the message was unsent.
    await markPlatformCostReservationAmbiguous(decision.reservation);
    throw error;
  }
}
