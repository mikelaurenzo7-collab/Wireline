import { describe, expect, it } from "vitest";
import { BRAND, NAV_GROUP_ACCENTS, ROUTE_ACCENTS } from "./brand-colors";

const ALLOWED = new Set([
  BRAND.purple,
  BRAND.purpleDeep,
  BRAND.purpleMid,
  BRAND.purpleRim,
  BRAND.purpleLight,
  BRAND.purpleMuted,
  BRAND.creamWarm,
  BRAND.creamDeep,
  BRAND.rose,
]);

describe("brand-colors", () => {
  it("NAV_GROUP_ACCENTS uses purple/cream family only", () => {
    for (const hex of Object.values(NAV_GROUP_ACCENTS)) {
      expect(ALLOWED.has(hex)).toBe(true);
    }
  });

  it("every route accent stays within the allowed purple/cream set", () => {
    for (const pair of Object.values(ROUTE_ACCENTS)) {
      for (const hex of pair) {
        expect(ALLOWED.has(hex)).toBe(true);
      }
    }
  });
});
