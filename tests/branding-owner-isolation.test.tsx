import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrandingProvider } from "../src/contexts/BrandingContext";

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

type Brand = {
  brand_name: string;
  brand_logo_url: string;
  business_name: string;
  primary_color: string;
};
type Value = {
  branding: Brand;
  isLoading: boolean;
  updateBranding: (settings: Partial<Brand>) => void;
};

function render(runEffects = true): Value {
  h.cursor = 0;
  const provider = BrandingProvider({ children: null as ReactNode });
  if (runEffects) h.effects.splice(0).forEach((effect) => effect());
  return provider.props.value as Value;
}

function response(brand: string) {
  return new Response(JSON.stringify({ settings: { brand_name: brand, business_name: brand } }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function loaded(brand: string) {
  await vi.waitFor(() => {
    expect(render().branding.brand_name).toBe(brand);
    expect(render().isLoading).toBe(false);
  });
  return render();
}

beforeEach(() => {
  h.slots = [];
  h.effects = [];
  h.cursor = 0;
  h.user = { id: "owner-a" };
  h.fetch.mockReset();
});
afterEach(() => h.slots.forEach((slot) => slot.cleanup?.()));

describe("branding owner isolation", () => {
  it("hides the old owner's branding before new-owner effects run, including a failed load", async () => {
    h.fetch.mockResolvedValueOnce(response("Business A"));
    render();
    await loaded("Business A");

    const next = deferred<Response>();
    h.fetch.mockReturnValueOnce(next.promise);
    h.user = { id: "owner-b" };
    const immediate = render(false);
    expect(immediate.branding.brand_name).toBe("BotBound");
    expect(immediate.branding.business_name).toBe("");
    expect(immediate.branding.brand_logo_url).toBe("");
    expect(immediate.isLoading).toBe(true);
    render();
    next.resolve(new Response("{}", { status: 503 }));
    await loaded("BotBound");
  });

  it("ignores a departed owner's delayed JSON even after the new owner has loaded", async () => {
    const oldBody = deferred<unknown>();
    const readOldBody = vi.fn(() => oldBody.promise);
    h.fetch.mockResolvedValueOnce({ ok: true, json: readOldBody });
    render();
    await vi.waitFor(() => expect(readOldBody).toHaveBeenCalledOnce());

    h.user = { id: "owner-b" };
    h.fetch.mockResolvedValueOnce(response("Business B"));
    render();
    await loaded("Business B");
    oldBody.resolve({ settings: { brand_name: "Late A", business_name: "Private A" } });
    await oldBody.promise;
    await loaded("Business B");
    expect(render().branding.business_name).toBe("Business B");
  });

  it("discards stale save callbacks across logout and return to the same account", async () => {
    h.fetch.mockResolvedValueOnce(response("Business A"));
    render();
    const old = await loaded("Business A");
    h.user = null;
    const signedOut = render(false);
    expect(signedOut.branding.brand_name).toBe("BotBound");
    expect(signedOut.isLoading).toBe(false);
    render();
    old.updateBranding({ brand_name: "Late save" });
    expect(render().branding.brand_name).toBe("BotBound");

    h.user = { id: "owner-a" };
    h.fetch.mockResolvedValueOnce(response("Current A"));
    render();
    await loaded("Current A");
    old.updateBranding({ brand_name: "Old session A" });
    expect(render().branding.brand_name).toBe("Current A");
    render().updateBranding({ brand_name: "Confirmed current save" });
    expect(render().branding.brand_name).toBe("Confirmed current save");
  });

  it("preserves confirmed branding through a same-owner failed refresh", async () => {
    h.fetch.mockResolvedValueOnce(response("Business A"));
    render();
    await loaded("Business A");
    h.user = { id: "owner-a" };
    h.fetch.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    render();
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(2));
    await loaded("Business A");
  });
});
