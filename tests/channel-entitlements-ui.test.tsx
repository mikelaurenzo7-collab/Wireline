import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChannelEntitlements } from "../src/hooks/useChannelEntitlements";
const h = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>,
  cursor: 0,
  effects: [] as Array<() => void>,
  user: { id: "owner-a" } as { id: string } | null,
  fetch: vi.fn(),
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
        slot.value = typeof next === "function" ? next(slot.value) : next;
      },
    ];
  },
  useRef(initial: unknown) {
    return (h.slots[h.cursor++] ??= { value: { current: initial } }).value;
  },
  useMemo: (compute: () => unknown) => compute(),
  useCallback: (callback: unknown) => callback,
  useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
    const slot = (h.slots[h.cursor++] ??= {});
    if (!slot.deps || deps.some((value, index) => !Object.is(value, slot.deps?.[index]))) {
      slot.deps = deps;
      h.effects.push(() => {
        slot.cleanup?.();
        slot.cleanup = effect() || undefined;
      });
    }
  },
}));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: h.user }) }));

function EntitlementsHarness(runEffects = true) {
  h.cursor = 0;
  const value = useChannelEntitlements();
  if (runEffects) h.effects.splice(0).forEach((effect) => effect());
  return value;
}
function response(channels: string[] = ["email"]) {
  return new Response(
    JSON.stringify({
      channel_entitlements: {
        plan_id: channels.join("-"),
        subscription_status: "active",
        channels,
        is_owner: false,
      },
    }),
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  h.slots = [];
  h.effects = [];
  h.cursor = 0;
  h.user = { id: "owner-a" };
  h.fetch.mockReset();
});
afterEach(() => h.slots.forEach((slot) => slot.cleanup?.()));
describe("server-owned channel access", () => {
  it("drops prior-owner grants synchronously and ignores its late response", async () => {
    const old = deferred<unknown>();
    const read = vi.fn(() => old.promise);
    h.fetch.mockResolvedValueOnce({ ok: true, json: read });
    EntitlementsHarness();
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    h.user = { id: "owner-b" };
    h.fetch.mockResolvedValueOnce(response(["email"]));
    expect(EntitlementsHarness(false).data).toBeNull();
    expect(EntitlementsHarness(false).includes("voice")).toBe(false);
    EntitlementsHarness();
    await vi.waitFor(() => expect(EntitlementsHarness().includes("email")).toBe(true));
    old.resolve({
      channel_entitlements: {
        plan_id: "voice",
        subscription_status: "active",
        channels: ["voice"],
        is_owner: false,
      },
    });
    await old.promise;
    await Promise.resolve();
    expect(EntitlementsHarness().includes("email")).toBe(true);
    expect(EntitlementsHarness().includes("voice")).toBe(false);
  });
  it.each([null, undefined, { channels: [] }])(
    "keeps missing or malformed grants unavailable: %j",
    async (value) => {
      h.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ channel_entitlements: value })));
      EntitlementsHarness();
      await vi.waitFor(() => expect(EntitlementsHarness().status).toBe("error"));
      expect(EntitlementsHarness().data).toBeNull();
      expect(EntitlementsHarness().includes("email")).toBe(false);
      h.fetch.mockResolvedValueOnce(response());
      EntitlementsHarness().retry();
      EntitlementsHarness();
      await vi.waitFor(() => expect(EntitlementsHarness().includes("email")).toBe(true));
    },
  );
  it("keeps last confirmed data through a failed refresh but blocks channel actions", async () => {
    h.fetch.mockResolvedValueOnce(response());
    EntitlementsHarness();
    await vi.waitFor(() => expect(EntitlementsHarness().includes("email")).toBe(true));
    h.fetch.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    EntitlementsHarness().retry();
    EntitlementsHarness();
    await vi.waitFor(() => expect(EntitlementsHarness().status).toBe("error"));
    expect(EntitlementsHarness().data?.channels).toEqual(["email"]);
    expect(EntitlementsHarness().includes("email")).toBe(false);
  });
  it("discards grants on logout and a return to the same owner", async () => {
    h.fetch.mockResolvedValueOnce(response());
    EntitlementsHarness();
    await vi.waitFor(() => expect(EntitlementsHarness().includes("email")).toBe(true));
    h.user = null;
    expect(EntitlementsHarness(false).data).toBeNull();
    EntitlementsHarness();
    h.user = { id: "owner-a" };
    h.fetch.mockResolvedValueOnce(response(["voice"]));
    expect(EntitlementsHarness(false).data).toBeNull();
    EntitlementsHarness();
    await vi.waitFor(() => expect(EntitlementsHarness().includes("voice")).toBe(true));
    expect(EntitlementsHarness().includes("email")).toBe(false);
  });
});
