import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateOAuthState, verifyOAuthState } from "./oauth-helpers";
import { xOAuthConfigured, generatePkcePair, getXAuthUrl } from "./x-service";

describe("x-service OAuth helpers", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = {
      ...env,
      X_CLIENT_ID: "test-client-id",
      X_CLIENT_SECRET: "test-secret",
      OAUTH_STATE_SECRET: "wireline-test-oauth-state-secret-at-least-32-bytes",
    };
  });

  afterEach(() => {
    process.env = env;
  });

  it("xOAuthConfigured is true when client id and secret are set", () => {
    expect(xOAuthConfigured()).toBe(true);
  });

  it("xOAuthConfigured is false when credentials are missing", () => {
    delete process.env.X_CLIENT_ID;
    expect(xOAuthConfigured()).toBe(false);
  });

  it("generatePkcePair returns verifier and S256 challenge", () => {
    const { verifier, challenge } = generatePkcePair();
    expect(verifier.length).toBeGreaterThan(20);
    expect(challenge.length).toBeGreaterThan(20);
    expect(verifier).not.toBe(challenge);
  });

  it("getXAuthUrl includes PKCE and OAuth 2.0 params", () => {
    const url = new URL(
      getXAuthUrl("https://trywireline.com/api/oauth/x/callback", "signed-state", "challenge123"),
    );
    expect(url.origin).toBe("https://twitter.com");
    expect(url.pathname).toBe("/i/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://trywireline.com/api/oauth/x/callback",
    );
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("code_challenge")).toBe("challenge123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("tweet.write");
    expect(url.searchParams.get("scope")).toContain("dm.write");
    expect(url.searchParams.get("scope")).toContain("like.write");
  });

  it("OAuth state round-trips userId and PKCE verifier", () => {
    const { verifier } = generatePkcePair();
    const state = generateOAuthState({ userId: "user-abc", pkceVerifier: verifier });
    const vs = verifyOAuthState(state);
    expect(vs.ok).toBe(true);
    expect(vs.userId).toBe("user-abc");
    expect(vs.pkceVerifier).toBe(verifier);
  });
});
