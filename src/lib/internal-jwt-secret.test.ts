import { describe, expect, it } from "vitest";
import { getInternalJwtSecret, requireInternalJwtSecret } from "./internal-jwt-secret";

describe("internal JWT secret resolution", () => {
  it("uses INTERNAL_JWT_SECRET as the canonical session secret", () => {
    expect(getInternalJwtSecret({ INTERNAL_JWT_SECRET: "canonical-secret" })).toBe(
      "canonical-secret",
    );
  });

  it("keeps SUPABASE_JWT_SECRET as a legacy alias", () => {
    expect(getInternalJwtSecret({ SUPABASE_JWT_SECRET: "legacy-secret" })).toBe("legacy-secret");
  });

  it("allows both names during cleanup when they match exactly", () => {
    expect(
      getInternalJwtSecret({
        INTERNAL_JWT_SECRET: "same-secret",
        SUPABASE_JWT_SECRET: "same-secret",
      }),
    ).toBe("same-secret");
  });

  it("rejects split-brain secrets", () => {
    expect(() =>
      getInternalJwtSecret({
        INTERNAL_JWT_SECRET: "canonical-secret",
        SUPABASE_JWT_SECRET: "different-legacy-secret",
      }),
    ).toThrow(/JWT_SECRET_CONFLICT/);
  });

  it("throws a clear error when no session secret is configured", () => {
    expect(() => requireInternalJwtSecret({})).toThrow(/JWT_SECRET_NOT_CONFIGURED/);
  });
});
