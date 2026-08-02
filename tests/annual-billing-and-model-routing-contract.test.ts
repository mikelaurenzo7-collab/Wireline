import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { selectModelForTask } from "../src/lib/ai-models";
import { parseSignupIntent } from "../src/lib/signup-intent";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("annual billing purchase path", () => {
  it("wires annual billing through pricing, checkout, and signup", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const billingCard = read("src/components/StripeBillingCard.tsx");
    const launchCheckout = read("src/routes/launch-billing-checkout-routes.ts");

    expect(pricing).toContain('billingInterval === "year"');
    expect(pricing).toContain("&interval=year");
    expect(billingCard).toContain("interval },");
    expect(billingCard).toContain('billingInterval === "year"');
    expect(launchCheckout).toContain('req.body?.interval === "year"');
    expect(
      parseSignupIntent("?plan=starter&interval=year")
        ?.preferredBillingInterval,
    ).toBe("year");
  });

  it("does not invent sales discounts", () => {
    const personas = read("src/lib/wireline-agent-personas.ts");
    expect(personas).toContain("Do not invent coupons or percent-off deals");
    expect(personas).not.toMatch(
      /Offer up to \$\{SALES_AUTO_DISCOUNT_MAX_PERCENT\}%/,
    );
  });

  it("keeps signup outside inherited tenant context", () => {
    const auth = read("src/lib/auth-service.ts");
    expect(auth).toContain('tenantStore.run(""');
    expect(auth).toContain("Signup bootstrap must never inherit");
  });
});

describe("structured model routing", () => {
  it("routes simple and medium work to Luna and complex work to Terra", () => {
    expect(selectModelForTask("simple")).toBe("gpt-5.6-luna");
    expect(selectModelForTask("medium")).toBe("gpt-5.6-luna");
    expect(selectModelForTask("complex")).toBe("gpt-5.6-terra");
  });
});
