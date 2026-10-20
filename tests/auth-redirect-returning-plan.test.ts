import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_REDIRECT_KEY,
  persistOAuthReturnFromSearch,
  readRedirectFromSearch,
  resolvePostAuthDestination,
} from "../src/lib/auth-redirect";
import { FRESH_SIGNUP_SESSION_KEY } from "../src/lib/post-signup-onboarding";
import {
  SIGNUP_INTENT_STORAGE_KEY,
  SIGNUP_WEDGE_KEYS,
  SIGNUP_WEDGE_RECOMMENDATIONS,
  captureSignupIntentFromLocation,
  getStoredSignupIntent,
  parseSignupIntent,
} from "../src/lib/signup-intent";

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
    expect(resolvePostAuthDestination("personal", "?redirect=%2Fsettings%3Ftab%3Dbilling")).toBe(
      "/settings?tab=billing",
    );
  });

  it("rejects external and protocol-relative return targets", () => {
    expect(readRedirectFromSearch("?redirect=https%3A%2F%2Fevil.example")).toBeNull();
    expect(readRedirectFromSearch("?redirect=%2F%2Fevil.example")).toBeNull();
    expect(resolvePostAuthDestination("business", "?redirect=%2F%2Fevil.example")).toBe("/studio");
  });

  it("sends every fresh signup into the same one-workspace Bot Studio", () => {
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    const destination = resolvePostAuthDestination("business", "");

    expect(destination).toBe("/studio?create=1");
    expect(destination).not.toContain("posture=");
    expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
  });

  it("opens the role selected on a marketing CTA after email signup", () => {
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    expect(resolvePostAuthDestination("personal", "?plan=free&template=front-desk")).toBe(
      "/studio?create=1&template=front-desk",
    );
    expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
  });

  it("restores a trusted role after the OAuth round trip clears the signup query", () => {
    localStorage.setItem(
      SIGNUP_INTENT_STORAGE_KEY,
      JSON.stringify({ preferredTemplateId: "sales-rep", capturedAt: "2026-09-09T00:00:00Z" }),
    );
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    expect(resolvePostAuthDestination("personal", "")).toBe("/studio?create=1&template=sales-rep");
    // Signup attribution must not reopen creation on a later sign-in.
    expect(resolvePostAuthDestination("personal", "")).toBe("/studio");
  });

  it("prefers the current trusted role over older signup attribution", () => {
    localStorage.setItem(
      SIGNUP_INTENT_STORAGE_KEY,
      JSON.stringify({ preferredTemplateId: "sales-rep", capturedAt: "2026-09-09T00:00:00Z" }),
    );
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    expect(resolvePostAuthDestination("personal", "?template=front-desk")).toBe(
      "/studio?create=1&template=front-desk",
    );
  });

  it("uses a newly selected solution instead of a stale personal role for email and OAuth signup", () => {
    window.location.search = "?plan=free&template=personal-assistant";
    captureSignupIntentFromLocation();
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    // The current URL wins even if account completion precedes intent capture.
    expect(resolvePostAuthDestination("business", "?wedge=support&plan=free")).toBe(
      "/studio?create=1&template=front-desk",
    );

    // A query change on the same signup route must also replace the stored role
    // before OAuth removes the query from the return URL.
    window.location.search = "?wedge=support&plan=free";
    expect(captureSignupIntentFromLocation()).toMatchObject({ signupWedge: "support" });
    expect(getStoredSignupIntent()?.preferredTemplateId).toBeUndefined();
    window.location.search = "";
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    expect(resolvePostAuthDestination("business", "")).toBe("/studio?create=1&template=front-desk");
    expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
    expect(resolvePostAuthDestination("business", "")).toBe("/studio");
  });

  it.each(SIGNUP_WEDGE_KEYS)(
    "opens a current role for the %s solution after email and OAuth signup",
    (wedge) => {
      const template = SIGNUP_WEDGE_RECOMMENDATIONS[wedge].templateId;
      expect(parseSignupIntent(`?template=${template}`)?.preferredTemplateId).toBe(template);
      sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");
      expect(resolvePostAuthDestination("business", `?wedge=${wedge}`)).toBe(
        `/studio?create=1&template=${template}`,
      );
      localStorage.setItem(
        SIGNUP_INTENT_STORAGE_KEY,
        JSON.stringify({ signupWedge: wedge, capturedAt: "2026-09-19T00:00:00Z" }),
      );
      sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");
      expect(resolvePostAuthDestination("business", "")).toBe(
        `/studio?create=1&template=${template}`,
      );
    },
  );

  it("keeps an explicit role choice ahead of a solution recommendation", () => {
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");
    expect(resolvePostAuthDestination("business", "?wedge=sales&template=front-desk")).toBe(
      "/studio?create=1&template=front-desk",
    );
    localStorage.setItem(
      SIGNUP_INTENT_STORAGE_KEY,
      JSON.stringify({
        signupWedge: "sales",
        preferredTemplateId: "appointment-setter",
        capturedAt: "2026-09-19T00:00:00Z",
      }),
    );
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");
    expect(resolvePostAuthDestination("business", "")).toBe(
      "/studio?create=1&template=appointment-setter",
    );
  });
  it("ignores unrecognized roles at the fresh-signup redirect boundary", () => {
    localStorage.setItem(
      SIGNUP_INTENT_STORAGE_KEY,
      JSON.stringify({ preferredTemplateId: "unknown-role", capturedAt: "2026-09-09T00:00:00Z" }),
    );
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    expect(resolvePostAuthDestination("personal", "?template=unknown-role")).toBe(
      "/studio?create=1",
    );
  });

  it.each(["month", "year"])(
    "preserves an explicit %s choice for returning paid users",
    (interval) => {
      localStorage.setItem(
        SIGNUP_INTENT_STORAGE_KEY,
        JSON.stringify({
          preferredPlanId: "starter",
          preferredBillingInterval: "year",
          capturedAt: "2026-09-19T00:00:00Z",
        }),
      );
      expect(resolvePostAuthDestination("business", `?plan=starter&interval=${interval}`)).toBe(
        `/settings/billing?plan=starter&interval=${interval}`,
      );
    },
  );

  it.each(["month", "year"])(
    "carries the current %s paid CTA through a returning-user OAuth round trip once",
    (interval) => {
      persistOAuthReturnFromSearch(`?plan=starter&interval=${interval}`);

      expect(localStorage.getItem(AUTH_REDIRECT_KEY)).toBe(
        `/settings/billing?plan=starter&interval=${interval}`,
      );
      expect(resolvePostAuthDestination("business", "")).toBe(
        `/settings/billing?plan=starter&interval=${interval}`,
      );
      expect(localStorage.getItem(AUTH_REDIRECT_KEY)).toBeNull();
    },
  );

  it("keeps fresh OAuth signups in Studio even when they selected a paid plan", () => {
    persistOAuthReturnFromSearch("?plan=team&interval=year");
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    expect(resolvePostAuthDestination("business", "")).toBe("/studio?create=1");
    expect(localStorage.getItem(AUTH_REDIRECT_KEY)).toBeNull();
    expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
  });

  it("keeps an explicit safe return target ahead of paid-plan intent", () => {
    persistOAuthReturnFromSearch(
      "?redirect=%2Fsettings%3Ftab%3Dprofile&plan=starter&interval=year",
    );

    expect(resolvePostAuthDestination("business", "")).toBe("/settings?tab=profile");
  });

  it.each(["", "?plan=personal", "?plan=unknown", "?interval=weekly"])(
    "does not create a billing redirect from %s",
    (search) => {
      localStorage.setItem(AUTH_REDIRECT_KEY, "/settings/billing?plan=business");

      persistOAuthReturnFromSearch(search);

      expect(localStorage.getItem(AUTH_REDIRECT_KEY)).toBeNull();
    },
  );

  it("never turns long-lived signup attribution into an unrelated OAuth redirect", () => {
    localStorage.setItem(
      SIGNUP_INTENT_STORAGE_KEY,
      JSON.stringify({
        preferredPlanId: "starter",
        preferredBillingInterval: "year",
        capturedAt: new Date().toISOString(),
      }),
    );

    persistOAuthReturnFromSearch("");

    expect(resolvePostAuthDestination("business", "")).toBe("/studio");
  });

  it("sends returning users without a safe target to Bot Studio", () => {
    expect(resolvePostAuthDestination("personal", "")).toBe("/studio");
  });
});
