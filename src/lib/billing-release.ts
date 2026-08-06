const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export const SELF_SERVE_BILLING_BLOCK = Object.freeze({
  status: 503,
  code: "BILLING_LAUNCH_NOT_APPROVED",
  error: "Self-serve billing is temporarily unavailable while launch certification is completed.",
});

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
export function selfServeBillingBlockResponse() {
  return {
    code: SELF_SERVE_BILLING_BLOCK.code,
    error: SELF_SERVE_BILLING_BLOCK.error,
  };
}
