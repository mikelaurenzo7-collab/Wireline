import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BillingSettings from "../src/pages/BillingSettings";
import StripeBillingCard from "../src/components/StripeBillingCard";

type Slot = {
  value?: unknown;
  dependencies?: readonly unknown[];
  cleanup?: () => void;
  setter?: (next: unknown) => void;
};
const h = vi.hoisted(() => ({
  slots: { page: [], card: [] } as Record<string, Slot[]>,
  current: "page",
  cursor: 0,
  dirty: false,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
}));

vi.mock("react", async (original) => {
  const changed = (before?: readonly unknown[], after?: readonly unknown[]) =>
    !before ||
    !after ||
    before.length !== after.length ||
    after.some((v, i) => !Object.is(v, before[i]));
  const memo = (factory: () => unknown, dependencies?: readonly unknown[]) => {
    const slots = h.slots[h.current];
    const i = h.cursor++;
    if (!slots[i] || changed(slots[i].dependencies, dependencies)) {
      slots[i] = { value: factory(), dependencies };
    }
    return slots[i].value;
  };
  return {
    ...(await original<typeof import("react")>()),
    useState(initial: unknown) {
      const slots = h.slots[h.current];
      const i = h.cursor++;
      slots[i] ??= { value: typeof initial === "function" ? initial() : initial };
      const slot = slots[i];
      slot.setter ??= (next: unknown) => {
        const value = typeof next === "function" ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) {
          slot.value = value;
          h.dirty = true;
        }
      };
      return [slot.value, slot.setter];
    },
    useRef(initial: unknown) {
      const slots = h.slots[h.current];
      const i = h.cursor++;
      slots[i] ??= { value: { current: initial } };
      return slots[i].value;
    },
    useMemo: memo,
    useCallback: (callback: unknown, dependencies: readonly unknown[]) =>
      memo(() => callback, dependencies),
    useEffect(callback: () => void | (() => void), dependencies?: readonly unknown[]) {
      const slots = h.slots[h.current];
      const i = h.cursor++;
      const slot = slots[i] ?? {};
      if (changed(slot.dependencies, dependencies)) {
        slot.dependencies = dependencies;
        h.effects.push(() => {
          slot.cleanup?.();
          slot.cleanup = callback() || undefined;
        });
      }
      slots[i] = slot;
    },
  };
});
vi.mock("react-router", () => ({ Link: "a" }));
vi.mock("motion/react", () => ({ motion: { div: "div" } }));
vi.mock("../src/components/UsageMeter", () => ({ default: "usage-meter" }));
vi.mock("../src/components/ui/shadcn/ShadButton", () => ({ ShadButton: "button" }));
vi.mock("../src/components/atoms", () => ({ Button: "button", Chip: "span" }));
vi.mock("../src/components/molecules/StatusNotice", () => ({ StatusNotice: "aside" }));
vi.mock("../src/components/settings/SettingsTabs", () => ({ default: "nav" }));
vi.mock("../src/components/layout/WorkspacePageFrame", () => ({
  WorkspacePageFrame: "main",
  WorkspacePageIntro: "header",
}));
vi.mock("../src/components/WorkspaceShell", () => ({ default: "div" }));
vi.mock("../src/lib/api", () => ({ authFetch: (...args: unknown[]) => h.fetch(...args) }));
vi.mock("../src/lib/product-event-client", () => ({ emitProductEvent: vi.fn() }));
vi.mock("../src/lib/wireline-create-flow", () => ({
  readPostCreateWizard: () => null,
  readPostCreateWizardStep: () => null,
  updatePostCreateWizard: vi.fn(),
}));
vi.mock("../src/lib/signup-intent", () => ({
  getStoredSignupIntent: () => null,
  recommendedPlanFromIntent: () => "starter",
  billingIntervalFromIntent: () =>
    new URLSearchParams(window.location.search).get("interval") === "year" ? "year" : "month",
}));

type Props = {
  children?: ReactNode;
  action?: ReactNode;
  title?: string;
  disabled?: boolean;
  onClick?: () => unknown;
};
type Element = ReactElement<Props>;
let tree: Element[];
let statusFails: boolean;
let balanceFails: boolean;
let subscription: Record<string, unknown> | null;
let verify: () => Promise<Response>;
const response = (body: Record<string, unknown>, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;
const catalog = {
  stripe_configured: true,
  checkout_available: true,
  plans: [
    {
      id: "starter",
      name: "Starter",
      price_usd_monthly: 19,
      price_usd_annual: 190,
      max_agents: 2,
      voice_minutes_monthly: 50,
      included_phone_numbers: 1,
      overage_per_min_usd: 0.22,
      configured: true,
      annual_configured: true,
      features: ["Voice"],
      is_free: false,
    },
  ],
};
function expand(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(expand);
  if (!isValidElement<Props>(node)) return [];
  if (node.type === StripeBillingCard) {
    h.current = "card";
    h.cursor = 0;
    return expand(StripeBillingCard(node.props));
  }
  if (typeof node.type === "function")
    return expand((node.type as (props: Props) => ReactNode)(node.props));
  return [node, ...expand(node.props.children), ...expand(node.props.action)];
}
function render() {
  let passes = 0;
  do {
    if (++passes > 25) throw new Error("Billing render did not settle");
    h.dirty = false;
    h.current = "page";
    h.cursor = 0;
    h.effects = [];
    tree = expand(BillingSettings());
    h.effects.forEach((run) => run());
  } while (h.dirty);
}
async function settle() {
  render();
  for (let i = 0; i < 40; i++) {
    await Promise.resolve();
    if (h.dirty) render();
  }
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function button(label: string) {
  const node = tree.find((element) => element.type === "button" && text(element) === label);
  if (!node) throw new Error(`Missing ${label} button`);
  return node;
}
function hasText(value: string) {
  return tree.some((element) => text(element).includes(value));
}
function requests(path: string) {
  return h.fetch.mock.calls.filter(([url]) => url === path);
}

beforeEach(() => {
  h.slots = { page: [], card: [] };
  h.effects = [];
  h.dirty = false;
  statusFails = true;
  balanceFails = true;
  subscription = {
    plan: "starter",
    plan_id: "starter",
    plan_name: "Starter",
    max_agents: 2,
    status: "active",
    has_subscription: true,
    has_customer: true,
    current_period_end: "2026-10-20T12:00:00Z",
    cancel_at_period_end: false,
  };
  verify = async () => response({ status: "complete", payment_status: "unpaid" });
  h.fetch.mockReset();
  h.fetch.mockImplementation(async (path: string) => {
    if (path === "/api/billing/checkout/verify") return verify();
    if (path === "/api/billing/status")
      return statusFails
        ? response({ error: "Status unavailable" }, 503)
        : response({ stripe_configured: true, subscription, agent_count: 2 });
    if (path === "/api/billing/plans") return response(catalog);
    if (path === "/api/conversation-balance")
      return balanceFails
        ? response({ error: "Balance unavailable" }, 503)
        : response({ balance_usd: 24.5 });
    throw new Error(`Unexpected endpoint ${path}`);
  });
  const location = {
    search: "",
    pathname: "/settings/billing",
    hash: "",
    href: "",
    replace: vi.fn(),
  };
  vi.stubGlobal("window", {
    location,
    history: {
      state: null,
      replaceState: vi.fn((_state: unknown, _title: string, path: string) => {
        location.search = new URL(path, "http://localhost").search;
      }),
    },
    setTimeout: (done: () => void) => {
      done();
      return 1;
    },
  });
});
afterEach(() => {
  Object.values(h.slots)
    .flat()
    .forEach((slot) => slot.cleanup?.());
  vi.unstubAllGlobals();
});

describe("Billing Settings shared recovery", () => {
  it.each(["status", "balance"])(
    "ignores a retired page %s body that finishes after a successful retry",
    async (stage) => {
      let finish!: (value: Record<string, unknown>) => void;
      const lateBody = new Promise<Record<string, unknown>>((resolve) => {
        finish = resolve;
      });
      const usualFetch = h.fetch.getMockImplementation()!;
      const delayedPath = stage === "status" ? "/api/billing/status" : "/api/conversation-balance";
      let delayed = false;
      h.fetch.mockImplementation((path: string) => {
        if (path === delayedPath && !delayed) {
          delayed = true;
          return Promise.resolve({ ok: true, status: 200, json: () => lateBody });
        }
        return usualFetch(path);
      });
      await settle();
      statusFails = false;
      balanceFails = false;
      button("Retry").props.onClick?.();
      await settle();
      expect(hasText("$24.50")).toBe(true);
      expect(button("$10").props.disabled).toBe(false);
      finish(stage === "status" ? { subscription: null } : { balance_usd: 3.21 });
      await settle();
      expect(hasText("$24.50")).toBe(true);
      expect(hasText("$3.21")).toBe(false);
      expect(button("$10").props.disabled).toBe(false);
    },
  );

  it("describes every occupied Bot slot as full rather than near capacity", async () => {
    statusFails = false;
    balanceFails = false;
    await settle();
    expect(hasText("All Bot slots in use.")).toBe(true);
    expect(hasText("Near capacity.")).toBe(false);
  });

  it("recovers the page status and Runtime Balance when the plan-card Retry succeeds", async () => {
    await settle();
    expect(hasText("Subscription status is temporarily unavailable.")).toBe(true);
    expect(hasText("N/A")).toBe(true);
    statusFails = false;
    balanceFails = false;
    button("Retry").props.onClick?.();
    await settle();
    expect(requests("/api/conversation-balance")).toHaveLength(2);
    expect(hasText("$24.50")).toBe(true);
    expect(hasText("Subscription status is temporarily unavailable.")).toBe(false);
    expect(button("$10").props.disabled).toBe(false);
  });

  it("offers page recovery for a balance-only outage and preserves the selected annual interval", async () => {
    statusFails = false;
    subscription = null;
    await settle();
    button("Annual").props.onClick?.();
    await settle();
    expect(hasText("$190/yr")).toBe(true);
    balanceFails = false;
    button("Retry").props.onClick?.();
    await settle();
    expect(requests("/api/billing/plans")).toHaveLength(2);
    expect(hasText("$24.50")).toBe(true);
    expect(hasText("$190/yr")).toBe(true);
    expect(hasText("Runtime Balance is temporarily unavailable.")).toBe(false);
  });

  it("keeps retained checkout proof fenced during recovery and preserves unrelated intent", async () => {
    window.location.search = "?billing=success&session_id=cs_local&plan=starter&interval=year";
    await settle();
    expect(window.location.search).toContain("session_id=cs_local");
    const beforeStatusReads = requests("/api/billing/status").length;
    const beforePlanReads = requests("/api/billing/plans").length;
    let finish!: (value: Response) => void;
    verify = () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      });
    statusFails = false;
    balanceFails = false;
    button("Retry").props.onClick?.();
    await settle();
    expect(requests("/api/billing/status")).toHaveLength(beforeStatusReads);
    expect(requests("/api/billing/plans")).toHaveLength(beforePlanReads);
    expect(hasText("Loading balance")).toBe(true);
    expect(window.history.replaceState).not.toHaveBeenCalled();
    finish(response({ status: "complete", payment_status: "paid", synced: true }));
    await settle();
    expect(window.location.search).toBe("?plan=starter&interval=year");
    expect(hasText("$24.50")).toBe(true);
    expect(button("$10").props.disabled).toBe(false);
    expect(window.location.replace).not.toHaveBeenCalled();
  });
});
