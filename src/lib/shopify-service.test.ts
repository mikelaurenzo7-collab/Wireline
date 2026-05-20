// @vitest-environment node
//
// Shopify service unit tests — cover the security-critical pure
// functions: the shop-domain validation regex (open-redirect / SSRF
// guard), the OAuth install-URL builder, and the OAuth-callback HMAC
// verification.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  shopifyOAuthConfigured,
  normalizeShopDomain,
  getShopifyAuthUrl,
  verifyShopifyHmac,
} from "./shopify-service";

const ENV_KEYS = ["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
}
function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

describe("normalizeShopDomain — open-redirect / SSRF guard", () => {
  it("accepts a valid myshopify domain and lowercases it", () => {
    expect(normalizeShopDomain("My-Store.myshopify.com")).toBe("my-store.myshopify.com");
  });

  it("accepts a domain with digits and hyphens", () => {
    expect(normalizeShopDomain("acme-store-99.myshopify.com")).toBe("acme-store-99.myshopify.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeShopDomain("  store.myshopify.com  ")).toBe("store.myshopify.com");
  });

  it("rejects a non-myshopify host", () => {
    expect(normalizeShopDomain("evil.com")).toBeNull();
  });

  it("rejects a host that only ends with myshopify.com via a different TLD trick", () => {
    expect(normalizeShopDomain("store.myshopify.com.evil.com")).toBeNull();
  });

  it("rejects a subdomain-prefixed attacker host", () => {
    expect(normalizeShopDomain("store.myshopify.com.attacker.io")).toBeNull();
  });

  it("rejects an embedded-path attempt", () => {
    expect(normalizeShopDomain("store.myshopify.com/../admin")).toBeNull();
  });

  it("rejects a full URL (must be a bare domain)", () => {
    expect(normalizeShopDomain("https://store.myshopify.com")).toBeNull();
  });

  it("rejects a domain starting with a hyphen", () => {
    expect(normalizeShopDomain("-store.myshopify.com")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(normalizeShopDomain("")).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(normalizeShopDomain(undefined)).toBeNull();
    expect(normalizeShopDomain(null)).toBeNull();
    expect(normalizeShopDomain(12345)).toBeNull();
  });
});

describe("getShopifyAuthUrl", () => {
  let envSnap: Record<string, string | undefined>;
  beforeEach(() => {
    envSnap = snapshotEnv();
    process.env.SHOPIFY_CLIENT_ID = "test-client-id";
  });
  afterEach(() => restoreEnv(envSnap));

  it("builds the per-store authorize URL with all required params", () => {
    const url = getShopifyAuthUrl(
      "demo-shop.myshopify.com",
      "https://trywireline.com/api/oauth/shopify/callback",
      "state-token-abc",
    );
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://demo-shop.myshopify.com");
    expect(parsed.pathname).toBe("/admin/oauth/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://trywireline.com/api/oauth/shopify/callback",
    );
    expect(parsed.searchParams.get("state")).toBe("state-token-abc");
    expect(parsed.searchParams.get("scope")).toContain("read_orders");
  });

  it("requests the scopes needed for order/return/inventory actions", () => {
    const url = getShopifyAuthUrl("s.myshopify.com", "https://x/cb", "st");
    const scope = new URL(url).searchParams.get("scope") || "";
    for (const s of [
      "read_orders",
      "write_orders",
      "read_products",
      "read_returns",
      "read_inventory",
    ]) {
      expect(scope).toContain(s);
    }
  });

  it("normalizes the shop domain into the URL host (lowercased)", () => {
    const url = getShopifyAuthUrl("UPPER-Shop.myshopify.com", "https://x/cb", "st");
    expect(new URL(url).host).toBe("upper-shop.myshopify.com");
  });

  it("throws on an invalid shop domain — never builds a URL to an attacker host", () => {
    expect(() => getShopifyAuthUrl("evil.com", "https://x/cb", "st")).toThrow();
    expect(() => getShopifyAuthUrl("store.myshopify.com.evil.com", "https://x/cb", "st")).toThrow();
  });
});

describe("verifyShopifyHmac — OAuth callback signature check", () => {
  const SECRET = "shpss_test_secret_value";

  // Helper: compute the HMAC the way Shopify does (sorted params,
  // key=value joined by &, minus the hmac key itself).
  function signQuery(params: Record<string, string>): string {
    const message = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    return createHmac("sha256", SECRET).update(message).digest("hex");
  }

  it("accepts a correctly signed query", () => {
    const params = {
      code: "auth-code-123",
      shop: "demo.myshopify.com",
      state: "nonce-xyz",
      timestamp: "1700000000",
    };
    const hmac = signQuery(params);
    expect(verifyShopifyHmac({ ...params, hmac }, SECRET)).toBe(true);
  });

  it("rejects a query whose params were tampered with after signing", () => {
    const params = {
      code: "auth-code-123",
      shop: "demo.myshopify.com",
      state: "nonce-xyz",
      timestamp: "1700000000",
    };
    const hmac = signQuery(params);
    // Attacker swaps the shop but keeps the original signature.
    expect(verifyShopifyHmac({ ...params, shop: "attacker.myshopify.com", hmac }, SECRET)).toBe(
      false,
    );
  });

  it("rejects when the hmac param is missing", () => {
    expect(verifyShopifyHmac({ code: "c", shop: "s.myshopify.com" }, SECRET)).toBe(false);
  });

  it("rejects when the hmac is signed with the wrong secret", () => {
    const params = { code: "c", shop: "demo.myshopify.com", timestamp: "1700000000" };
    const wrongHmac = createHmac("sha256", "wrong-secret")
      .update(
        Object.keys(params)
          .sort()
          .map((k) => `${k}=${(params as Record<string, string>)[k]}`)
          .join("&"),
      )
      .digest("hex");
    expect(verifyShopifyHmac({ ...params, hmac: wrongHmac }, SECRET)).toBe(false);
  });

  it("rejects when the client secret is empty", () => {
    const params = { code: "c", shop: "demo.myshopify.com" };
    const hmac = signQuery(params);
    expect(verifyShopifyHmac({ ...params, hmac }, "")).toBe(false);
  });

  it("excludes the `signature` param from the signed message (Shopify spec)", () => {
    // Shopify excludes both `hmac` AND `signature` from the digest.
    const params = {
      code: "auth-code-123",
      shop: "demo.myshopify.com",
      timestamp: "1700000000",
    };
    const hmac = signQuery(params);
    // Adding a `signature` param must NOT change verification outcome.
    expect(verifyShopifyHmac({ ...params, signature: "ignored", hmac }, SECRET)).toBe(true);
  });

  it("does not throw on a malformed-length hmac (constant-time guard)", () => {
    expect(() =>
      verifyShopifyHmac({ code: "c", shop: "s.myshopify.com", hmac: "short" }, SECRET),
    ).not.toThrow();
    expect(verifyShopifyHmac({ code: "c", shop: "s.myshopify.com", hmac: "short" }, SECRET)).toBe(
      false,
    );
  });
});

describe("shopifyOAuthConfigured", () => {
  let envSnap: Record<string, string | undefined>;
  beforeEach(() => {
    envSnap = snapshotEnv();
  });
  afterEach(() => restoreEnv(envSnap));

  it("is true when both client id and secret are set", () => {
    process.env.SHOPIFY_CLIENT_ID = "id";
    process.env.SHOPIFY_CLIENT_SECRET = "secret";
    expect(shopifyOAuthConfigured()).toBe(true);
  });

  it("is false when the client id is missing", () => {
    delete process.env.SHOPIFY_CLIENT_ID;
    process.env.SHOPIFY_CLIENT_SECRET = "secret";
    expect(shopifyOAuthConfigured()).toBe(false);
  });

  it("is false when the client secret is missing", () => {
    process.env.SHOPIFY_CLIENT_ID = "id";
    delete process.env.SHOPIFY_CLIENT_SECRET;
    expect(shopifyOAuthConfigured()).toBe(false);
  });
});
