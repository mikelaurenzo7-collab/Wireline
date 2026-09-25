import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AcceptInvite from "../src/pages/AcceptInvite";
import Developers from "../src/pages/Developers";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  effects: [] as Array<() => void | (() => void)>,
  layouts: [] as Array<() => void | (() => void)>,
  stateCursor: 0,
  refCursor: 0,
  mounting: true,
  user: { id: "owner" } as { id: string } | null,
  location: { pathname: "/accept-invite", search: "", hash: "#token=invite-secret" },
  navigate: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = typeof initial === "function" ? initial() : initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = typeof next === "function" ? next(h.states[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    if (h.mounting) h.effects.push(effect);
  },
  useLayoutEffect: (effect: () => void | (() => void)) => {
    if (h.mounting) h.layouts.push(effect);
  },
}));
vi.mock("react-router", () => ({ useLocation: () => h.location, useNavigate: () => h.navigate }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: h.user, loading: false, signOut: h.signOut }),
}));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/layout/MarketingPageFrame", () => ({ default: "marketing-frame" }));
vi.mock("../src/components/marketing/MarketingChrome", () => ({ default: "marketing-chrome" }));
vi.mock("../src/components/brand/WirelineBrand", () => ({ WirelineLockup: "brand-lockup" }));
vi.mock("../src/lib/page-meta", () => ({ PageMeta: "page-meta" }));

type Props = { children?: ReactNode; role?: string; disabled?: boolean; onClick?: () => unknown };
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
let component: typeof Developers;
let cleanups: Array<() => void>;
const fetchMock = vi.fn();
const writeText = vi.fn();
const scrollIntoView = vi.fn();
const replaceState = vi.fn();
const assign = vi.fn();
const stored = new Map<string, string>();
const storage = {
  getItem: vi.fn((key: string) => stored.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    stored.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    stored.delete(key);
  }),
};
const pendingKey = "wireline_pending_invitation";
function render() {
  h.stateCursor = 0;
  h.refCursor = 0;
  return component();
}
function mount() {
  render();
  h.mounting = false;
  cleanups = [...h.layouts, ...h.effects]
    .map((effect) => effect())
    .filter((cleanup): cleanup is () => void => typeof cleanup === "function");
  return render();
}
function button(label: string) {
  return elements(render()).find((node) => node.type === "button" && text(node) === label);
}
function response(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status });
}
async function settle() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  h.states = [];
  h.refs = [];
  h.effects = [];
  h.layouts = [];
  h.mounting = true;
  h.user = { id: "owner" };
  h.location = { pathname: "/accept-invite", search: "", hash: "#token=invite-secret" };
  h.signOut.mockReset();
  fetchMock.mockReset();
  writeText.mockReset();
  stored.clear();
  cleanups = [];
  storage.getItem.mockImplementation((key) => stored.get(key) ?? null);
  storage.setItem.mockImplementation((key, value) => {
    stored.set(key, value);
  });
  storage.removeItem.mockImplementation((key) => {
    stored.delete(key);
  });
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.stubGlobal("document", { getElementById: () => ({ scrollIntoView }) });
  vi.stubGlobal("window", {
    location: { origin: "https://botbound.app", hash: "#mcp-endpoint", assign },
    history: { state: null, replaceState },
    setTimeout,
    clearTimeout,
  });
});
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("developer endpoint copying", () => {
  beforeEach(() => {
    component = Developers;
  });

  it("opens the endpoint anchor without changing the clipboard", () => {
    mount();
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("confirms copying only after the explicit action succeeds", async () => {
    let finish!: () => void;
    writeText.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    mount();
    const copying = button("Copy Endpoint")!.props.onClick!();
    expect(writeText).toHaveBeenCalledWith("https://botbound.app/mcp");
    expect(button("Copying…")?.props.disabled).toBe(true);
    expect(text(render())).not.toContain("Endpoint copied.");
    finish();
    await copying;
    expect(button("Copied")).toBeDefined();
    vi.advanceTimersByTime(2000);
    expect(button("Copy Endpoint")).toBeDefined();
  });

  it.each(["rejected", "unavailable"])(
    "announces a %s clipboard without false success",
    async (failure) => {
      if (failure === "rejected") writeText.mockRejectedValueOnce(new Error("Permission denied"));
      else vi.stubGlobal("navigator", {});
      mount();
      await button("Copy Endpoint")!.props.onClick!();
      const notice = elements(render()).find((node) => node.props.role === "status");
      expect(text(notice)).toBe("Couldn't copy. Select the endpoint to copy it manually.");
      expect(button("Copied")).toBeUndefined();
    },
  );

  it("clears the feedback timer when the page unmounts", async () => {
    writeText.mockResolvedValueOnce(undefined);
    mount();
    await button("Copy Endpoint")!.props.onClick!();
    expect(vi.getTimerCount()).toBe(1);
    cleanups.forEach((cleanup) => cleanup());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a pending copy result after the page unmounts", async () => {
    let finish!: () => void;
    writeText.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    mount();
    const copying = button("Copy Endpoint")!.props.onClick!();
    cleanups.forEach((cleanup) => cleanup());
    finish();
    await copying;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("workspace invitation recovery", () => {
  beforeEach(() => {
    component = AcceptInvite;
  });

  it.each(["network", "unavailable", "different email", "unconfirmed"])(
    "preserves a %s invitation and retries with the same private token",
    async (failure) => {
      if (failure === "network") fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      else
        fetchMock.mockResolvedValueOnce(
          response(
            failure === "unavailable" ? 503 : failure === "different email" ? 400 : 200,
            failure === "different email"
              ? {
                  error:
                    "Invitation is invalid, expired, already used, or belongs to another email address.",
                }
              : failure === "unavailable"
                ? { error: "Temporarily unavailable" }
                : { success: false },
          ),
        );
      mount();
      await settle();
      expect(stored.get(pendingKey)).toBe("invite-secret");
      expect(text(render())).not.toContain("Workspace Joined");
      expect(button("Try Again")).toBeDefined();
      fetchMock.mockResolvedValueOnce(response(200, { success: true }));
      button("Try Again")!.props.onClick!();
      await settle();
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ token: "invite-secret" });
      expect(stored.has(pendingKey)).toBe(false);
      expect(text(render())).toContain("Workspace Joined");
      vi.advanceTimersByTime(900);
      expect(assign).toHaveBeenCalledWith("/studio");
    },
  );

  it("clears only the backend's unambiguous malformed-token rejection", async () => {
    fetchMock.mockResolvedValueOnce(response(400, { error: "Invalid invitation token." }));
    mount();
    await settle();
    expect(stored.has(pendingKey)).toBe(false);
    expect(button("Try Again")).toBeUndefined();
    expect(text(render())).toContain("Invalid invitation token.");
  });

  it("awaits sign-out and returns another account to the invitation without exposing its token", async () => {
    fetchMock.mockResolvedValueOnce(response(400, { error: "Use the invited email address." }));
    mount();
    await settle();
    let finish!: () => void;
    h.signOut.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    button("Sign in with another email")!.props.onClick!();
    expect(h.signOut).toHaveBeenCalledOnce();
    expect(h.signOut).toHaveBeenCalledWith({ requireServerConfirmation: true });
    expect(h.navigate).not.toHaveBeenCalled();
    finish();
    await settle();
    expect(h.navigate).toHaveBeenCalledWith("/signin?redirect=%2Faccept-invite");
    expect(stored.get(pendingKey)).toBe("invite-secret");
  });

  it("keeps the invitation and stays on the recovery screen when confirmed sign-out fails", async () => {
    fetchMock.mockResolvedValueOnce(response(400, { error: "Use the invited email address." }));
    mount();
    await settle();
    h.signOut.mockRejectedValueOnce(new Error("Sign-out could not be confirmed."));

    button("Sign in with another email")!.props.onClick!();
    await settle();

    expect(h.navigate).not.toHaveBeenCalled();
    expect(stored.get(pendingKey)).toBe("invite-secret");
    expect(text(render())).toContain("Sign-out could not finish. Try again.");
    expect(button("Sign in with another email")?.props.disabled).toBe(false);
  });

  it("scrubs legacy query tokens before the unauthenticated signup handoff", () => {
    h.user = null;
    h.location = { pathname: "/accept-invite", search: "?token=invite-secret", hash: "" };
    mount();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/accept-invite");
    expect(stored.get(pendingKey)).toBe("invite-secret");
    expect(h.navigate).toHaveBeenCalledWith("/signup?redirect=%2Faccept-invite", { replace: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders a useful incomplete-link state when reading browser storage is blocked", () => {
    h.location.hash = "";
    storage.getItem.mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    storage.removeItem.mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    expect(() => mount()).not.toThrow();
    expect(text(render())).toContain("This invitation link is incomplete.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("can accept a current invitation even when storage writes and cleanup are blocked", async () => {
    storage.setItem.mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    storage.removeItem.mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    fetchMock.mockResolvedValueOnce(response(200, { success: true }));
    mount();
    await settle();
    expect(text(render())).toContain("Workspace Joined");
  });

  it("explains how to recover an unauthenticated invitation when it cannot be saved", () => {
    h.user = null;
    storage.setItem.mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    mount();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(text(render())).toContain("Sign in, then reopen this invitation link.");
    expect(button("Sign In")).toBeDefined();
  });
});
