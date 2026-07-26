import { describe, expect, it } from "vitest";
import { getPasswordPolicyError } from "../src/lib/password-policy";

describe("getPasswordPolicyError (signup / reset gate)", () => {
  it("returns null for a compliant password", () => {
    expect(getPasswordPolicyError("Abcdefg1")).toBeNull();
  });
  it("rejects passwords shorter than 8 characters", () => {
    expect(getPasswordPolicyError("Abc1")).toBe("Password must be at least 8 characters.");
  });
  it("requires an uppercase letter", () => {
    expect(getPasswordPolicyError("abcdefg1")).toBe(
      "Password must contain at least one uppercase letter.",
    );
  });
  it("requires a lowercase letter", () => {
    expect(getPasswordPolicyError("ABCDEFG1")).toBe(
      "Password must contain at least one lowercase letter.",
    );
  });
  it("requires a number", () => {
    expect(getPasswordPolicyError("Abcdefgh")).toBe("Password must contain at least one number.");
  });
  it("checks length before character-class rules", () => {
    // "Ab1" fails length first even though it also lacks nothing else obvious.
    expect(getPasswordPolicyError("Ab1")).toBe("Password must be at least 8 characters.");
  });
});
