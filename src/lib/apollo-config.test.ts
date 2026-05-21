import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("apollo configuration helpers", () => {
  const ENV = process.env;

  beforeEach(() => {
    process.env = { ...ENV };
    delete process.env.APOLLO_API_KEY;
    delete process.env.APOLLO_CLIENT_ID;
    delete process.env.APOLLO_CLIENT_SECRET;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = ENV;
  });

  it("apolloPlatformConfigured is true with API key only", async () => {
    process.env.APOLLO_API_KEY = "key";
    const { apolloPlatformConfigured, apolloOAuthConfigured } = await import("./apollo-service");
    expect(apolloPlatformConfigured()).toBe(true);
    expect(apolloOAuthConfigured()).toBe(false);
  });

  it("apolloOAuthConfigured is true with client id and secret", async () => {
    process.env.APOLLO_CLIENT_ID = "id";
    process.env.APOLLO_CLIENT_SECRET = "secret";
    const { apolloPlatformConfigured, apolloOAuthConfigured } = await import("./apollo-service");
    expect(apolloPlatformConfigured()).toBe(true);
    expect(apolloOAuthConfigured()).toBe(true);
  });
});
