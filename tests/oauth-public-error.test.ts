import { describe, expect, it } from "vitest";
import {
  DEFAULT_OAUTH_SIGNIN_ERROR,
  OAUTH_UNVERIFIED_ACCOUNT_COLLISION,
  sanitizeOAuthSignInError,
} from "../src/lib/oauth-public-error";
import { OAUTH_SIGNUP_CONSENT_REQUIRED } from "../src/lib/legal-consent";

describe("OAuth public error sanitization", () => {
  it("preserves only authored public messages", () => {
    expect(sanitizeOAuthSignInError("Sign-in session expired. Please try again.")).toBe(
      "Sign-in session expired. Please try again.",
    );
    expect(sanitizeOAuthSignInError(OAUTH_SIGNUP_CONSENT_REQUIRED)).toBe(
      OAUTH_SIGNUP_CONSENT_REQUIRED,
    );
  });

  it("preserves the authored account-collision guidance without echoing account details", () => {
    expect(sanitizeOAuthSignInError(OAUTH_UNVERIFIED_ACCOUNT_COLLISION)).toBe(
      OAUTH_UNVERIFIED_ACCOUNT_COLLISION,
    );
    expect(
      sanitizeOAuthSignInError(`${OAUTH_UNVERIFIED_ACCOUNT_COLLISION} owner@example.test`),
    ).toBe(DEFAULT_OAUTH_SIGNIN_ERROR);
  });

  it("redacts database statements and user parameters", () => {
    const raw =
      'Failed query: select "id", "email" from "wireline_users" where "email" = $1 params: user@example.com,1';
    expect(sanitizeOAuthSignInError(raw)).toBe(DEFAULT_OAUTH_SIGNIN_ERROR);
    expect(sanitizeOAuthSignInError(raw)).not.toContain("user@example.com");
    expect(sanitizeOAuthSignInError(raw)).not.toContain("wireline_users");
  });

  it("redacts provider and infrastructure internals", () => {
    expect(sanitizeOAuthSignInError("getaddrinfo ENOTFOUND base")).toBe(DEFAULT_OAUTH_SIGNIN_ERROR);
    expect(sanitizeOAuthSignInError("token exchange failed (401): provider body")).toBe(
      DEFAULT_OAUTH_SIGNIN_ERROR,
    );
    expect(sanitizeOAuthSignInError(null)).toBe(DEFAULT_OAUTH_SIGNIN_ERROR);
  });
});
