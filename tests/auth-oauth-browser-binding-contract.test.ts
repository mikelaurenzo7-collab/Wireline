import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  OAUTH_BRIDGE_STATE_MAX_AGE_MS,
  oauthBridgeStateCookieOptions,
} from "../src/lib/oauth-bridge-cookie";
import { generateOAuthState, verifyOAuthState } from "../src/lib/oauth-helpers";
import {
  createBoundOAuthSignInState,
  isBoundOAuthSignInState,
  isOAuthBridgeCode,
  isStoredBridgeStateHashMatch,
  rewriteOAuthCompletionLocation,
} from "../src/routes/auth-oauth-browser-binding";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const originalStateSecret = process.env.OAUTH_STATE_SECRET;
const originalBridgeSecret = process.env.OAUTH_BRIDGE_SECRET;
const testBridgeSecret = "wireline-test-oauth-bridge-secret-at-least-32-bytes";

beforeAll(() => {
  process.env.OAUTH_STATE_SECRET = "wireline-test-oauth-state-secret-at-least-32-bytes";
  process.env.OAUTH_BRIDGE_SECRET = testBridgeSecret;
});

afterAll(() => {
  if (originalStateSecret === undefined) delete process.env.OAUTH_STATE_SECRET;
  else process.env.OAUTH_STATE_SECRET = originalStateSecret;
  if (originalBridgeSecret === undefined) delete process.env.OAUTH_BRIDGE_SECRET;
  else process.env.OAUTH_BRIDGE_SECRET = originalBridgeSecret;
});

describe("auth OAuth browser binding contract", () => {
  it("binds state to both the initiating browser and provider", () => {
    const bridgeState = "browser-session-a";
    const state = createBoundOAuthSignInState("google", bridgeState);

    expect(isBoundOAuthSignInState("google", state, bridgeState)).toBe(true);
    expect(isBoundOAuthSignInState("google", state, "browser-session-b")).toBe(false);
    expect(isBoundOAuthSignInState("microsoft", state, bridgeState)).toBe(false);
    expect(isBoundOAuthSignInState("yahoo", state, bridgeState)).toBe(false);
    expect(isBoundOAuthSignInState("google", state, undefined)).toBe(false);
  });

  it("rejects legacy generic, malformed, and unsigned state values", () => {
    const genericState = generateOAuthState({ userId: "signin" });
    expect(isBoundOAuthSignInState("google", genericState, "browser-session-a")).toBe(false);
    expect(isBoundOAuthSignInState("google", "not-signed", "browser-session-a")).toBe(false);
    expect(isBoundOAuthSignInState("google", undefined, "browser-session-a")).toBe(false);
  });

  it("keeps the raw bridge cookie out of the provider-visible state payload", () => {
    const bridgeState = "raw-bridge-cookie-value";
    const state = createBoundOAuthSignInState("yahoo", bridgeState);
    const verified = verifyOAuthState(state);

    expect(verified.ok).toBe(true);
    expect(verified.userId).toMatch(/^signin:yahoo:[a-f0-9]{64}$/);
    expect(verified.userId).not.toContain(bridgeState);
    expect(state).not.toContain(bridgeState);
  });

  it("accepts only the exact one-time bridge code shape", () => {
    const validCode = "A".repeat(43);
    expect(isOAuthBridgeCode(validCode)).toBe(true);
    expect(isOAuthBridgeCode("A".repeat(42))).toBe(false);
    expect(isOAuthBridgeCode("A".repeat(44))).toBe(false);
    expect(isOAuthBridgeCode(`${"A".repeat(42)}!`)).toBe(false);
    expect(isOAuthBridgeCode(null)).toBe(false);
  });

  it("matches stored bridge hashes without exposing the raw cookie", () => {
    const bridgeState = "browser-session-a";
    const storedHash = createHmac("sha256", testBridgeSecret)
      .update(bridgeState, "utf8")
      .digest("hex");
    expect(isStoredBridgeStateHashMatch(storedHash, bridgeState)).toBe(true);
    expect(isStoredBridgeStateHashMatch(storedHash, "browser-session-b")).toBe(false);
    expect(isStoredBridgeStateHashMatch(null, bridgeState)).toBe(false);
  });

  it("moves internal completion secrets from query strings into fragments", () => {
    const rewritten = new URL(
      rewriteOAuthCompletionLocation(
        "https://trywireline.com/auth/oauth-complete?code=one-time-code&keep=1",
      ),
    );
    expect(rewritten.searchParams.get("keep")).toBe("1");
    expect(rewritten.searchParams.has("code")).toBe(false);
    expect(new URLSearchParams(rewritten.hash.slice(1)).get("code")).toBe("one-time-code");

    expect(rewriteOAuthCompletionLocation("/auth/oauth-complete?error=Sign-in%20failed")).toBe(
      "/auth/oauth-complete#error=Sign-in+failed",
    );
    expect(rewriteOAuthCompletionLocation("https://trywireline.com/pricing?code=public")).toBe(
      "https://trywireline.com/pricing?code=public",
    );
  });

  it("keeps the bridge cookie alive for the full 20-minute signed-state window", () => {
    expect(OAUTH_BRIDGE_STATE_MAX_AGE_MS).toBe(20 * 60 * 1000);
    expect(oauthBridgeStateCookieOptions().maxAge).toBe(OAUTH_BRIDGE_STATE_MAX_AGE_MS);
  });

  it("mounts the binding guard before callbacks and scrubs secrets before exchange", () => {
    const registry = read("src/server/register-api-routes.ts");
    const bindingIndex = registry.indexOf("app.use(authOAuthBrowserBindingRouter)");
    const callbackIndex = registry.indexOf("app.use(authOAuthRouter)");
    expect(bindingIndex).toBeGreaterThan(-1);
    expect(callbackIndex).toBeGreaterThan(bindingIndex);

    const binding = read("src/routes/auth-oauth-browser-binding.ts");
    expect(binding).toContain("verifyOAuthState(state)");
    expect(binding).not.toContain("verifyAndClaimOAuthState(state)");
    expect(binding).toContain("protectOAuthCompletionRedirect(res)");
    expect(binding).toContain("clearOAuthBridgeStateCookie(res)");
    expect(binding).toContain('res.set("Cache-Control", "no-store, max-age=0")');
    expect(binding).toContain("guardOAuthExchangeBrowserBinding");
    expect(binding).toContain("gt(schema.oauthPendingCodes.expiresAt, new Date())");
    expect(binding).toContain("wrong-cookie request must never consume");

    const callbacks = read("src/routes/auth-oauth-routes.ts");
    expect(callbacks.match(/verifyAndClaimOAuthState\(state as string \| undefined\)/g)).toHaveLength(
      3,
    );

    const completion = read("src/pages/OAuthComplete.tsx");
    expect(completion).toContain("useLayoutEffect");
    expect(completion).toContain("window.history.replaceState");
    expect(completion).toContain("readCompletionParams(location.search, location.hash)");
    expect(completion.indexOf("window.history.replaceState")).toBeLessThan(
      completion.indexOf('fetch("/api/auth/oauth/exchange"'),
    );
    expect(completion).toContain('resolvePostAuthDestination(readStoredWorkspaceMode(), "")');
  });
});
