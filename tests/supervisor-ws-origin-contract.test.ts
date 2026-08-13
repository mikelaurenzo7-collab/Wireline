import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAllowedBrowserOrigin, selfOriginFromHeaders } from "../src/middleware/same-origin";

/**
 * The supervisor WebSocket upgrade accepts cookie credentials, so it must gate
 * the browser Origin the same way assertSameOrigin gates HTTP mutations:
 *   - a cross-site Origin is rejected (cross-site WebSocket hijacking), but
 *   - a genuinely same-origin request from a deployment alias not listed in
 *     APP_URL/CORS_ORIGINS (Origin === the request's own forwarded host) still
 *     connects, because the static allowlist can't know that host ahead of time.
 */
describe("supervisor WebSocket origin gate", () => {
  const priorAppUrl = process.env.APP_URL;
  const priorCors = process.env.CORS_ORIGINS;
  const priorNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.APP_URL = "https://app.trywireline.com";
    process.env.CORS_ORIGINS = "";
    process.env.NODE_ENV = "production";
  });
  afterEach(() => {
    process.env.APP_URL = priorAppUrl;
    process.env.CORS_ORIGINS = priorCors;
    process.env.NODE_ENV = priorNodeEnv;
  });

  it("derives the request self-origin from forwarded headers", () => {
    expect(
      selfOriginFromHeaders({
        "x-forwarded-host": "staging.internal.example",
        "x-forwarded-proto": "https",
      }),
    ).toBe("https://staging.internal.example");
    // Falls back to Host and the provided protocol default.
    expect(selfOriginFromHeaders({ host: "box.local:3000" }, "http")).toBe("http://box.local:3000");
    // Array-valued headers (proxied) take the first entry.
    expect(selfOriginFromHeaders({ "x-forwarded-host": ["a.example", "b.example"] })).toBe(
      "https://a.example",
    );
    expect(selfOriginFromHeaders({})).toBeNull();
  });

  it("allows a missing origin and the static allowlist", () => {
    expect(isAllowedBrowserOrigin(undefined)).toBe(true);
    expect(isAllowedBrowserOrigin("https://app.trywireline.com")).toBe(true);
    // Trailing slash normalized.
    expect(isAllowedBrowserOrigin("https://app.trywireline.com/")).toBe(true);
  });

  it("allows a same-origin request whose host is not on the static allowlist", () => {
    const selfOrigin = selfOriginFromHeaders({ "x-forwarded-host": "deploy-alias.example" });
    expect(isAllowedBrowserOrigin("https://deploy-alias.example", selfOrigin)).toBe(true);
  });

  it("rejects a cross-site origin even when a self-origin is present", () => {
    const selfOrigin = selfOriginFromHeaders({ "x-forwarded-host": "deploy-alias.example" });
    expect(isAllowedBrowserOrigin("https://evil.example", selfOrigin)).toBe(false);
    // And with no self-origin, only the static allowlist applies.
    expect(isAllowedBrowserOrigin("https://evil.example")).toBe(false);
  });

  it("keeps the supervisor upgrade wired to the shared origin gate", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/services/supervisor-websocket-service.ts", "utf8");
    expect(source).toContain(
      "isAllowedBrowserOrigin(origin, selfOriginFromHeaders(request.headers))",
    );
  });
});
