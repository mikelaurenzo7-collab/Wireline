import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canAccessFounderCockpit,
  resetFounderCockpitAccessCacheForTests,
} from "../src/lib/founder-cockpit-access";
import { resetOwnerEmailCacheForTests } from "../src/lib/auth-service";

describe("founder-cockpit-access", () => {
  beforeEach(() => {
    resetOwnerEmailCacheForTests();
    resetFounderCockpitAccessCacheForTests();
  });

  afterEach(() => {
    delete process.env.OWNER_EMAIL;
    delete process.env.OWNER_EMAILS;
    delete process.env.FOUNDER_COCKPIT_EMAILS;
    delete process.env.FOUNDER_COCKPIT_USER_IDS;
    resetOwnerEmailCacheForTests();
    resetFounderCockpitAccessCacheForTests();
  });

  it("allows the primary owner email", () => {
    process.env.OWNER_EMAIL = "founder@trywireline.com";
    expect(canAccessFounderCockpit({ id: "u1", email: "founder@trywireline.com" })).toBe(true);
  });

  it("denies regular tenant accounts", () => {
    process.env.OWNER_EMAIL = "founder@trywireline.com";
    expect(canAccessFounderCockpit({ id: "u2", email: "customer@example.com" })).toBe(false);
  });

  it("allows explicitly approved cockpit emails", () => {
    process.env.OWNER_EMAIL = "founder@trywireline.com";
    process.env.FOUNDER_COCKPIT_EMAILS = "ops@trywireline.com";
    expect(canAccessFounderCockpit({ id: "u3", email: "ops@trywireline.com" })).toBe(true);
  });

  it("allows explicitly approved user ids", () => {
    process.env.OWNER_EMAIL = "founder@trywireline.com";
    process.env.FOUNDER_COCKPIT_USER_IDS = "uuid-approved-1";
    expect(canAccessFounderCockpit({ id: "uuid-approved-1", email: "any@example.com" })).toBe(true);
  });
});
