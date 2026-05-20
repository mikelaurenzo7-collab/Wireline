import { describe, it, expect, afterEach } from "vitest";
import { isOwnerEmail } from "./auth-service";

/**
 * Tests for the `isOwnerEmail` pure gate. A bug here either leaks the
 * Founder's Dashboard to every user or locks the owner out — so the
 * env-driven, case/whitespace-normalizing behavior is pinned here.
 *
 * `isOwnerEmail` reads `process.env.OWNER_EMAIL` on every call (no
 * module-load capture), so each test sets/restores it directly.
 */

const ORIGINAL_OWNER_EMAIL = process.env.OWNER_EMAIL;

afterEach(() => {
  if (ORIGINAL_OWNER_EMAIL === undefined) {
    delete process.env.OWNER_EMAIL;
  } else {
    process.env.OWNER_EMAIL = ORIGINAL_OWNER_EMAIL;
  }
});

describe("isOwnerEmail", () => {
  it("returns true on an exact match", () => {
    process.env.OWNER_EMAIL = "founder@wireline.com";
    expect(isOwnerEmail("founder@wireline.com")).toBe(true);
  });

  it("matches case-insensitively (env upper, input lower)", () => {
    process.env.OWNER_EMAIL = "Founder@Wireline.COM";
    expect(isOwnerEmail("founder@wireline.com")).toBe(true);
  });

  it("matches case-insensitively (env lower, input upper)", () => {
    process.env.OWNER_EMAIL = "founder@wireline.com";
    expect(isOwnerEmail("FOUNDER@WIRELINE.COM")).toBe(true);
  });

  it("trims surrounding whitespace on the input email", () => {
    process.env.OWNER_EMAIL = "founder@wireline.com";
    expect(isOwnerEmail("  founder@wireline.com  ")).toBe(true);
  });

  it("trims surrounding whitespace on the OWNER_EMAIL env value", () => {
    process.env.OWNER_EMAIL = "  founder@wireline.com  ";
    expect(isOwnerEmail("founder@wireline.com")).toBe(true);
  });

  it("returns false for a different email (non-owner does not get the dashboard)", () => {
    process.env.OWNER_EMAIL = "founder@wireline.com";
    expect(isOwnerEmail("randomuser@example.com")).toBe(false);
  });

  it("returns false for a same-prefix-different-domain near-miss", () => {
    process.env.OWNER_EMAIL = "founder@wireline.com";
    expect(isOwnerEmail("founder@wireline.co")).toBe(false);
  });

  it("returns false for a null email", () => {
    process.env.OWNER_EMAIL = "founder@wireline.com";
    expect(isOwnerEmail(null)).toBe(false);
  });

  it("returns false for an undefined email", () => {
    process.env.OWNER_EMAIL = "founder@wireline.com";
    expect(isOwnerEmail(undefined)).toBe(false);
  });

  it("returns false for an empty-string email", () => {
    process.env.OWNER_EMAIL = "founder@wireline.com";
    expect(isOwnerEmail("")).toBe(false);
  });

  it("returns false when OWNER_EMAIL is unset — never matches by default", () => {
    delete process.env.OWNER_EMAIL;
    // No owner configured → even a plausible address must NOT be owner.
    expect(isOwnerEmail("founder@wireline.com")).toBe(false);
  });

  it("returns false when OWNER_EMAIL is set to an empty string", () => {
    process.env.OWNER_EMAIL = "";
    expect(isOwnerEmail("founder@wireline.com")).toBe(false);
  });

  it("returns false when OWNER_EMAIL is only whitespace", () => {
    process.env.OWNER_EMAIL = "   ";
    expect(isOwnerEmail("   ")).toBe(false);
  });
});
