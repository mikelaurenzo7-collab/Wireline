const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export const SELF_SERVE_BILLING_BLOCK = Object.freeze({
  status: 503,
  code: "BILLING_LAUNCH_NOT_APPROVED",
  error: "Self-serve billing is temporarily unavailable while launch certification is completed.",
});

function normalizedEnv(name: string): string {
  return String(process.env[name] || "").trim().toLowerCase();
}

export function selfServeBillingReleaseBlockers(): string[] {
  const blockers: string[] = [];
  if (!ENABLED_VALUES.has(normalizedEnv("WIRELINE_SELF_SERVE_BILLING_ENABLED"))) {
    blockers.push("WIRELINE_SELF_SERVE_BILLING_ENABLED=true");
  }
  // Paid acquisition must never open while production events are still marked
  // as demo/test evidence. Require an explicit false rather than treating an
  // omitted value as safe, so release remains fail-closed across env drift.
  if (normalizedEnv("WIRELINE_LAUNCH_DEMO_MODE") !== "false") {
    blockers.push("WIRELINE_LAUNCH_DEMO_MODE=false");
  }
  return blockers;
}

export function selfServeBillingEnabled(): boolean {
  return selfServeBillingReleaseBlockers().length === 0;
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
