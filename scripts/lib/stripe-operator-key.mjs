import { getVercelEnvValue } from "./vercel-env-values.mjs";

/** Prefer the operator's supplied key; Vercel lookup is a legacy fallback only. */
export async function resolveStripeOperatorKey(
  env = process.env,
  readVercelValue = getVercelEnvValue,
) {
  const supplied = env.STRIPE_SECRET_KEY?.trim();
  const token = env.VERCEL_TOKEN?.trim();
  const key = supplied || (token ? await readVercelValue(token, "STRIPE_SECRET_KEY") : "");
  if (!key)
    throw new Error("Provide STRIPE_SECRET_KEY in the secure production operator environment.");
  if (!/^(?:sk|rk)_live_/.test(key)) {
    throw new Error("Stripe production verification requires a live Stripe key.");
  }
  return key;
}
