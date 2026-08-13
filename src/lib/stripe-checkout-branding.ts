export const STRIPE_CHECKOUT_DISPLAY_NAME = "Wireline" as const;

/**
 * Apply the customer-facing Wireline name to every hosted Stripe Checkout.
 *
 * Stripe's account business profile is Dashboard-owned for a standard account,
 * so a stale account label must not leak into a payment page while that profile
 * is being corrected operationally. Keep caller-specific visual settings and
 * force only the display name that is part of Wireline's public brand contract.
 */
export function applyWirelineCheckoutBranding<T extends { branding_settings?: object }>(
  params: T,
): T {
  return {
    ...params,
    branding_settings: {
      ...(params.branding_settings ?? {}),
      display_name: STRIPE_CHECKOUT_DISPLAY_NAME,
    },
  } as T;
}
