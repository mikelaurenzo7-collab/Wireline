import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_REDIRECT_KEY,
  readRedirectFromSearch,
  resolvePostAuthDestination,
} from "./auth-redirect";
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
    const localStorage = memoryStorage();
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("sessionStorage", memoryStorage());
    vi.stubGlobal("window", { localStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("honors redirect query when safe", () => {
    expect(readRedirectFromSearch("?redirect=%2Fapp%2Fbusiness%2Flive")).toBe("/app/business/live");
    expect(readRedirectFromSearch("?redirect=https://evil.com")).toBeNull();
    expect(readRedirectFromSearch("?redirect=/signin")).toBeNull();
  });

  it("defaults to /overview (Home) for returning users; fresh signups are sent to Studio create once then default to overview", () => {
    expect(resolvePostAuthDestination("business", "")).toBe("/overview");
    expect(resolvePostAuthDestination("personal", "")).toBe("/overview");
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");
    expect(resolvePostAuthDestination("personal", "")).toBe("/studio?create=1");
    expect(resolvePostAuthDestination("personal", "")).toBe("/overview");
  });

  it("ignores a stale sign-in redirect when a direct personal signup completes", () => {
    localStorage.setItem(AUTH_REDIRECT_KEY, "/settings");
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    expect(resolvePostAuthDestination("personal", "")).toBe("/studio?create=1");
    expect(localStorage.getItem(AUTH_REDIRECT_KEY)).toBeNull();
    expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
  });

  it("honors an explicit safe signup redirect and consumes stale redirect state", () => {
    localStorage.setItem(AUTH_REDIRECT_KEY, "/settings");
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    expect(resolvePostAuthDestination("business", "?redirect=%2Fsettings%2Fphone")).toBe(
      "/settings/phone",
    );
    expect(localStorage.getItem(AUTH_REDIRECT_KEY)).toBeNull();
    expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
    expect(resolvePostAuthDestination("business", "")).toBe("/overview");
  });

  it("preserves stored redirect behavior for sign-in sessions", () => {
    localStorage.setItem(AUTH_REDIRECT_KEY, "/settings");

    expect(resolvePostAuthDestination("personal", "")).toBe("/settings");
    expect(localStorage.getItem(AUTH_REDIRECT_KEY)).toBeNull();
  });
});
