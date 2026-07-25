import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { selectModelForTask } from "../src/lib/ai-models";
import { parseSignupIntent } from "../src/lib/signup-intent";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("annual billing purchase path", () => {
  it("wires interval=year through pricing CTAs, checkout body, and signup intent", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const billingCard = read("src/components/StripeBillingCard.tsx");
    const launchCheckout = read("src/routes/launch-billing-checkout-routes.ts");

    expect(pricing).toContain('billingInterval === "year"');
    expect(pricing).toContain("&interval=year");
    expect(billingCard).toContain("interval },");
    expect(billingCard).toContain('billingInterval === "year"');
    expect(launchCheckout).toContain('req.body?.interval === "year"');
    expect(parseSignupIntent("?plan=starter&interval=year")?.preferredBillingInterval).toBe("year");
  });

  it("keeps sales persona honest about annual savings without fake coupons", () => {
    const personas = read("src/lib/wireline-agent-personas.ts");
    expect(personas).toContain("Do not invent coupons or percent-off deals");
    expect(personas).not.toMatch(/Offer up to \$\{SALES_AUTO_DISCOUNT_MAX_PERCENT\}%/);
  });

  it("hardens signup against inherited tenant ALS / wireline_server RLS", () => {
    const auth = read("src/lib/auth-service.ts");
    expect(auth).toContain('tenantStore.run(""');
    expect(auth).toContain("Signup bootstrap must never inherit");
  });
});

describe("structured model routing", () => {
  it("routes simple and medium tasks to GPT-5 and complex to GPT-5.6 Terra", () => {
    expect(selectModelForTask("simple")).toBe("gpt-5");
    expect(selectModelForTask("medium")).toBe("gpt-5");
    expect(selectModelForTask("complex")).toBe("gpt-5.6-terra");
  });
});
