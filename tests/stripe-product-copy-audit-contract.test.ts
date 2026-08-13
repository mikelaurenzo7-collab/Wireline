import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const catalog = readFileSync("scripts/lib/stripe-founder-catalog.mjs", "utf8");
const audit = readFileSync("scripts/lib/stripe-product-copy.mjs", "utf8");

const LIVE_PRODUCT_COPY = [
  "1 live voice agent, 1 production number, 60 voice minutes/month, email + SMS, and no automatic overages.",
  "2 live agents, 2 production numbers, 120 pooled voice minutes/month, Lead Hunt, email + SMS, and no automatic overages.",
  "Up to 5 live voice agents, 245 pooled voice minutes/month, routing, approvals, CRM, email + SMS, and no automatic overages.",
  "Up to 15 live voice agents, 450 pooled voice minutes/month, advanced routing, analytics, CRM, email + SMS, and no automatic overages.",
  "Custom plan for 25+ agents with advanced governance, SSO, integrations, retention controls, security review, and implementation support.",
  "+1 live voice agent, +1 production-number slot, and +50 guaranteed voice minutes/month.",
  "Live Video for a paid business agent: 60 reserved minutes/month in up-to-5-minute sessions, with no automatic overage.",
  "Prepaid Runtime Balance for usage beyond included capacity. No automatic overages.",
] as const;

describe("Stripe customer-facing product truth", () => {
  it("keeps the founder manifest aligned with the concise live Stripe catalog", () => {
    for (const description of LIVE_PRODUCT_COPY) expect(catalog).toContain(description);
    expect(catalog).not.toContain("Founder plan for one live communications agent");
    expect(catalog).not.toContain("Founder hybrid plan");
    expect(catalog).not.toContain("Multi-agent operating plan for growing businesses");
    expect(catalog).not.toContain("High-capacity operating plan");
  });

  it("fails live audits when product URLs or recurring statement identity drift", () => {
    expect(audit).toContain('EXPECTED_PRODUCT_URL = "https://trywireline.com/pricing"');
    expect(audit).toContain('EXPECTED_SUBSCRIPTION_STATEMENT_DESCRIPTOR = "TRY WIRELINE"');
    expect(audit).toContain("Stripe product URL drift");
    expect(audit).toContain("Stripe product statement descriptor drift");
    expect(audit).toContain('expected.key !== "conversation_balance"');
  });
});
