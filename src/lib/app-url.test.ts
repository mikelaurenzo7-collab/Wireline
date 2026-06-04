import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCanonicalAppUrl, resolveCanonicalAppUrl } from "./app-url";

describe("app-url", () => {
  const prevAppUrl = process.env.APP_URL;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL;

  beforeEach(() => {
    delete process.env.APP_URL;
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL;
  });

  afterEach(() => {
    process.env.APP_URL = prevAppUrl;
    process.env.NODE_ENV = prevNodeEnv;
    process.env.VERCEL = prevVercel;
  });

  it("uses APP_URL when set", () => {
    process.env.APP_URL = "https://app.wireline.test/";
    expect(getCanonicalAppUrl()).toBe("https://app.wireline.test");
    expect(resolveCanonicalAppUrl()).toEqual({ url: "https://app.wireline.test" });
  });

  it("falls back to localhost in non-production when APP_URL is unset", () => {
    expect(getCanonicalAppUrl()).toBe("http://localhost:3000");
  });

  it("requires APP_URL in production runtime", () => {
    process.env.NODE_ENV = "production";
    expect(() => getCanonicalAppUrl()).toThrow(/APP_URL is required/);
    expect(resolveCanonicalAppUrl()).toEqual({ error: "APP_URL_NOT_CONFIGURED" });
  });
});
