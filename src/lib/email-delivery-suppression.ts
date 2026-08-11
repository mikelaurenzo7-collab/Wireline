import { eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import { normalizeEmail, recordEmailSuppression } from "./email-compliance";
import { emailDeliverySuppressions } from "../db/resend-webhook-schema";

export type ProviderDeliverySuppressionReason =
  | "resend_bounced"
  | "resend_complained"
  | "resend_suppressed";

/**
 * Provider delivery risk is not a marketing-preference decision.
 * Keep it in its own table so a complaint/hard bounce can stop every Resend
 * transport attempt without turning a user unsubscribe into a transactional
 * notification preference.
 */
export async function recordProviderDeliverySuppression(
  email: string,
  reason: ProviderDeliverySuppressionReason,
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) return;

  // Preserve the existing canonical commercial suppression path too. It is
  // idempotent and intentionally does not overwrite a prior unsubscribe reason.
  await recordEmailSuppression(normalized, reason);

  await drizzle
    .insert(emailDeliverySuppressions)
    .values({
      email: normalized,
      provider: "resend",
      reason,
      firstSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: emailDeliverySuppressions.email,
      set: {
        provider: "resend",
        reason,
        updatedAt: new Date(),
      },
    });
}

/**
 * Checked by the platform Resend transport for transactional and commercial
 * sends. Unlike `isEmailSuppressed`, this ignores preference-only opt-outs.
 * Database errors intentionally propagate so delivery fails closed rather than
 * repeatedly targeting an address the provider has already rejected.
 */
export async function isProviderDeliverySuppressed(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) return false;

  const [row] = await drizzle
    .select({ email: emailDeliverySuppressions.email })
    .from(emailDeliverySuppressions)
    .where(eq(emailDeliverySuppressions.email, normalized))
    .limit(1);
  return Boolean(row);
}
