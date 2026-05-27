import { describe, expect, it } from "vitest";
import { getPasswordPolicyError } from "./password-policy";

describe("password policy", () => {
  it("matches the account password requirements used by auth forms", () => {
    expect(getPasswordPolicyError("short1A")).toMatch(/at least 8/);
    expect(getPasswordPolicyError("password1")).toMatch(/uppercase/);
    expect(getPasswordPolicyError("PASSWORD1")).toMatch(/lowercase/);
    expect(getPasswordPolicyError("Password")).toMatch(/number/);
    expect(getPasswordPolicyError("Password1")).toBeNull();
  });
});
