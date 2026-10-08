import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createOAuthBridgeCode,
  isNewUserOAuthBridgeCode,
  isOAuthBridgeCode,
} from "../src/lib/oauth-bridge-code";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("OAuth new-user redirect integrity", () => {
  it("encodes the database-owned signup result into the authenticated one-time code", () => {
    const fresh = createOAuthBridgeCode(true);
    const returning = createOAuthBridgeCode(false);

    expect(isOAuthBridgeCode(fresh)).toBe(true);
    expect(isOAuthBridgeCode(returning)).toBe(true);
    expect(isNewUserOAuthBridgeCode(fresh)).toBe(true);
    expect(isNewUserOAuthBridgeCode(returning)).toBe(false);
    expect(isNewUserOAuthBridgeCode("A".repeat(43))).toBe(false);
  });

  it("uses the exchange result instead of the OAuth button that initiated the flow", () => {
    const access = read("src/components/auth/AuthAccessPanel.tsx");
    const completion = read("src/pages/OAuthComplete.tsx");
    const atomicExchange = read("src/routes/auth-oauth-exchange-atomic-routes.ts");

    expect(access).toContain("clearFreshSignupSession();");
    expect(access).not.toContain("if (isSignUp) markFreshSignupSession();");
    expect(completion).toContain("if (data.is_new_user === true) markFreshSignupSession();");
    expect(completion).toContain("clearFreshSignupSession();");
    expect(atomicExchange).toContain("is_new_user: isNewUserOAuthBridgeCode(code)");
  });

  it("sends a new provider user without Terms consent to sign up, not back to sign in", () => {
    const completion = read("src/pages/OAuthComplete.tsx");
    expect(completion).toContain("const needsSignup = error === OAUTH_SIGNUP_CONSENT_REQUIRED;");
    expect(completion).toContain('"Finish Creating Your Account"');
    expect(completion).toMatch(/needsSignup \? \([\s\S]*?to="\/signup"[\s\S]*?Create Account/);
  });
});
