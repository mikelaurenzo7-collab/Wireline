import { describe, expect, it, vi } from "vitest";

describe("auth-provider", () => {
  it("defaults to Wireline native auth when VITE_AUTH_PROVIDER is unset", async () => {
    vi.stubEnv("VITE_AUTH_PROVIDER", "");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    const { isClerkAuthEnabled, isWirelineNativeAuthEnabled } = await import("./auth-provider");
    expect(isClerkAuthEnabled()).toBe(false);
    expect(isWirelineNativeAuthEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("enables Clerk only when VITE_AUTH_PROVIDER=clerk and publishable key is set", async () => {
    vi.stubEnv("VITE_AUTH_PROVIDER", "clerk");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    const { isClerkAuthEnabled } = await import("./auth-provider");
    expect(isClerkAuthEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });
});
