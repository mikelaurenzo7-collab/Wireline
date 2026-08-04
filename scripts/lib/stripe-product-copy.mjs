function normalizeCopy(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function finding(level, message, metadata = {}) {
  return { level, message, metadata };
}

/**
 * Compare active Stripe product copy and managed metadata against the canonical
 * repository manifest. The catalog audit owns price topology; this policy owns
 * customer-visible product truth and the metadata fields used by Wireline.
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
