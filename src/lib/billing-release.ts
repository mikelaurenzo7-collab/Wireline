const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

/**
 * Legacy audit marker retained for backwards compatibility with existing Vercel
 * project configuration and runbooks. Runtime self-serve availability is no
 * longer pinned to an exact Git SHA: canonical production already runs the full
 * release gate on every artifact (env validation, TypeScript/ESLint/security,
 * clean-room tests, Stripe portal/catalog verification, migrations, schema
 * effects, build, and smoke checks).
 *
 * Keeping a per-commit runtime kill-switch created an operational footgun for a
 * solo operator: harmless UI or copy deploys silently re-closed checkout even
 * after the mandatory production certification succeeded. The durable controls
 * are now the explicit owner launch toggle plus non-demo telemetry mode.
 */
export const SELF_SERVE_BILLING_RELEASE_SHA_ENV =
  "WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA" as const;

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
 * Production checkout remains fail-closed until the explicit owner release
 * toggle and live-telemetry posture are both present. Artifact correctness is
 * enforced independently by the mandatory canonical-production deployment
 * pipeline rather than by a second manually rotated SHA variable.
 */
export function selfServeBillingBlockResponse() {
  return {
    code: SELF_SERVE_BILLING_BLOCK.code,
    error: SELF_SERVE_BILLING_BLOCK.error,
  };
}
