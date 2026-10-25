import { describe, expect, it } from "vitest";
import {
  checkoutConfigurationKey,
  validateUsageCheckoutAddons,
} from "../src/lib/checkout-configuration";

describe("checkout purchase identity", () => {
  const base = { price: "price_base", quantity: 1 };
  const meter = { price: "price_calls" };
  const number = { price: "price_number", quantity: 1 };
  const key = (items: Parameters<typeof checkoutConfigurationKey>[2]) =>
    checkoutConfigurationKey("usage", "month", items);
  it("reuses equivalent purchases but distinguishes add-ons, quantities and prices", () => {
    expect(key([base, meter, number])).toBe(key([meter, number, base]));
    expect(key([base, meter])).not.toBe(key([base, meter, number]));
    expect(key([base, meter, number])).not.toBe(key([base, meter, { ...number, quantity: 2 }]));
    expect(key([base, meter, number])).not.toBe(
      key([base, meter, { ...number, price: "price_new" }]),
    );
  });
  it("rejects fixed add-ons beyond the disclosed default limit", () => {
    expect(() => validateUsageCheckoutAddons({ numbers: 20, emailAddresses: 20 })).toThrow(
      "default monthly limit",
    );
    expect(() => validateUsageCheckoutAddons({ numbers: 1, emailAddresses: 1 })).not.toThrow();
  });
});
