import type Stripe from "stripe";

/** Shared Stripe API pin for runtime clients and production-only operator scripts. */
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-07-29.dahlia";
