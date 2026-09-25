import { afterEach, describe, expect, it, vi } from "vitest";

import { getCanonicalAppUrl, resolveCanonicalAppUrl } from "./app-url";

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

  it.each([
    "https://trywireline.com",
    "https://botbound.me",
    "https://botbound.app.evil.example",
    "https://www.botbound.app",
  ])("rejects noncanonical production origin %s before emitting links", (origin) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", origin);

    expect(() => getCanonicalAppUrl()).toThrow(
      "APP_URL must be exactly https://botbound.app in production",
    );
    expect(resolveCanonicalAppUrl()).toEqual({ error: "APP_URL_NOT_CANONICAL" });
  });

  it("uses the new public origin on Render production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("IS_PULL_REQUEST", "false");
    vi.stubEnv("WIRELINE_DEPLOYMENT_ENVIRONMENT", "production");
    vi.stubEnv("APP_URL", "https://botbound.app");
    expect(getCanonicalAppUrl()).toBe("https://botbound.app");
    vi.stubEnv("APP_URL", "https://botbound.me");
    expect(resolveCanonicalAppUrl()).toEqual({ error: "APP_URL_NOT_CANONICAL" });
  });

  it("accepts BotBound in production and request-specific hosts in preview", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "https://botbound.app");
    expect(getCanonicalAppUrl()).toBe("https://botbound.app");

    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "botbound-preview.vercel.app");
    expect(getCanonicalAppUrl()).toBe("https://botbound-preview.vercel.app");
  });
});
