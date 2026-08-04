#!/usr/bin/env node
/** Read-only parity audit for live Stripe product descriptions and metadata. */

import Stripe from "stripe";

import {
  FOUNDER_CATALOG_VERSION,
  FOUNDER_PRODUCTS,
} from "./lib/stripe-founder-catalog.mjs";
import { stripeProductCopyFindings } from "./lib/stripe-product-copy.mjs";

const API_VERSION = "2026-02-25.clover";
const secret = process.env.STRIPE_SECRET_KEY?.trim();

if (!secret) {
  console.error("STRIPE_SECRET_KEY is required. Run npm run stripe:audit-live with VERCEL_TOKEN.");
  process.exit(1);
}

try {
  const stripe = new Stripe(secret, { apiVersion: API_VERSION });
  const products = [];
  for await (const product of stripe.products.list({ limit: 100 })) products.push(product);

  const expectedProducts = FOUNDER_PRODUCTS.map((product) => ({
    ...product,
    metadata: {
      ...product.metadata,
      wireline_catalog_version: FOUNDER_CATALOG_VERSION,
    },
  }));
  const findings = stripeProductCopyFindings(products, expectedProducts);
  console.log(
    JSON.stringify(
      {
        catalog_version: FOUNDER_CATALOG_VERSION,
        expected_product_count: expectedProducts.length,
        active_product_count: products.filter((product) => product.active).length,
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
