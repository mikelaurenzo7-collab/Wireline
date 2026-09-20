import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, type User, useAuth } from "../src/contexts/AuthContext";
import { LEGACY_STORAGE_KEY } from "../src/lib/session-cookie";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  fetch: vi.fn(),
  setRecoveryOwner: vi.fn(),
  clearLastAgent: vi.fn(),
}));

// Exercise the real AuthProvider signOut callback and session state. Background
// hydration effects are outside this bounded server-confirmation contract.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = typeof next === "function" ? next(h.states[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useEffect: () => {},
}));
vi.mock("react-router", () => ({ useLocation: () => ({ pathname: "/accept-invite" }) }));
vi.mock("../src/lib/api", () => ({
  AUTH_SESSION_EXPIRED_EVENT: "session-expired",
  refreshSessionIfNeeded: vi.fn(),
}));
vi.mock("../src/lib/create-brief-recovery", () => ({
  setCreateBriefRecoveryOwner: h.setRecoveryOwner,
  suspendCreateBriefRecovery: vi.fn(),
}));
vi.mock("../src/lib/studio-agent-preference", () => ({
  clearStudioLastAgentId: h.clearLastAgent,
}));

type AuthValue = ReturnType<typeof useAuth>;
const owner: User = { id: "owner-1", email: "owner@example.com" };
const stored = new Map<string, string>();

function render(): AuthValue {
  h.stateCursor = 0;
  h.refCursor = 0;
  const tree = AuthProvider({ children: null });
  if (!isValidElement<{ value: AuthValue }>(tree)) throw new Error("Missing auth provider");
  return tree.props.value;
}

function expectSessionPreserved() {
  expect(render().user).toEqual(owner);
  expect(render().session).toEqual({ user: owner });
  expect(stored.get(LEGACY_STORAGE_KEY)).toBe("legacy-session");
  expect(h.setRecoveryOwner).not.toHaveBeenCalled();
  expect(h.clearLastAgent).not.toHaveBeenCalled();
}

function expectSessionCleared() {
  expect(render().user).toBeNull();
  expect(render().session).toBeNull();
  expect(stored.has(LEGACY_STORAGE_KEY)).toBe(false);
  expect(h.setRecoveryOwner).toHaveBeenCalledWith(null);
  expect(h.clearLastAgent).toHaveBeenCalledOnce();
}

beforeEach(() => {
  vi.useFakeTimers();
  h.states = [];
  h.refs = [];
  h.fetch.mockReset();
  h.setRecoveryOwner.mockReset();
  h.clearLastAgent.mockReset();
  stored.clear();
  vi.stubGlobal("fetch", h.fetch);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    removeItem: (key: string) => stored.delete(key),
  });
  render().signIn({ user: owner });
  h.setRecoveryOwner.mockClear();
  stored.set(LEGACY_STORAGE_KEY, "legacy-session");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("confirmed account-switch sign-out", () => {
  it("retains the session and drafts until the server confirms success", async () => {
    let finish!: (response: Response) => void;
    h.fetch.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));

    const pending = render().signOut({ requireServerConfirmation: true });
    expectSessionPreserved();
    expect(h.fetch).toHaveBeenCalledWith(
      "/api/auth/signout",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        signal: expect.any(AbortSignal),
      }),
    );
    finish(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await pending;

    expectSessionCleared();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { name: "non-2xx", status: 503, body: '{"success":true}' },
    { name: "negative", status: 200, body: '{"success":false}' },
    { name: "missing", status: 200, body: "{}" },
    { name: "malformed", status: 200, body: "upstream HTML" },
  ])("rejects $name confirmation without clearing local state", async ({ status, body }) => {
    h.fetch.mockResolvedValueOnce(new Response(body, { status }));

    await expect(render().signOut({ requireServerConfirmation: true })).rejects.toThrow(
      "Sign-out could not be confirmed",
    );

    expectSessionPreserved();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains the session after a network failure and allows a confirmed retry", async () => {
    h.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(render().signOut({ requireServerConfirmation: true })).rejects.toThrow(
      "Sign-out could not be confirmed",
    );
    expectSessionPreserved();

    h.fetch.mockResolvedValueOnce(new Response('{"success":true}', { status: 200 }));
    await render().signOut({ requireServerConfirmation: true });
    expectSessionCleared();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a hanging account switch without clearing the session", async () => {
    h.fetch.mockImplementationOnce(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
        }),
    );
    const pending = render().signOut({ requireServerConfirmation: true });
    const rejected = expect(pending).rejects.toThrow("Sign-out could not be confirmed");

    await vi.advanceTimersByTimeAsync(8_000);
    await rejected;

    expectSessionPreserved();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("ordinary sign-out compatibility", () => {
  it.each(["network", "server", "unconfirmed"])(
    "still clears local state after %s failure without requiring confirmation",
    async (failure) => {
      if (failure === "network") h.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      else {
        h.fetch.mockResolvedValueOnce(
          new Response("{}", { status: failure === "server" ? 503 : 200 }),
        );
      }

      await expect(render().signOut()).resolves.toBeUndefined();

      expectSessionCleared();
      expect(h.fetch).toHaveBeenCalledWith("/api/auth/signout", {
        method: "POST",
        credentials: "include",
      });
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
