import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readRedirectFromSearch,
  resolvePostAuthDestination,
} from "../src/lib/auth-redirect";
import { FRESH_SIGNUP_SESSION_KEY } from "../src/lib/post-signup-onboarding";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };
}

describe("post-auth destination", () => {
  beforeEach(() => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("sessionStorage", sessionStorage);
    vi.stubGlobal("window", {
      localStorage,
      sessionStorage,
      location: { search: "" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves an explicit safe return target", () => {
    expect(
      resolvePostAuthDestination("personal", "?redirect=%2Fsettings%3Ftab%3Dbilling"),
    ).toBe("/settings?tab=billing");
  });

  it("rejects external and protocol-relative return targets", () => {
    expect(readRedirectFromSearch("?redirect=https%3A%2F%2Fevil.example")).toBeNull();
    expect(readRedirectFromSearch("?redirect=%2F%2Fevil.example")).toBeNull();
    expect(resolvePostAuthDestination("business", "?redirect=%2F%2Fevil.example")).toBe(
      "/overview",
    );
  });

  it("sends every fresh signup into the same one-workspace Bot Studio", () => {
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    const destination = resolvePostAuthDestination("business", "");

    expect(destination).toBe("/studio?create=1");
    expect(destination).not.toContain("posture=");
    expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
  });

  it("preserves a paid plan intent for returning users", () => {
    expect(resolvePostAuthDestination("business", "?plan=starter&interval=year")).toBe(
      "/settings/billing?plan=starter&interval=year",
    );
  });

  it("sends returning users without a safe target to Overview", () => {
    expect(resolvePostAuthDestination("personal", "")).toBe("/overview");
  });
});
