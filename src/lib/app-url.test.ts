import { afterEach, describe, expect, it, vi } from "vitest";

import { getCanonicalAppUrl, getPublicRuntimeOrigin, resolveCanonicalAppUrl } from "./app-url";

describe("canonical app URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed when production is missing its public origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "");

    expect(() => getCanonicalAppUrl()).toThrow("APP_URL is required in production");
    expect(resolveCanonicalAppUrl()).toEqual({ error: "APP_URL_NOT_CONFIGURED" });
  });

  it("rejects a noncanonical production origin before emitting links", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "https://trywireline.com");

    expect(() => getCanonicalAppUrl()).toThrow(
      "APP_URL must be exactly https://botbound.me in production",
    );
    expect(resolveCanonicalAppUrl()).toEqual({ error: "APP_URL_NOT_CANONICAL" });
  });

  it("accepts BotBound in production and request-specific hosts in preview", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "https://botbound.me");
    expect(getCanonicalAppUrl()).toBe("https://botbound.me");

    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "botbound-preview.vercel.app");
    expect(getCanonicalAppUrl()).toBe("https://botbound-preview.vercel.app");
  });

  it("keeps production APP_URL on botbound.me while Render dogfood OAuth stays on-host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("APP_URL", "https://botbound.me");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://botbound-api.onrender.com");
    vi.stubEnv("WIRELINE_DEPLOYMENT_ENVIRONMENT", "production");
    vi.stubEnv("IS_PULL_REQUEST", "false");

    expect(getCanonicalAppUrl()).toBe("https://botbound.me");
    expect(
      getPublicRuntimeOrigin({
        get: (name: string) => (name === "host" ? "botbound-api.onrender.com" : undefined),
      }),
    ).toBe("https://botbound-api.onrender.com");
    expect(
      getPublicRuntimeOrigin({
        get: (name: string) => (name === "host" ? "botbound.me" : undefined),
      }),
    ).toBe("https://botbound.me");
    expect(
      getPublicRuntimeOrigin({
        get: (name: string) => (name === "host" ? "evil.example" : undefined),
      }),
    ).toBe("https://botbound.me");
  });
});
