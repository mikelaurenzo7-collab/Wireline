import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOUNDER_PRODUCTS } from "../scripts/lib/stripe-founder-catalog.mjs";

const catalog = readFileSync("scripts/lib/stripe-founder-catalog.mjs", "utf8");
const audit = readFileSync("scripts/lib/stripe-product-copy.mjs", "utf8");
const reconciler = readFileSync("scripts/setup-stripe-catalog.mjs", "utf8");

describe("Stripe customer-facing product truth", () => {
  it("keeps active channel copy aligned with its included capacity and bounded completion policy", () => {
    const packages = FOUNDER_PRODUCTS.filter(
      (product) => product.metadata.wireline_billing_model === "channel_package",
    );
    expect(packages).toHaveLength(10);
    for (const product of packages) {
      const channels = product.metadata.wireline_channels.split(",");
      const count = Number(product.metadata.included_agents);
      expect(product.description).toContain(`${count} Bot${count === 1 ? "" : "s"} with`);
      expect(count).toBe(1);
      expect(product.description).toContain("No automatic top-ups or overage invoices.");
      expect(product.description.includes("and email delivery")).toBe(channels.includes("email"));
      expect(channels).not.toContain("sms");
      if (channels.includes("voice")) {
        expect(product.description).toContain(
          `${product.metadata.included_voice_minutes} live-call minutes/month.`,
        );
        expect(product.description).toContain(
          "Up to 10 additional completion minutes within the call limit",
        );
        expect(product.description).toContain(
          "any balance due pauses new calls and prepaid extras",
        );
      } else {
        expect(product.description).not.toContain("live-call minutes");
        expect(product.description).not.toContain("completion minutes");
      }
    }
    expect(
      FOUNDER_PRODUCTS.find((product) => product.key === "conversation_balance")?.description,
    ).toBe(
      "Prepaid Runtime Balance for usage beyond included capacity. No automatic top-ups or overage invoices.",
    );

    // Live Video is retired and must not quietly re-enter the active catalog.
    expect(catalog).not.toContain("Live Video for a paid business agent");
    expect(catalog).not.toContain('key: "live_video"');
    expect(catalog).not.toContain('key: "live_video_monthly"');

    // Customer-facing catalog prose follows the canonical Bot taxonomy while
    // internal resolver keys may retain historical `agent` identifiers.
    expect(catalog).not.toContain("live voice agent");
    expect(catalog).not.toContain("live agents");
    expect(catalog).not.toContain("25+ agents");
    expect(catalog).not.toContain("Founder plan for one live communications agent");
    expect(catalog).not.toContain("Founder hybrid plan");
    expect(catalog).not.toContain("Multi-agent operating plan for growing businesses");
    expect(catalog).not.toContain("High-capacity operating plan");
    expect(catalog).not.toContain("advanced routing");
  });

  // Product statement descriptors are subscription-only in Stripe. Runtime
  // Balance is a one-time payment, so only recurring products are policed here.
  it("fails live audits when product URLs or recurring statement identity drift", () => {
    expect(audit).toContain('EXPECTED_PRODUCT_URL = "https://botbound.app/pricing"');
    expect(audit).toContain('EXPECTED_SUBSCRIPTION_STATEMENT_DESCRIPTOR = "BOTBOUND"');
    expect(audit).not.toContain("https://trywireline.com/pricing");
    expect(audit).not.toContain('EXPECTED_SUBSCRIPTION_STATEMENT_DESCRIPTOR = "WIRELINE"');
    expect(audit).toContain("Stripe product URL drift");
    expect(audit).toContain("Stripe product statement descriptor drift");
    expect(audit).toContain('expected.key !== "conversation_balance"');
    expect(audit).toContain("only applies Product.statement_descriptor to subscription payments");
  });

  it("makes the catalog reconciler repair audited customer-facing presentation", () => {
    expect(reconciler).toContain("EXPECTED_PRODUCT_URL");
    expect(reconciler).toContain("EXPECTED_SUBSCRIPTION_STATEMENT_DESCRIPTOR");
    expect(reconciler).toContain("customerProductPresentation(spec)");
    expect(reconciler).toContain('spec.key === "conversation_balance"');
    expect(reconciler).toContain("...customerPresentation");
  });
});
