import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authFetch,
  resetSessionExpiredGuard,
  SESSION_EXPIRED_EVENT,
  SESSION_EXPIRED_FLAG,
} from "./api";

/**
 * authFetch's dead-session detector: a 401 carrying `code: "SESSION_INVALID"`
 * must fire SESSION_EXPIRED_EVENT exactly once (so a burst of parallel 401s
 * triggers a single sign-out) and set the sign-in notice flag — but only when
 * the client actually believed it was authenticated.
 */

// A non-expiring bearer so maybeRefreshToken is a no-op (exp far in the future).
function fakeToken(): string {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60; // +1h
  const payload = Buffer.from(JSON.stringify({ sub: "u1", exp })).toString("base64url");
  return `h.${payload}.s`;
}

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => map.delete(k),
    setItem: (k: string, v: string) => map.set(k, String(v)),
  } as Storage;
}

describe("authFetch dead-session detection", () => {
  const target = new EventTarget();

  beforeEach(() => {
    resetSessionExpiredGuard();
    vi.stubGlobal("window", target);
    vi.stubGlobal("localStorage", makeStorage());
    vi.stubGlobal("sessionStorage", makeStorage());
    localStorage.setItem(
      "wireline_session",
      JSON.stringify({ access_token: fakeToken(), user: { id: "u1" } }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fires SESSION_EXPIRED_EVENT once on a 401/SESSION_INVALID and sets the notice flag", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: "SESSION_INVALID" }), { status: 401 })),
    );

    let fired = 0;
    target.addEventListener(SESSION_EXPIRED_EVENT, () => {
      fired += 1;
    });

    // Two parallel dead-session responses → still a single sign-out.
    await Promise.all([authFetch("/api/triage"), authFetch("/api/triage")]);
    // Allow the fire-and-forget body read to settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(fired).toBe(1);
    expect(sessionStorage.getItem(SESSION_EXPIRED_FLAG)).toBe("1");
  });

  it("does not fire on a 401 without SESSION_INVALID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 401 })),
    );

    let fired = 0;
    target.addEventListener(SESSION_EXPIRED_EVENT, () => {
      fired += 1;
    });

    await authFetch("/api/triage");
    await new Promise((r) => setTimeout(r, 0));

    expect(fired).toBe(0);
    expect(sessionStorage.getItem(SESSION_EXPIRED_FLAG)).toBeNull();
  });

  it("does not fire when the client had no token (genuinely signed out)", async () => {
    localStorage.removeItem("wireline_session");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: "SESSION_INVALID" }), { status: 401 })),
    );

    let fired = 0;
    target.addEventListener(SESSION_EXPIRED_EVENT, () => {
      fired += 1;
    });

    await authFetch("/api/triage");
    await new Promise((r) => setTimeout(r, 0));

    expect(fired).toBe(0);
  });
});
