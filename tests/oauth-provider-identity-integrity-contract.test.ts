import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveGoogleAuthoritativeEmail } from "../src/lib/oauth-email-trust";
import { verifyOAuthState } from "../src/lib/oauth-helpers";
import { createBoundOAuthSignInState } from "../src/routes/auth-oauth-browser-binding";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const originalStateSecret = process.env.OAUTH_STATE_SECRET;
const originalBridgeSecret = process.env.OAUTH_BRIDGE_SECRET;

beforeAll(() => {
  process.env.OAUTH_STATE_SECRET = "wireline-provider-integrity-state-secret-at-least-32-bytes";
  process.env.OAUTH_BRIDGE_SECRET = "wireline-provider-integrity-bridge-secret-at-least-32-bytes";
});

afterAll(() => {
  if (originalStateSecret === undefined) delete process.env.OAUTH_STATE_SECRET;
  else process.env.OAUTH_STATE_SECRET = originalStateSecret;
  if (originalBridgeSecret === undefined) delete process.env.OAUTH_BRIDGE_SECRET;
  else process.env.OAUTH_BRIDGE_SECRET = originalBridgeSecret;
});

describe("OAuth provider identity integrity", () => {
  it("accepts only Google-authoritative verified mailboxes", () => {
    expect(
      resolveGoogleAuthoritativeEmail({
        email: "Founder@Gmail.com",
        verifiedEmail: true,
      }),
    ).toBe("founder@gmail.com");
    expect(
      resolveGoogleAuthoritativeEmail({
        email: "founder@business.example",
        verifiedEmail: true,
        hostedDomain: "business.example",
      }),
    ).toBe("founder@business.example");
    expect(
      resolveGoogleAuthoritativeEmail({
        email: "victim@third-party.example",
        verifiedEmail: true,
      }),
    ).toBeNull();
    expect(
      resolveGoogleAuthoritativeEmail({
        email: "founder@gmail.com",
        verifiedEmail: false,
      }),
    ).toBeNull();
  });

  it("carries Yahoo's nonce inside signed, browser-bound OAuth state", () => {
    const state = createBoundOAuthSignInState(
      "yahoo",
      "browser-binding-value",
      "provider-nonce-value",
    );
    const verified = verifyOAuthState(state);
    expect(verified.ok).toBe(true);
    expect(verified.userId).toMatch(/^signin:yahoo:[a-f0-9]{64}$/);
    expect(verified.pkceVerifier).toBe("provider-nonce-value");
    expect(state).not.toContain("browser-binding-value");
  });

  it("verifies Yahoo identity before sign-in or mailbox attachment", () => {
    const binding = read("src/routes/auth-oauth-browser-binding.ts");
    const signIn = read("src/routes/auth-oauth-routes.ts");
    const mailbox = read("src/routes/oauth/yahoo.ts");

    expect(binding).toContain('provider === "yahoo" ? createYahooOidcNonce() : undefined');
    expect(binding).toContain('authorizationUrl.searchParams.set("nonce", oidcNonce)');
    expect(binding).toContain("createBoundOAuthSignInState(provider, bridgeState, oidcNonce)");

    expect(signIn).toContain("verifyYahooIdToken(tokenJson.id_token");
    expect(signIn).toContain("nonce: vs.pkceVerifier");
    expect(signIn).not.toContain('fetch("https://api.login.yahoo.com/openid/v1/userinfo"');

    expect(mailbox).toContain("const nonce = createYahooOidcNonce()");
    expect(mailbox).toContain("pkceVerifier: nonce");
    expect(mailbox).toContain("verifyYahooIdToken(tokens.id_token");
    expect(mailbox).toContain('res.set("Cache-Control", "no-store, max-age=0")');
    expect(mailbox).not.toContain('fetch("https://api.login.yahoo.com/openid/v1/userinfo"');
  });

  it("creates OAuth users and activation state atomically under email conflicts", () => {
    const signIn = read("src/routes/auth-oauth-routes.ts");
    expect(signIn).toContain("return drizzle.transaction(async (tx) =>");
    expect(signIn).toContain(".onConflictDoNothing({ target: schema.users.email })");
    expect(signIn).toContain("await startTrialForUser(created.id, {}, tx)");
    expect(signIn).toContain("emailVerifiedAt: verifiedAt");
    expect(signIn).toContain("OAuth user conflict could not be resolved.");
  });
});
