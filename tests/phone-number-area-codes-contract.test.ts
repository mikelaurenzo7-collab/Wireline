import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEMO_PHONE_NUMBER_INVENTORY,
  listPhoneNumberPickerAreaCodes,
  POPULAR_US_AREA_CODES,
} from "../src/lib/voice/phone-number-picker-inventory";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("phone-number area-code catalog", () => {
  it("returns a static picker contract without sharing the frozen source", () => {
    const listed = listPhoneNumberPickerAreaCodes();

    expect(listed).toEqual([...POPULAR_US_AREA_CODES]);
    expect(listed).not.toBe(POPULAR_US_AREA_CODES);
    expect(listed.length).toBeGreaterThanOrEqual(8);
    expect(new Set(listed.map((row) => row.code)).size).toBe(listed.length);
    for (const row of listed) {
      expect(row.code).toMatch(/^[2-9]\d{2}$/);
      expect(row.city.trim()).toBeTruthy();
      expect(row.state.trim()).toBeTruthy();
    }
    for (const fixture of DEMO_PHONE_NUMBER_INVENTORY) {
      expect(listed.some((row) => row.code === fixture.area_code)).toBe(true);
    }
  });

  it("serves GET /api/phone-numbers/area-codes as an authenticated catalog, not a Twilio lookup", () => {
    const routes = read("src/routes/native-phone-routing-routes.ts");
    const start = routes.indexOf('"/api/phone-numbers/area-codes"');
    const end = routes.indexOf('"/api/phone-numbers/available"', start);
    const catalog = routes.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(catalog).toContain("authenticateUser");
    expect(catalog).toContain("listPhoneNumberPickerAreaCodes()");
    expect(catalog).toContain("area_codes:");
    expect(catalog).not.toContain("liveExternalActionPolicyForUser");
    expect(catalog).not.toContain("listNativeAvailableLocalNumbers");
    expect(catalog).not.toContain("phoneNumberRateLimiter");
    expect(catalog).not.toContain("getTwilioClient");

    const picker = read("src/components/PhoneNumberPicker.tsx");
    expect(picker).toContain('authFetch("/api/phone-numbers/area-codes")');
    expect(picker).toContain("area_codes?: AreaCode[]");
    expect(picker).toContain("code: string;");
    expect(picker).toContain("city: string;");
    expect(picker).toContain("state: string;");
  });

  it("keeps search and provision on the live Twilio fence", () => {
    const routes = read("src/routes/native-phone-routing-routes.ts");
    const search = routes.slice(
      routes.indexOf('"/api/phone-numbers/search"'),
      routes.indexOf("async function respondWithProvision"),
    );
    expect(search).toContain("listNativeAvailableLocalNumbers");
    expect(search).not.toContain("listPhoneNumberPickerAreaCodes");

    const provision = read("src/lib/voice/native-phone-provisioning.ts");
    expect(provision).toContain("liveExternalActionPolicyForUser(input.userId)");
    const carrier = read("src/lib/voice/native-phone-carrier.ts");
    expect(carrier).toContain("liveExternalActionPolicyForUser(userId)");
  });
});
