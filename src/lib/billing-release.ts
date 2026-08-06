import { AppError } from "./api-error";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function selfServeBillingEnabled(): boolean {
  const raw = String(process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED || "")
    .trim()
    .toLowerCase();
  return ENABLED_VALUES.has(raw);
}

/**
 * Production checkout must remain closed until Stripe identity, portal,
 * lifecycle, and refund/cancellation certification are explicitly approved.
 * Valid Stripe credentials are necessary but never sufficient to open sales.
 */
export function enforceSelfServeBillingRelease(): void {
  if (selfServeBillingEnabled()) return;
  throw AppError.fromHttpStatus(
    503,
    "Self-serve billing is temporarily unavailable while launch certification is completed.",
  );
}
