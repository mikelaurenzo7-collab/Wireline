import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_REDIRECT_KEY,
  WORKSPACE_MODE_KEY,
  persistAuthRedirect,
  persistOAuthReturnFromSearch,
  persistWorkspaceMode,
  readRedirectFromSearch,
  readStoredWorkspaceMode,
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
    expect(readRedirectFromSearch("?redirect=%2F%2Fevil.example")).toBeNull();
    expect(readRedirectFromSearch("?redirect=%2F%5Cevil.example")).toBeNull();
    expect(readRedirectFromSearch("?redirect=%2Fapp%00%2Fbusiness")).toBeNull();
    expect(readRedirectFromSearch("?redirect=/signin")).toBeNull();
  });

  it("defaults to Studio for returning users; fresh signups enter Studio create once", () => {
    expect(resolvePostAuthDestination("business", "")).toBe("/studio");
    expect(resolvePostAuthDestination("personal", "")).toBe("/studio");
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");
    expect(resolvePostAuthDestination("personal", "")).toBe("/studio?create=1");
    expect(resolvePostAuthDestination("personal", "")).toBe("/studio");
  });

  it("ignores a stale sign-in redirect when a direct personal signup completes", () => {
    localStorage.setItem(AUTH_REDIRECT_KEY, "/settings");
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    expect(resolvePostAuthDestination("personal", "")).toBe("/studio?create=1");
    expect(localStorage.getItem(AUTH_REDIRECT_KEY)).toBeNull();
    expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
  });

  it("starts a fresh signup in Studio and consumes an incidental safe redirect", () => {
    localStorage.setItem(AUTH_REDIRECT_KEY, "/settings");
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    expect(resolvePostAuthDestination("business", "?redirect=%2Fsettings%2Fphone")).toBe(
      "/studio?create=1",
    );
    expect(localStorage.getItem(AUTH_REDIRECT_KEY)).toBeNull();
    expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
    expect(resolvePostAuthDestination("business", "")).toBe("/studio");
  });

  it("returns stored MCP OAuth consent after Connect signup", () => {
    localStorage.setItem(AUTH_REDIRECT_KEY, "/mcp/oauth/authorize?client_id=wlmcp_client_test");
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    expect(resolvePostAuthDestination("personal", "")).toBe(
      "/mcp/oauth/authorize?client_id=wlmcp_client_test",
    );
    expect(localStorage.getItem(AUTH_REDIRECT_KEY)).toBeNull();
    expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
  });

  it("returns a fresh OAuth signup to its pending workspace invitation", () => {
    localStorage.setItem(AUTH_REDIRECT_KEY, "/accept-invite");
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");

    expect(resolvePostAuthDestination("personal", "")).toBe("/accept-invite");
    expect(localStorage.getItem(AUTH_REDIRECT_KEY)).toBeNull();
    expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
  });

  describe.each(["getter", "methods"] as const)("when storage %s are blocked", (blocked) => {
    beforeEach(() => {
      const denied = () => {
        throw new DOMException("Storage is unavailable", "SecurityError");
      };
      vi.stubGlobal(
        "window",
        blocked === "getter"
          ? Object.defineProperty({}, "localStorage", { get: denied })
          : { localStorage: { getItem: denied, setItem: denied, removeItem: denied } },
      );
    });

    it("keeps account access usable without optional workspace or redirect persistence", () => {
      expect(readStoredWorkspaceMode()).toBe("personal");
      expect(() => persistWorkspaceMode("business")).not.toThrow();
      expect(() => persistAuthRedirect("/accept-invite")).not.toThrow();
      expect(() => persistAuthRedirect(null)).not.toThrow();
      expect(() => persistOAuthReturnFromSearch("?plan=starter&interval=year")).not.toThrow();
      expect(resolvePostAuthDestination("business", "")).toBe("/studio");
    });

    it("honors current safe return paths and paid plan choices", () => {
      expect(resolvePostAuthDestination("personal", "?redirect=%2Faccept-invite")).toBe(
        "/accept-invite",
      );
      expect(
        resolvePostAuthDestination(
          "personal",
          "?redirect=%2Fmcp%2Foauth%2Fauthorize%3Fclient_id%3Dcurrent-client",
        ),
      ).toBe("/mcp/oauth/authorize?client_id=current-client");
      expect(resolvePostAuthDestination("personal", "?plan=starter&interval=year")).toBe(
        "/settings/billing?plan=starter&interval=year",
      );
      expect(
        resolvePostAuthDestination("personal", "?plan=usage&tier=plus&number=0&email_address=1"),
      ).toBe("/settings/billing?plan=usage&interval=month&number=0&email_address=1&tier=plus");
      expect(resolvePostAuthDestination("personal", "?redirect=https%3A%2F%2Fevil.example")).toBe(
        "/studio",
      );
    });

    it("opens the current signup template and consumes the fresh signup marker", () => {
      sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");
      expect(resolvePostAuthDestination("personal", "?template=front-desk")).toBe(
        "/studio?create=1&template=front-desk",
      );
      expect(sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY)).toBeNull();
      expect(resolvePostAuthDestination("personal", "")).toBe("/studio");
    });
  });

  it("preserves a readable current return path if storage cleanup fails", () => {
    localStorage.setItem(AUTH_REDIRECT_KEY, "/settings/phone");
    localStorage.setItem(WORKSPACE_MODE_KEY, "business");
    vi.stubGlobal("window", {
      localStorage: {
        ...localStorage,
        removeItem: () => {
          throw new DOMException("Storage is unavailable", "SecurityError");
        },
      },
    });

    expect(readStoredWorkspaceMode()).toBe("business");
    expect(resolvePostAuthDestination("business", "")).toBe("/settings/phone");
  });
});
