import type Stripe from "stripe";
import { stripe } from "./stripe-helpers";
import { applyWirelineCheckoutBranding } from "./stripe-checkout-branding";

let installed = false;

/**
 * Enforce Wireline's public brand at the Stripe client boundary.
 *
 * Checkout is created from multiple route owners (plans, Runtime Balance, Live
 * Video, plus a shadow fallback). Installing once here keeps every current and
 * future Checkout Session branded even if Stripe Dashboard identity drifts.
 * The wrapper preserves all overload arguments and only rewrites the first
 * SessionCreateParams object.
 */
export function installStripeCheckoutBrandingInvariant(): void {
  if (installed) return;

  const sessions = stripe.checkout.sessions;
  const originalCreate = sessions.create.bind(sessions) as unknown as (
    ...args: unknown[]
  ) => unknown;

  const brandedCreate = (
    params: Stripe.Checkout.SessionCreateParams,
    ...rest: unknown[]
  ): unknown => originalCreate(applyWirelineCheckoutBranding(params), ...rest);

  Object.defineProperty(sessions, "create", {
    configurable: true,
    writable: true,
    value: brandedCreate as typeof sessions.create,
  });

  installed = true;
}
