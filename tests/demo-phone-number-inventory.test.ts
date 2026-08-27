import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_ENVIRONMENT_UNAVAILABLE,
  NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
  liveExternalActionPolicy,
} from "../src/lib/account-environment-policy";
import {
  DEMO_PHONE_NUMBER_INVENTORY,
  resolveNonProductionPhoneNumberPickerInventory,
} from "../src/lib/voice/phone-number-picker-inventory";

describe("demo phone-number picker inventory", () => {
  it("returns only inert reserved fixtures for demo accounts", () => {
    const result = resolveNonProductionPhoneNumberPickerInventory(liveExternalActionPolicy("demo"));

    expect(result).toEqual({
      available: DEMO_PHONE_NUMBER_INVENTORY,
      source: "demo_fixture",
    });
    expect(result).not.toBeNull();
    if (!result) throw new Error("Demo inventory unexpectedly missing");
    expect(result.available).not.toBe(DEMO_PHONE_NUMBER_INVENTORY);
    expect(new Set(result.available.map((row) => row.phone_number)).size).toBe(
      result.available.length,
    );
    for (const row of result.available) {
      expect(row.phone_number).toMatch(/^\+1[2-9]\d{2}55501\d{2}$/);
      expect(row.area_code).toBe(row.phone_number.slice(2, 5));
      expect(row.region).toBeTruthy();
    }
  });

  it.each([
    ["test", 403, NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED],
    [null, 503, ACCOUNT_ENVIRONMENT_UNAVAILABLE],
    [undefined, 503, ACCOUNT_ENVIRONMENT_UNAVAILABLE],
    ["unknown", 503, ACCOUNT_ENVIRONMENT_UNAVAILABLE],
  ] as const)(
    "fails closed for the %s account classification before carrier work",
    (environment, status, code) => {
      expect(() =>
        resolveNonProductionPhoneNumberPickerInventory(liveExternalActionPolicy(environment)),
      ).toThrow(expect.objectContaining({ status, code }));
    },
  );

  it("leaves the production account on the existing rate-limited carrier path", () => {
    expect(
      resolveNonProductionPhoneNumberPickerInventory(liveExternalActionPolicy("production")),
    ).toBeNull();
  });

  it("binds the authenticated availability route to the policy resolver", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/routes/native-phone-routing-routes.ts"),
      "utf8",
    );
    const start = route.indexOf('"/api/phone-numbers/available"');
    const end = route.indexOf('"/api/phone-numbers/search"', start);
    const availabilityRoute = route.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const policyIndex = availabilityRoute.indexOf("liveExternalActionPolicyForUser(req.user.id)");
    const fixtureIndex = availabilityRoute.indexOf(
      "resolveNonProductionPhoneNumberPickerInventory(policy)",
    );
    const limiterIndex = availabilityRoute.indexOf("phoneNumberRateLimiter");
    const carrierIndex = availabilityRoute.indexOf("listNativeAvailableLocalNumbers(");
    expect(policyIndex).toBeGreaterThan(-1);
    expect(fixtureIndex).toBeGreaterThan(policyIndex);
    expect(limiterIndex).toBeGreaterThan(fixtureIndex);
    expect(carrierIndex).toBeGreaterThan(limiterIndex);
    expect(availabilityRoute).toContain("res.json(fixture)");
    expect(availabilityRoute).toContain('source: "twilio_preview"');
  });
});
