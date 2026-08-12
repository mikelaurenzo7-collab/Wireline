#!/usr/bin/env node
/**
 * Read-only audit of customer-facing identity on the live Stripe account.
 *
 * The catalog can be perfectly aligned while Checkout, receipts, Dashboard,
 * and card statements still expose a stale company name or domain. This audit
 * checks that narrow identity boundary and deliberately excludes personal,
 * banking, tax, address, and verification fields from output.
 */

import Stripe from "stripe";

import {
  stripeAccountIdentityFindings,
  stripeAccountIdentitySummary,
} from "./lib/stripe-account-identity.mjs";

const API_VERSION = "2026-07-29.dahlia";
const secret = process.env.STRIPE_SECRET_KEY?.trim();

if (!secret) {
  console.error("STRIPE_SECRET_KEY is required. Run npm run stripe:audit-live with VERCEL_TOKEN.");
  process.exit(1);
}

try {
  const stripe = new Stripe(secret, { apiVersion: API_VERSION });
  const account = await stripe.accounts.retrieve();
  const findings = stripeAccountIdentityFindings(account);

  console.log(
    JSON.stringify(
      {
        account_id: account.id,
        identity: stripeAccountIdentitySummary(account),
        findings,
      },
      null,
      2,
    ),
  );

  if (findings.some((finding) => finding.level === "error")) process.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
