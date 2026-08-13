import { afterEach, describe, expect, it, vi } from "vitest";

import { resolvePostAuthDestination } from "../src/lib/auth-redirect";
import { FRESH_SIGNUP_SESSION_KEY } from "../src/lib/post-signup-onboarding";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("returning paid-plan intent", () => {
  it("routes a signed-in paid-plan selection directly to Billing", () => {
    expect(resolvePostAuthDestination("business", "?plan=starter")).toBe(
      "/settings/billing?plan=starter",
    );
    expect(resolvePostAuthDestination("business", "?plan=business&interval=year")).toBe(
      "/settings/billing?plan=business&interval=year",
    );
  });

  it("does not turn the free-builder CTA into a billing redirect", () => {
    expect(resolvePostAuthDestination("personal", "?plan=personal")).toBe("/overview");
  });

  it("preserves Fast Start for a genuinely fresh signup", () => {
    const storage = memoryStorage();
    storage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");
    vi.stubGlobal("sessionStorage", storage);

    expect(resolvePostAuthDestination("business", "?plan=business&interval=year")).toBe(
      "/studio?create=1&posture=business",
    );
    expect(storage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
  });
});
