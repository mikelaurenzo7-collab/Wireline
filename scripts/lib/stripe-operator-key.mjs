/** The operator's supplied key is the only source; there is no provider-store fallback. */
export async function resolveStripeOperatorKey(env = process.env) {
  const supplied = env.STRIPE_SECRET_KEY?.trim();
  if (!supplied)
    throw new Error("Provide STRIPE_SECRET_KEY in the secure production operator environment.");
  if (!/^(?:sk|rk)_live_/.test(supplied)) {
    throw new Error("Stripe production verification requires a live Stripe key.");
  }
  return supplied;
}
