const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const FULL_GIT_SHA = /^[a-f0-9]{40}$/i;

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

function deployedCommitSha(): string | null {
  const sha = normalizedEnv("VERCEL_GIT_COMMIT_SHA");
  return FULL_GIT_SHA.test(sha) ? sha : null;
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

  // A boolean project-level flag can silently survive many deployments. Tie
  // release authorization to the exact Vercel Git SHA so every new production
  // artifact fails closed until that specific code has been reviewed and
  // authorized. Vercel exposes VERCEL_GIT_COMMIT_SHA at build and runtime.
  const deploymentSha = deployedCommitSha();
  if (!deploymentSha) {
    blockers.push("VERCEL_GIT_COMMIT_SHA=<40-character deployed Git SHA>");
  } else if (normalizedEnv(SELF_SERVE_BILLING_RELEASE_SHA_ENV) !== deploymentSha) {
    blockers.push(`${SELF_SERVE_BILLING_RELEASE_SHA_ENV}=${deploymentSha}`);
  }

  return blockers;
}

export function selfServeBillingEnabled(): boolean {
  return selfServeBillingReleaseBlockers().length === 0;
}

/**
 * Production checkout must remain closed until Stripe identity, portal,
 * lifecycle, and refund/cancellation certification are explicitly approved for
 * the exact deployed commit. Valid Stripe credentials are necessary but never
 * sufficient to open sales.
 */
export function selfServeBillingBlockResponse() {
  return {
    code: SELF_SERVE_BILLING_BLOCK.code,
    error: SELF_SERVE_BILLING_BLOCK.error,
  };
}
