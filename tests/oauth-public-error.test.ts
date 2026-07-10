import { describe, expect, it } from "vitest";
import {
  DEFAULT_OAUTH_SIGNIN_ERROR,
  sanitizeOAuthSignInError,
} from "../src/lib/oauth-public-error";

describe("OAuth public error sanitization", () => {
  it("preserves only authored public messages", () => {
    expect(sanitizeOAuthSignInError("Sign-in session expired. Please try again.")).toBe(
      "Sign-in session expired. Please try again.",
    );
  });

  it("redacts database statements and user parameters", () => {
    const raw =
      'Failed query: select "id", "email" from "wireline_users" where "email" = $1 params: user@example.com,1';
    expect(sanitizeOAuthSignInError(raw)).toBe(DEFAULT_OAUTH_SIGNIN_ERROR);
    expect(sanitizeOAuthSignInError(raw)).not.toContain("user@example.com");
    expect(sanitizeOAuthSignInError(raw)).not.toContain("wireline_users");
  });

  it("redacts provider and infrastructure internals", () => {
    expect(sanitizeOAuthSignInError("getaddrinfo ENOTFOUND base")).toBe(
      DEFAULT_OAUTH_SIGNIN_ERROR,
    );
    expect(sanitizeOAuthSignInError("token exchange failed (401): provider body")).toBe(
      DEFAULT_OAUTH_SIGNIN_ERROR,
    );
    expect(sanitizeOAuthSignInError(null)).toBe(DEFAULT_OAUTH_SIGNIN_ERROR);
  });
});
