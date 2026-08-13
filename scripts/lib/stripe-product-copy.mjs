export const EXPECTED_PRODUCT_URL = "https://trywireline.com/pricing";
export const EXPECTED_SUBSCRIPTION_STATEMENT_DESCRIPTOR = "WIRELINE";

function normalizeCopy(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function finding(level, message, metadata = {}) {
  return { level, message, metadata };
}

/**
 * Compare active Stripe product copy, billing presentation, and managed
 * metadata against Wireline's canonical repository truth. The catalog audit
 * owns price topology; this policy owns customer-visible product identity.
 */
export function stripeProductCopyFindings(products, expectedProducts) {
  const findings = [];
  const activeProducts = products.filter((product) => product?.active);

  for (const expected of expectedProducts) {
    const matches = activeProducts.filter((product) => product.name === expected.name);
    if (matches.length !== 1) {
      findings.push(
        finding("error", `Expected exactly one active Stripe product named ${expected.name}.`, {
          expected_product: expected.name,
          match_count: matches.length,
          product_ids: matches.map((product) => product.id),
        }),
      );
      continue;
    }

    const product = matches[0];
    const expectedDescription = normalizeCopy(expected.description);
    const actualDescription = normalizeCopy(product.description);
    if (actualDescription !== expectedDescription) {
      findings.push(
        finding("error", `Stripe product description drift for ${expected.name}.`, {
          product_id: product.id,
          expected_description: expectedDescription,
          actual_description: actualDescription || null,
        }),
      );
    }

    if (String(product.url || "") !== EXPECTED_PRODUCT_URL) {
      findings.push(
        finding("error", `Stripe product URL drift for ${expected.name}.`, {
          product_id: product.id,
          expected_url: EXPECTED_PRODUCT_URL,
          actual_url: product.url || null,
        }),
      );
    }

    // Stripe only applies Product.statement_descriptor to subscription payments.
    // Runtime Balance is a one-time Checkout payment, so its Product descriptor
    // is not a customer-facing billing invariant and should not create false drift.
    if (expected.key !== "conversation_balance") {
      const actualDescriptor = String(product.statement_descriptor || "");
      if (actualDescriptor !== EXPECTED_SUBSCRIPTION_STATEMENT_DESCRIPTOR) {
        findings.push(
          finding("error", `Stripe product statement descriptor drift for ${expected.name}.`, {
            product_id: product.id,
            expected_statement_descriptor: EXPECTED_SUBSCRIPTION_STATEMENT_DESCRIPTOR,
            actual_statement_descriptor: product.statement_descriptor || null,
          }),
        );
      }
    }

    for (const [key, expectedValue] of Object.entries(expected.metadata || {})) {
      const actualValue = String(product.metadata?.[key] || "");
      if (actualValue !== String(expectedValue)) {
        findings.push(
          finding("error", `Stripe product metadata drift for ${expected.name}.${key}.`, {
            product_id: product.id,
            metadata_key: key,
            expected: String(expectedValue),
            actual: actualValue || null,
          }),
        );
      }
    }
  }

  return findings;
}
