#!/usr/bin/env node
/** Read-only Stripe checks using the current host's injected credentials. */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const audits = [
  "audit-stripe-account-identity-live.mjs",
  "audit-stripe-product-copy-live.mjs",
  "audit-stripe-catalog-live.mjs",
];

export function runStripeAudit({ env = process.env, run = spawnSync } = {}) {
  const secret = env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    throw new Error(
      "STRIPE_SECRET_KEY must be injected by the authorized host. Run this read-only audit in the Render production shell; do not export production secrets into local development.",
    );
  }
  if (!/^(?:sk|rk)_live_/.test(secret)) {
    throw new Error(
      "The live Stripe audit requires a live secret or restricted key; sandbox and malformed keys are not accepted.",
    );
  }

  let failed = false;
  for (const audit of audits) {
    const result = run(process.execPath, [fileURLToPath(new URL(audit, import.meta.url))], {
      cwd: root,
      env: { ...env, STRIPE_SECRET_KEY: secret },
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw new Error(`Unable to start read-only audit: ${audit}`);
    if (result.status !== 0) failed = true;
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.exitCode = runStripeAudit();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Read-only Stripe audit failed.");
    process.exitCode = 1;
  }
}
