import { describe, expect, it } from "vitest";
import { getInternalJwtSecret, requireInternalJwtSecret } from "./internal-jwt-secret";

// These helpers resolve the canonical session-signing secret. They take an
// explicit env object, so we exercise them without touching process.env.
// The conflict-detection branch is a security guard: two differing secrets
// must hard-error rather than silently picking one.

describe("getInternalJwtSecret", () => {
  it("prefers INTERNAL_JWT_SECRET", () => {
    expect(getInternalJwtSecret({ INTERNAL_JWT_SECRET: "canonical" })).toBe("canonical");
  });

  it("falls back to the legacy SUPABASE_JWT_SECRET", () => {
    expect(getInternalJwtSecret({ SUPABASE_JWT_SECRET: "legacy" })).toBe("legacy");
  });

  it("returns undefined when neither is set", () => {
    expect(getInternalJwtSecret({})).toBeUndefined();
  });

  it("accepts both when they are identical", () => {
    expect(getInternalJwtSecret({ INTERNAL_JWT_SECRET: "same", SUPABASE_JWT_SECRET: "same" })).toBe(
      "same",
    );
  });

  it("throws JWT_SECRET_CONFLICT when both are set but differ", () => {
    expect(() =>
      getInternalJwtSecret({ INTERNAL_JWT_SECRET: "a", SUPABASE_JWT_SECRET: "b" }),
    ).toThrow(/JWT_SECRET_CONFLICT/);
  });
});

describe("requireInternalJwtSecret", () => {
  it("returns the secret when configured", () => {
    expect(requireInternalJwtSecret({ INTERNAL_JWT_SECRET: "present" })).toBe("present");
  });

  it("throws JWT_SECRET_NOT_CONFIGURED when missing", () => {
    expect(() => requireInternalJwtSecret({})).toThrow(/JWT_SECRET_NOT_CONFIGURED/);
  });

  it("propagates the conflict error", () => {
    expect(() =>
      requireInternalJwtSecret({ INTERNAL_JWT_SECRET: "a", SUPABASE_JWT_SECRET: "b" }),
    ).toThrow(/JWT_SECRET_CONFLICT/);
  });
});
