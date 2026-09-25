import { afterEach, describe, expect, it, vi } from "vitest";

import {
  envPublicRuntimeOrigin,
  getCanonicalAppUrl,
  getPublicRuntimeOrigin,
  parsePublicOrigin,
  resolveCanonicalAppUrl,
} from "./app-url";

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

  it("keeps production APP_URL on botbound.me while Render dogfood OAuth stays env-driven", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("PUBLIC_URL", "");
    vi.stubEnv("APP_URL", "https://botbound.me");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://botbound-api.onrender.com");
    vi.stubEnv("WIRELINE_DEPLOYMENT_ENVIRONMENT", "production");
    vi.stubEnv("IS_PULL_REQUEST", "false");

    expect(getCanonicalAppUrl()).toBe("https://botbound.me");
    expect(envPublicRuntimeOrigin()).toBe("https://botbound-api.onrender.com");
    const spoofed = {
      get: (name: string) =>
        name === "x-forwarded-host" || name === "host" ? "botbound.me" : undefined,
    };
    const adjacent = {
      get: (name: string) => (name === "host" ? "botbound-api-pr-99.onrender.com" : undefined),
    };
    expect(getPublicRuntimeOrigin({ get: () => "botbound-api.onrender.com" })).toBe(
      "https://botbound-api.onrender.com",
    );
    expect(getPublicRuntimeOrigin(spoofed)).toBe("https://botbound-api.onrender.com");
    expect(getPublicRuntimeOrigin(adjacent)).toBe("https://botbound-api.onrender.com");
    expect(
      getPublicRuntimeOrigin({
        get: (name: string) => (name === "host" ? "evil.example" : undefined),
      }),
    ).toBe("https://botbound-api.onrender.com");
    expect(getPublicRuntimeOrigin()).toBe("https://botbound-api.onrender.com");
  });

  it("lets PUBLIC_URL pin Render OAuth to botbound.me after DNS cutover", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("APP_URL", "https://botbound.me");
    vi.stubEnv("PUBLIC_URL", "https://botbound.me");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://botbound-api.onrender.com");
    vi.stubEnv("WIRELINE_DEPLOYMENT_ENVIRONMENT", "production");
    vi.stubEnv("IS_PULL_REQUEST", "false");

    expect(getPublicRuntimeOrigin()).toBe("https://botbound.me");
    expect(getCanonicalAppUrl()).toBe("https://botbound.me");
  });

  it("never mints a Render hostname on Vercel production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "https://botbound.me");
    vi.stubEnv("PUBLIC_URL", "https://botbound-api.onrender.com");
    vi.stubEnv("RENDER", "");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://botbound-api.onrender.com");

    expect(envPublicRuntimeOrigin()).toBe("");
    expect(
      getPublicRuntimeOrigin({
        get: (name: string) => (name === "host" ? "botbound-api.onrender.com" : undefined),
      }),
    ).toBe("https://botbound.me");
    expect(getPublicRuntimeOrigin()).toBe("https://botbound.me");
  });

  it("ignores Render metadata when Vercel and Render env are both present", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "https://botbound.me");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://botbound-api.onrender.com");
    vi.stubEnv("PUBLIC_URL", "https://botbound-api.onrender.com");

    expect(getPublicRuntimeOrigin()).toBe("https://botbound.me");
  });

  it("rejects PUBLIC_URL values that are not bare origins", () => {
    expect(parsePublicOrigin("https://botbound-api.onrender.com/callback")).toBe("");
    expect(parsePublicOrigin("https://user:pass@botbound.me")).toBe("");
    expect(parsePublicOrigin("http://botbound-api.onrender.com")).toBe("");
    expect(parsePublicOrigin("https://botbound-api.onrender.com")).toBe(
      "https://botbound-api.onrender.com",
    );
    expect(parsePublicOrigin("http://localhost:3000", true)).toBe("http://localhost:3000");
  });
});
