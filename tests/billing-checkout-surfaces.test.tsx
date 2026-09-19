import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StripeBillingCard from "../src/components/StripeBillingCard";
import TrialGateModal from "../src/components/TrialGateModal";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  effects: [] as Array<() => unknown>,
  listener: undefined as undefined | ((event: { detail: { code: string } }) => void),
  fetch: vi.fn(),
  checkoutAvailability: vi.fn(),
  subscription: null as Record<string, unknown> | null,
  catalog: {} as Record<string, unknown>,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
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
  useEffect: (effect: () => unknown) => h.effects.push(effect),
}));
vi.mock("react-router", () => ({ Link: "a" }));
vi.mock("motion/react", () => ({ motion: { div: "div" }, AnimatePresence: "div" }));
vi.mock("../src/components/UsageMeter", () => ({ default: "usage-meter" }));
vi.mock("../src/components/ui/shadcn/ShadButton", () => ({ ShadButton: "button" }));
vi.mock("../src/components/atoms", () => ({ Chip: "span" }));
vi.mock("../src/lib/api", () => ({
  authFetch: (...args: unknown[]) => h.fetch(...args),
  safeJson: (response: Response) => response.json(),
  TRIAL_GATE_EVENT: "trial-gate",
}));
vi.mock("../src/lib/signup-intent", () => ({
  getStoredSignupIntent: () => null,
  recommendedPlanFromIntent: () => "starter",
  billingIntervalFromIntent: () => "month",
}));
vi.mock("../src/lib/product-event-client", () => ({ emitProductEvent: vi.fn() }));
vi.mock("../src/lib/use-body-scroll-lock", () => ({ useBodyScrollLock: vi.fn() }));
vi.mock("../src/lib/use-modal-focus-trap", () => ({ useModalFocusTrap: vi.fn() }));

type Props = { children?: ReactNode; disabled?: boolean; onClick?: () => unknown };
type Element = ReactElement<Props>;
type Surface = "card" | "modal";
function descendants(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!isValidElement<Props>(node)) return [];
  // Expand the real stateless PlanPicker/ActiveSubCard to inspect controls,
  // rather than asserting their private state or implementation strings.
  if (typeof node.type === "function")
    return descendants((node.type as (props: Props) => ReactNode)(node.props));
  return [node, ...descendants(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function render(surface: Surface, cardProps: Parameters<typeof StripeBillingCard>[0] = {}) {
  h.stateCursor = 0;
  h.refCursor = 0;
  h.effects = [];
  return descendants(
    surface === "card"
      ? StripeBillingCard({ onCheckoutAvailabilityChange: h.checkoutAvailability, ...cardProps })
      : TrialGateModal(),
  );
}
function button(surface: Surface, label: string) {
  const found = render(surface).find(
    (element) => element.type === "button" && text(element).includes(label),
  );
  if (!found) throw new Error(`Missing ${surface} button: ${label}`);
  return found;
}
function paidPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: "starter",
    name: "Starter",
    price_usd_monthly: 19,
    price_usd_annual: 190,
    configured: true,
    annual_configured: true,
    contact_sales: false,
    max_agents: 1,
    is_free: false,
    public: true,
    features: ["Voice"],
    ...overrides,
  };
}
beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.effects = [];
  h.listener = undefined;
  h.subscription = null;
  h.catalog = { stripe_configured: true, checkout_available: true, plans: [paidPlan()] };
  h.fetch.mockReset();
  h.checkoutAvailability.mockReset();
  h.fetch.mockImplementation(async (path: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      path === "/api/billing/status"
        ? { stripe_configured: true, subscription: h.subscription, agent_count: 1 }
        : path === "/api/billing/plans"
          ? h.catalog
          : { url: "https://checkout.example.test/session" },
  }));
  vi.stubGlobal("window", {
    location: { search: "", href: "" },
    addEventListener: (_name: string, listener: typeof h.listener) => {
      h.listener = listener;
    },
    removeEventListener: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

async function mount(surface: Surface) {
  render(surface);
  h.effects[0]();
  if (surface === "modal") {
    h.listener?.({ detail: { code: "ACTIVATION_REQUIRED" } });
    render(surface);
    h.effects[1]();
  }
  await vi.waitFor(() => {
    const controls = render(surface);
    expect(
      controls.some(
        (element) =>
          element.type === "button" &&
          (text(element).includes("Subscribe") ||
            text(element).includes("Checkout paused") ||
            text(element).includes("Pick Starter") ||
            text(element).includes("Manage subscription")),
      ),
    ).toBe(true);
    expect(
      controls.some((element) => text(element).includes("Checking checkout availability")),
    ).toBe(false);
  });
}

describe.each(["card", "modal"] as const)("%s platform checkout gate", (surface) => {
  it.each([false, undefined, "true"])(
    "blocks checkout when the server flag is %s",
    async (flag) => {
      h.catalog.checkout_available = flag;
      await mount(surface);
      const control = button(surface, surface === "card" ? "Checkout paused" : "Pick Starter");
      expect(control.props.disabled).toBe(true);
      await control.props.onClick?.();
      expect(h.fetch.mock.calls.some(([path]) => path === "/api/billing/checkout")).toBe(false);
      if (surface === "card") {
        expect(h.checkoutAvailability.mock.calls.map(([state]) => state)).toEqual([
          "loading",
          "paused",
        ]);
      }
    },
  );
  it("opens a configured monthly plan only when the server gate is open", async () => {
    await mount(surface);
    const control = button(surface, surface === "card" ? "Subscribe" : "Pick Starter");
    expect(control.props.disabled).toBe(false);
    if (surface === "card") expect(h.checkoutAvailability).toHaveBeenLastCalledWith("available");
    await control.props.onClick?.();
    expect(h.fetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ plan_id: "starter", interval: "month" }),
      }),
    );
  });
  it("keeps an unconfigured plan disabled even when the platform gate is open", async () => {
    h.catalog.plans = [paidPlan({ configured: false, annual_configured: false })];
    await mount(surface);
    expect(
      button(surface, surface === "card" ? "Checkout paused" : "Pick Starter").props.disabled,
    ).toBe(true);
  });
});

it.each(["http", "network", "malformed"])(
  "reports unavailable checkout after a %s catalog failure",
  async (failure) => {
    const usualFetch = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation((path: string) => {
      if (path !== "/api/billing/plans") return usualFetch(path);
      if (failure === "network") return Promise.reject(new Error("offline"));
      return Promise.resolve({
        ok: failure !== "http",
        status: 503,
        json: async () => ({ plans: null }),
      });
    });
    render("card");
    h.effects[0]();
    expect(h.checkoutAvailability).toHaveBeenLastCalledWith("loading");
    await vi.waitFor(() => expect(h.checkoutAvailability).toHaveBeenLastCalledWith("unavailable"));
    expect(h.fetch.mock.calls.some(([path]) => path === "/api/conversation-balance/checkout")).toBe(
      false,
    );
  },
);

it("keeps existing subscription management available while new purchases are paused", async () => {
  h.catalog.checkout_available = false;
  h.subscription = {
    has_subscription: true,
    status: "active",
    plan: "starter",
    plan_name: "Starter",
    max_agents: 1,
    current_period_end: null,
    cancel_at_period_end: false,
  };
  await mount("card");
  const portal = button("card", "Manage subscription");
  expect(portal.props.disabled).toBe(false);
  await portal.props.onClick?.();
  expect(h.fetch).toHaveBeenCalledWith("/api/billing/portal", { method: "POST" });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

it.each(["success", "failure"] as const)(
  "ignores an older billing %s after a newer refresh has closed checkout",
  async (outcome) => {
    const oldStatus = deferred<unknown>();
    const usualFetch = h.fetch.getMockImplementation()!;
    const oldCatalog = { ...h.catalog };
    let reads = 0;
    h.fetch.mockImplementation((path: string) => {
      reads += 1;
      if (reads === 1) return oldStatus.promise;
      if (reads === 2) return Promise.resolve({ ok: true, json: async () => oldCatalog });
      return usualFetch(path);
    });

    render("card");
    const retireOldRead = h.effects[0]() as () => void;
    retireOldRead();
    render("card", { billingReady: false });
    const finishReconciliation = h.effects[0]() as () => void;
    h.catalog.checkout_available = false;
    finishReconciliation();
    render("card", { billingReady: true });
    h.effects[0]();
    await vi.waitFor(() => expect(h.checkoutAvailability).toHaveBeenLastCalledWith("paused"));
    const reportedBeforeOldRead = h.checkoutAvailability.mock.calls.length;

    if (outcome === "success") {
      oldStatus.resolve({
        ok: true,
        json: async () => ({ stripe_configured: true, subscription: null, agent_count: 1 }),
      });
    } else {
      oldStatus.reject(new Error("An obsolete request failed"));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(h.checkoutAvailability.mock.calls).toHaveLength(reportedBeforeOldRead);
    expect(button("card", "Checkout paused").props.disabled).toBe(true);
    expect(render("card").some((element) => text(element).includes("obsolete"))).toBe(false);
  },
);

it.each(["reconciliation", "unmount"] as const)(
  "retires in-flight billing reads when %s begins",
  async (transition) => {
    const catalog = deferred<unknown>();
    const usualFetch = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation((path: string) =>
      path === "/api/billing/plans" ? catalog.promise : usualFetch(path),
    );
    render("card");
    const cleanup = h.effects[0]() as () => void;
    cleanup();
    if (transition === "reconciliation") {
      render("card", { billingReady: false });
      h.effects[0]();
    }
    const reportsBeforeCompletion = h.checkoutAvailability.mock.calls.length;
    catalog.resolve({ ok: true, json: async () => h.catalog });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(h.checkoutAvailability.mock.calls).toHaveLength(reportsBeforeCompletion);
    expect(h.checkoutAvailability).toHaveBeenLastCalledWith("loading");
    if (transition === "reconciliation") {
      const controls = render("card", { billingReady: false });
      expect(controls.some((element) => text(element).includes("Loading your plan"))).toBe(true);
      expect(controls.some((element) => element.type === "button")).toBe(false);
    }
  },
);
