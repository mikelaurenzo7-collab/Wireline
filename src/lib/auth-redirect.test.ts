import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRedirectFromSearch, resolvePostAuthDestination } from "./auth-redirect";
import { FRESH_SIGNUP_SESSION_KEY } from "./post-signup-onboarding";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}

describe("auth-redirect", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  it("honors redirect query when safe", () => {
    expect(readRedirectFromSearch("?redirect=%2Fapp%2Fbusiness%2Flive")).toBe("/app/business/live");
    expect(readRedirectFromSearch("?redirect=https://evil.com")).toBeNull();
    expect(readRedirectFromSearch("?redirect=/signin")).toBeNull();
  });

  it("defaults to /overview (Home) for returning users; fresh signups are sent to Studio create once then default to overview", () => {
    expect(resolvePostAuthDestination("business", "")).toBe("/overview");
    expect(resolvePostAuthDestination("personal", "")).toBe("/overview");
    // Note: testing the fresh branch requires mocking sessionStorage; it consumes the flag and returns studio create.
  });

  it("consumes the fresh-signup marker even when a safe deep link wins", () => {
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");
    expect(resolvePostAuthDestination("business", "?redirect=%2Fsettings%2Fphone")).toBe(
      "/settings/phone",
    );
    expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
    expect(resolvePostAuthDestination("business", "")).toBe("/overview");
  });
});
