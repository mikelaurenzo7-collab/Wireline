import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STRIPE_CHECKOUT_DISPLAY_NAME,
  applyWirelineCheckoutBranding,
} from "../src/lib/stripe-checkout-branding";

describe("Stripe Checkout branding invariant", () => {
  it("pins the customer-facing Checkout name to Wireline", () => {
    expect(STRIPE_CHECKOUT_DISPLAY_NAME).toBe("Wireline");

    expect(
      applyWirelineCheckoutBranding({
        mode: "payment",
        branding_settings: {
          button_color: "#6D28D9",
          display_name: "Cadence AI",
        },
      }),
    ).toEqual({
      mode: "payment",
      branding_settings: {
        button_color: "#6D28D9",
        display_name: "Wireline",
      },
    });
  });

  it("is installed before API routes can create Checkout Sessions", () => {
    const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const installIndex = serverSource.indexOf("installStripeCheckoutBrandingInvariant();");
    const routesIndex = serverSource.indexOf("registerApiRoutes(app);");

    expect(installIndex).toBeGreaterThan(-1);
    expect(routesIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeLessThan(routesIndex);
  });
});
