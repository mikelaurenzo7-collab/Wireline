import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  FRESH_SIGNUP_SESSION_KEY,
  POST_SIGNUP_DISMISS_KEY,
  isFreshSignupSession,
  markFreshSignupSession,
  clearFreshSignupSession,
  isPostSignupDismissed,
  markPostSignupDismissed,
} from "./post-signup-onboarding";
import {
  ONBOARDING_WELCOME,
  onboardingWelcomeSubtitle,
  CONSOLE_MAP,
} from "./wireline-onboarding-copy";

function mockStorage() {
  const data: Record<string, string> = {};
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    clear: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
  };
}

describe("post-signup onboarding session", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", mockStorage());
    vi.stubGlobal("localStorage", mockStorage());
  });

  it("tracks fresh signup in sessionStorage", () => {
    expect(isFreshSignupSession()).toBe(false);
    markFreshSignupSession();
    expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBe("1");
    expect(isFreshSignupSession()).toBe(true);
    clearFreshSignupSession();
    expect(isFreshSignupSession()).toBe(false);
  });

  it("persists explore-first dismiss in localStorage", () => {
    expect(isPostSignupDismissed()).toBe(false);
    markPostSignupDismissed();
    expect(localStorage.getItem(POST_SIGNUP_DISMISS_KEY)).toBe("true");
    expect(isPostSignupDismissed()).toBe(true);
  });
});

describe("onboarding welcome copy", () => {
  it("uses wedge-specific subtitle when intent is present", () => {
    const sub = onboardingWelcomeSubtitle("medical");
    expect(sub.toLowerCase()).toContain("medical");
    expect(sub).toContain(ONBOARDING_WELCOME.subtitle);
  });

  it("falls back to default subtitle without wedge", () => {
    expect(onboardingWelcomeSubtitle(null)).toBe(ONBOARDING_WELCOME.subtitle);
  });

  it("defines console map destinations (replaces product tour)", () => {
    expect(CONSOLE_MAP.items.map((i) => i.path)).toEqual(["/ops", "/chat", "/agents", "/insights"]);
  });
});
