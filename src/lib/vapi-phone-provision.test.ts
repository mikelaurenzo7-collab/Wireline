import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolvePublicBaseUrl } from "./vapi-phone-provision";

describe("resolvePublicBaseUrl", () => {
  const orig = { ...process.env };

  beforeEach(() => {
    delete process.env.APP_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    process.env.APP_URL = orig.APP_URL;
    process.env.VERCEL_URL = orig.VERCEL_URL;
  });

  it("prefers APP_URL and strips trailing slashes", () => {
    process.env.APP_URL = "https://example.com/";
    expect(resolvePublicBaseUrl()).toBe("https://example.com");
  });

  it("derives https URL from VERCEL_URL host", () => {
    process.env.VERCEL_URL = "my-app.vercel.app";
    expect(resolvePublicBaseUrl()).toBe("https://my-app.vercel.app");
  });

  it("returns null when neither is set", () => {
    expect(resolvePublicBaseUrl()).toBeNull();
  });
});
