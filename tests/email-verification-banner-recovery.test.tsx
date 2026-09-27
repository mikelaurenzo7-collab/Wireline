import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EmailVerifyBanner from "../src/components/layout/EmailVerifyBanner";

const h = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>,
  cursor: 0,
  dirty: false,
  effects: [] as Array<() => void>,
  ownerId: "account-a",
  search: "",
  fetch: vi.fn(),
  success: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const slot = (h.slots[h.cursor++] ??= {
      value: typeof initial === "function" ? initial() : initial,
    });
    return [
      slot.value,
      (next: unknown) => {
        const value = typeof next === "function" ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) h.dirty = true;
        slot.value = value;
      },
    ];
  },
  useRef(initial: unknown) {
    return (h.slots[h.cursor++] ??= { value: { current: initial } }).value;
  },
  useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
    const slot = (h.slots[h.cursor++] ??= {});
    if (
      !slot.deps ||
      deps.length !== slot.deps.length ||
      deps.some((dep, i) => !Object.is(dep, slot.deps?.[i]))
    ) {
      slot.deps = deps;
      h.effects.push(() => {
        slot.cleanup?.();
        slot.cleanup = effect() || undefined;
      });
    }
  },
}));
vi.mock("react-router", () => ({ useLocation: () => ({ search: h.search }) }));
vi.mock("motion/react", () => ({ motion: { div: "div" } }));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/contexts/ToastContext", () => ({ useToast: () => ({ success: h.success }) }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: h.ownerId } }) }));

type Props = {
  children?: ReactNode;
  disabled?: boolean;
  onClick?: () => Promise<void> | void;
  "aria-label"?: string;
};
let tree: ReactNode;
let browser: EventTarget & {
  location: URL;
  history: { state: unknown; replaceState: ReturnType<typeof vi.fn> };
};
let page: EventTarget & { visibilityState: string };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return isValidElement<Props>(node) ? textOf(node.props.children) : "";
}

function render() {
  h.cursor = 0;
  h.dirty = false;
  tree = EmailVerifyBanner();
}

async function settle() {
  for (let pass = 0; pass < 16; pass++) {
    if (h.dirty) render();
    h.effects.splice(0).forEach((effect) => effect());
    await Promise.resolve();
  }
}

async function mount(search = "") {
  h.search = search;
  browser.location = new URL(`https://botbound.app/studio${search}`);
  render();
  await settle();
}

function button(label: string) {
  const result = elements(tree).find(
    (node) => node.type === "button" && textOf(node).trim() === label,
  );
  if (!result) throw new Error(`Missing ${label} button: ${textOf(tree)}`);
  return result.props;
}

async function focus() {
  browser.dispatchEvent(new Event("focus"));
  await settle();
}

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.dirty = false;
  h.effects = [];
  h.ownerId = "account-a";
  h.search = "";
  h.fetch.mockReset().mockImplementation(async () => json({ email_verified: false }));
  h.success.mockReset();
  const history = { state: { key: "route-key" }, replaceState: vi.fn() };
  browser = Object.assign(new EventTarget(), {
    location: new URL("https://botbound.app/studio"),
    history,
  });
  page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", page);
  vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
  tree = null;
});

afterEach(() => {
  h.slots.forEach((slot) => slot.cleanup?.());
  vi.unstubAllGlobals();
});

describe("email verification feedback and recovery", () => {
  it("never treats the success URL as verification of an unverified account", async () => {
    await mount("?verified=1");
    expect(textOf(tree)).toContain("email is not yet confirmed");
    expect(button("Resend email").disabled).toBe(false);
    expect(h.success).not.toHaveBeenCalled();
  });

  it("waits for server confirmation before announcing success and preserves other URL state", async () => {
    const pending = deferred();
    h.fetch.mockReturnValueOnce(pending.promise);
    await mount("?verified=1&agent=bot-a");
    expect(textOf(tree)).toContain("Checking your email verification");
    expect(h.success).not.toHaveBeenCalled();
    pending.resolve(json({ email_verified: true }));
    await settle();
    expect(tree).toBeNull();
    expect(h.success).toHaveBeenCalledOnce();
    expect(browser.history.replaceState).toHaveBeenCalledWith(
      { key: "route-key" },
      "",
      "https://botbound.app/studio?agent=bot-a",
    );
  });

  it.each(["focus", "visibilitychange"])(
    "refreshes the original tab on %s after verification elsewhere",
    async (event) => {
      await mount();
      h.fetch.mockResolvedValueOnce(json({ email_verified: true }));
      (event === "focus" ? browser : page).dispatchEvent(new Event(event));
      await settle();
      expect(tree).toBeNull();
      expect(h.success).toHaveBeenCalledOnce();
    },
  );

  it("does not fetch while the old tab becomes hidden", async () => {
    await mount();
    page.visibilityState = "hidden";
    page.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    json({ email_verified: null }),
    json({ email_verified: true }, 503),
    json({}),
    json({ email_verified: "true" }),
  ])(
    "keeps an unavailable initial lookup retryable without declaring success",
    async (response) => {
      h.fetch.mockResolvedValueOnce(response);
      await mount("?verified=1");
      expect(textOf(tree)).toContain("Couldn't check");
      expect(h.success).not.toHaveBeenCalled();
      h.fetch.mockResolvedValueOnce(json({ email_verified: true }));
      await button("Check status").onClick?.();
      await settle();
      expect(tree).toBeNull();
      expect(h.success).toHaveBeenCalledOnce();
    },
  );

  it("retains the last confirmed unverified state when a refresh is unknown", async () => {
    await mount();
    h.fetch.mockResolvedValueOnce(json({ email_verified: null }));
    await focus();
    expect(textOf(tree)).toContain("request another verification email");
    expect(button("Resend email").disabled).toBe(false);
    expect(h.success).not.toHaveBeenCalled();
  });

  it("retains confirmed verification through later lookup failures", async () => {
    h.fetch.mockResolvedValueOnce(json({ email_verified: true }));
    await mount();
    h.fetch.mockRejectedValueOnce(new Error("Offline"));
    await focus();
    expect(tree).toBeNull();
    expect(h.success).not.toHaveBeenCalled();
  });

  it("ignores an older status response after a fresh confirmation", async () => {
    const old = deferred();
    h.fetch.mockReturnValueOnce(old.promise);
    await mount("?verified=1");
    h.fetch.mockResolvedValueOnce(json({ email_verified: true }));
    await focus();
    old.resolve(json({ email_verified: false }));
    await settle();
    expect(tree).toBeNull();
    expect(h.success).toHaveBeenCalledOnce();
  });

  it("accepts an already-verified resend receipt and retires older reads", async () => {
    await mount();
    const oldRead = deferred();
    h.fetch.mockReturnValueOnce(oldRead.promise);
    await focus();
    h.fetch.mockResolvedValueOnce(json({ ok: true, sent: false, reason: "already_verified" }));
    await button("Resend email").onClick?.();
    await settle();
    oldRead.resolve(json({ email_verified: false }));
    await settle();
    expect(tree).toBeNull();
    expect(h.success).toHaveBeenCalledOnce();
  });

  it.each([
    { ok: true, sent: false, reason: "already_verified" },
    { ok: true, sent: true },
    { reason: "transport_unavailable" },
  ])("does not trust a non-OK resend body: %o", async (body) => {
    await mount();
    h.fetch.mockResolvedValueOnce(json(body, 503));
    await button("Resend email").onClick?.();
    await settle();
    expect(textOf(tree)).toContain("Couldn't send the verification email");
    expect(button("Resend email").disabled).toBe(false);
    expect(h.success).not.toHaveBeenCalled();
  });

  it("admits only one resend before the pending render", async () => {
    await mount();
    const pending = deferred();
    h.fetch.mockReturnValueOnce(pending.promise);
    const resend = button("Resend email").onClick!;
    const first = resend();
    await resend();
    expect(
      h.fetch.mock.calls.filter(([url]) => url === "/api/auth/resend-verification"),
    ).toHaveLength(1);
    pending.resolve(json({ ok: true, sent: true }));
    await first;
    await settle();
    expect(button("Sent").disabled).toBe(true);
  });

  it("restores resend when navigation retires its pending response", async () => {
    await mount();
    const pending = deferred();
    h.fetch.mockReturnValueOnce(pending.promise);
    const request = button("Resend email").onClick?.();
    h.search = "?agent=bot-b";
    render();
    await settle();
    expect(button("Resend email").disabled).toBe(false);
    pending.resolve(json({ ok: true, sent: true }));
    await request;
    await settle();
    expect(button("Resend email").disabled).toBe(false);
  });

  it.each(["expired", "error"])("explains a %s return and offers a fresh link", async (result) => {
    await mount(`?verified=${result}`);
    expect(textOf(tree)).toContain("Request another verification email below");
    expect(button("Resend email").disabled).toBe(false);
    expect(h.success).not.toHaveBeenCalled();
  });

  it.each(["read", "resend"])("ignores a retired account's late %s result", async (kind) => {
    const old = deferred();
    let request: Promise<void> | void = undefined;
    if (kind === "read") {
      h.fetch.mockReturnValueOnce(old.promise);
      await mount("?verified=1");
    } else {
      await mount();
      h.fetch.mockReturnValueOnce(old.promise);
      request = button("Resend email").onClick?.();
    }
    h.ownerId = "account-b";
    h.search = "";
    render();
    await settle();
    old.resolve(
      json(kind === "read" ? { email_verified: true } : { ok: true, reason: "already_verified" }),
    );
    await request;
    await settle();
    expect(textOf(tree)).toContain("Verify your email");
    expect(h.success).not.toHaveBeenCalled();
  });

  it("still permits verification recovery when session storage is blocked", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("Blocked");
      },
      setItem: () => {
        throw new Error("Blocked");
      },
    });
    await mount();
    expect(button("Resend email").disabled).toBe(false);
    const dismiss = elements(tree).find((node) =>
      node.props["aria-label"]?.startsWith("Dismiss email"),
    );
    await dismiss?.props.onClick?.();
    await settle();
    expect(tree).toBeNull();
  });
});
