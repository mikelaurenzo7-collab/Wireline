const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

/**
 * Legacy exact-SHA authorization variable.
 *
 * Older production releases required this value to equal VERCEL_GIT_COMMIT_SHA,
 * which meant a solo operator had to rotate an environment variable for every
 * production commit. Canonical production already runs the comprehensive
 * release audit, environment checks, Stripe verification, migrations, schema
 * assertions, build, and smoke tests before Vercel can promote the artifact.
 *
 * Keep the name exported for compatibility while treating it as retired
 * configuration. Runtime authorization is now bound to the audited production
 * release channel instead of one commit hash.
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

/**
 * Self-serve billing is a production capability, never a preview capability.
 * A Git-backed production deployment must originate from main. Every canonical
 * production artifact is forced through the mandatory production audit before
 * it can become READY, so safe redeploys do not require a human to rotate a
 * release SHA environment variable.
 */
export function selfServeBillingReleaseBlockers(): string[] {
  const blockers: string[] = [];
  if (!ENABLED_VALUES.has(normalizedEnv("WIRELINE_SELF_SERVE_BILLING_ENABLED"))) {
    blockers.push("WIRELINE_SELF_SERVE_BILLING_ENABLED=true");
  }
  if (normalizedEnv("WIRELINE_LAUNCH_DEMO_MODE") !== "false") {
    blockers.push("WIRELINE_LAUNCH_DEMO_MODE=false");
  }
  if (normalizedEnv("VERCEL_ENV") !== "production") {
    blockers.push("VERCEL_ENV=production");
  }
  if (normalizedEnv("VERCEL_GIT_COMMIT_REF") !== "main") {
    blockers.push("VERCEL_GIT_COMMIT_REF=main");
  }

  return blockers;
}

export function selfServeBillingEnabled(): boolean {
  return selfServeBillingReleaseBlockers().length === 0;
}

/**
 * Production checkout remains closed unless the deployment is the audited main
 * production channel with live telemetry classification explicitly enabled.
 * Valid Stripe credentials are necessary but never sufficient to open sales.
 */
export function selfServeBillingBlockResponse() {
  return {
    code: SELF_SERVE_BILLING_BLOCK.code,
    error: SELF_SERVE_BILLING_BLOCK.error,
  };
}
