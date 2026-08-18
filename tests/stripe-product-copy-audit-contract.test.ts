import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const catalog = readFileSync("scripts/lib/stripe-founder-catalog.mjs", "utf8");
const audit = readFileSync("scripts/lib/stripe-product-copy.mjs", "utf8");
const reconciler = readFileSync("scripts/setup-stripe-catalog.mjs", "utf8");

const ACTIVE_PRODUCT_COPY = [
  "1 live Voice Bot, 1 production number, 50 voice minutes/month, email + SMS, and no automatic overages.",
  "2 live Bots, 2 production numbers, 100 pooled voice minutes/month, Lead Hunt, email + SMS, and no automatic overages.",
  "Up to 5 live Bots, 190 pooled voice minutes/month, routing, approvals, CRM, email + SMS, and no automatic overages.",
  "Up to 15 live Bots, 350 pooled voice minutes/month, routing, analytics, CRM, email + SMS, and no automatic overages.",
  "Custom plan for 25+ Bots with advanced governance, SSO, integrations, retention controls, security review, and implementation support.",
  "+1 live Bot, +1 production-number slot, and +50 guaranteed voice minutes/month.",
  "Prepaid Runtime Balance for usage beyond included capacity. No automatic overages.",
] as const;

describe("Stripe customer-facing product truth", () => {
  it("keeps the active founder manifest aligned with concise supported Bot copy", () => {
    for (const description of ACTIVE_PRODUCT_COPY) expect(catalog).toContain(description);

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
    expect(audit).toContain('EXPECTED_PRODUCT_URL = "https://trywireline.com/pricing"');
    expect(audit).toContain('EXPECTED_SUBSCRIPTION_STATEMENT_DESCRIPTOR = "WIRELINE"');
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