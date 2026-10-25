import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StripeBillingCard from "../src/components/StripeBillingCard";
import TrialGateModal from "../src/components/TrialGateModal";
import UsageSpendCard from "../src/components/usage-billing/UsageSpendCard";
import { Checkbox } from "../src/components/ui/shadcn/Checkbox";
import { STRIPE_PLANS } from "../src/lib/plan-catalog";

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
  signupIntent: null as {
    preferredPlanId: string;
    preferredBillingInterval?: "month" | "year";
  } | null,
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
vi.mock("../src/components/atoms", () => ({ Chip: "span", Button: "button" }));
vi.mock("../src/lib/api", () => ({
  authFetch: (...args: unknown[]) => h.fetch(...args),
  safeJson: (response: Response) => response.json(),
  TRIAL_GATE_EVENT: "trial-gate",
}));
vi.mock("../src/lib/signup-intent", async (original) => ({
  ...(await original<typeof import("../src/lib/signup-intent")>()),
  DEFAULT_ACTIVATION_PLAN_ID: "voice-regular",
  getStoredSignupIntent: () => h.signupIntent,
  recommendedPlanFromIntent: () => h.signupIntent?.preferredPlanId ?? "voice-regular",
  persistSignupIntent: vi.fn(),
  mergeSignupIntent: (_previous: unknown, next: unknown) => next,
  billingIntervalFromIntent: () => "month",
}));
vi.mock("../src/hooks/usePaidPlanAvailability", () => ({
  usePaidPlanAvailability: () => ({ canActivate: () => true }),
}));
vi.mock("../src/lib/product-event-client", () => ({ emitProductEvent: vi.fn() }));
vi.mock("../src/lib/use-body-scroll-lock", () => ({ useBodyScrollLock: vi.fn() }));
vi.mock("../src/lib/use-modal-focus-trap", () => ({ useModalFocusTrap: vi.fn() }));

type Props = {
  children?: ReactNode;
  disabled?: boolean;
  showBalance?: boolean;
  onClick?: () => unknown;
  onChange?: () => unknown;
  to?: string;
  open?: boolean;
  "aria-label"?: string;
};
type Element = ReactElement<Props>;
type Surface = "card" | "modal" | "usage";
function descendants(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!isValidElement<Props>(node)) return [];
  // Expand the real stateless PlanPicker/ActiveSubCard to inspect controls,
  // rather than asserting their private state or implementation strings.
  if (typeof node.type === "function")
    return descendants((node.type as (props: Props) => ReactNode)(node.props));
  return [node, ...descendants(node.props.children)];
}
function detailsFrom(nodes: Element[]) {
  return nodes.find((element) => element.type === "details");
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
      : surface === "usage"
        ? UsageSpendCard({})
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
    id: "voice-regular",
    name: "Calls",
    price_usd_monthly: 15,
    price_usd_annual: 150,
    configured: true,
    annual_configured: true,
    contact_sales: false,
    max_agents: 1,
    included_phone_numbers: 1,
    voice_minutes_monthly: 50,
    runtime_allowance_usd_monthly: 1,
    ai_spend_allowance_usd_monthly: 1.5,
    overage_per_min_usd: 0.2,
    is_free: false,
    catalog_family: "channels",
    checkout_availability: "available",
    channels: ["voice"],
    included_mailboxes: 0,
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
  h.signupIntent = null;
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
          : path === "/api/billing/usage-spend"
            ? { enabled: true, usage_account: false }
            : { url: "https://checkout.example.test/session" },
  }));
  vi.stubGlobal("window", {
    location: { search: "", href: "https://botbound.app/settings/billing", assign: vi.fn() },
    history: { state: null, replaceState: vi.fn() },
    addEventListener: (_name: string, listener: typeof h.listener) => {
      h.listener = listener;
    },
    removeEventListener: vi.fn(),
  });
});

describe("billing plan decisions", () => {
  it("sends the selected usage identities from signup to Checkout", async () => {
    window.location.search = "?plan=usage&interval=month&number=0&email_address=1";
    render("usage");
    h.effects[0]();
    await vi.waitFor(() => expect(button("usage", "Get Started")).toBeTruthy());
    await button("usage", "Get Started").props.onClick?.();
    await vi.waitFor(() =>
      expect(h.fetch).toHaveBeenCalledWith(
        "/api/billing/checkout",
        expect.objectContaining({
          body: JSON.stringify({
            plan_id: "usage",
            interval: "month",
            addons: { number: 0, email_address: 1 },
          }),
        }),
      ),
    );
  });

  it("routes usage activation to the usage offer instead of the package picker", async () => {
    h.catalog = {
      stripe_configured: true,
      checkout_available: true,
      usage_checkout_available: true,
      billing_model: "usage",
      plans: [paidPlan({ id: "usage", catalog_family: "usage" }), paidPlan()],
    };
    render("modal");
    h.effects[0]();
    h.listener?.({ detail: { code: "ACTIVATION_REQUIRED" } });
    render("modal");
    h.effects[1]();
    await vi.waitFor(() =>
      expect(
        render("modal").some(
          (element) =>
            element.props.to ===
            "/settings/billing?plan=usage&interval=month&number=1&email_address=0",
        ),
      ).toBe(true),
    );
    expect(render("modal").some((element) => text(element) === "Continue to Checkout")).toBe(false);
  });

  it("hides package checkout when the usage offer is available", async () => {
    h.catalog = {
      stripe_configured: true,
      checkout_available: true,
      usage_checkout_available: true,
      billing_model: "usage",
      plans: [paidPlan({ id: "usage", catalog_family: "usage" }), paidPlan()],
    };
    render("card");
    h.effects[0]();
    await vi.waitFor(() => expect(h.checkoutAvailability).toHaveBeenCalledWith("available"));
    expect(render("card").some((element) => text(element) === "Continue to Checkout")).toBe(false);
  });
  it("shows authoritative usage and allowances before optional full plan details", async () => {
    const originalFeatures = [
      "Voice, text, and email under your Bot's identity",
      "Connected calendar and CRM workflows",
      "Automatic post-call summary and next action",
      "No automatic overages",
    ];
    h.catalog.plans = [
      paidPlan({
        included_phone_numbers: 3,
        voice_minutes_monthly: 225,
        runtime_allowance_usd_monthly: 2.75,
        ai_spend_allowance_usd_monthly: 4.5,
        overage_per_min_usd: 0.31,
        features: originalFeatures,
      }),
    ];
    await mount("card");
    const elements = render("card");
    const summary = elements.find(
      (element) => element.type === "ul" && !element.props["aria-label"],
    );
    expect(text(summary)).toContain("3 phone numbers included");
    expect(text(summary)).toContain("225 call minutes/month · 1 call at a time");
    expect(text(summary)).toContain("$2.75 Runtime Allowance each month");
    expect(text(summary)).toContain("$4.50 of AI usage included each month");
    expect(text(detailsFrom(elements))).toContain("No automatic overages");
    expect(text(summary)).not.toContain("Connected calendar");
    const details = elements.find((element) => element.type === "details");
    expect(details?.props.open).toBeUndefined();
    for (const feature of originalFeatures) expect(text(details)).toContain(feature);
    expect(
      elements.findIndex(
        (element) => element.type === "button" && text(element).includes("Continue to Checkout"),
      ),
    ).toBeLessThan(elements.indexOf(details!));
  });

  it("preserves allowance disclosures from older payloads without numeric allowances", async () => {
    h.catalog.plans = [
      paidPlan({
        runtime_allowance_usd_monthly: undefined,
        ai_spend_allowance_usd_monthly: undefined,
        features: ["$7 monthly Runtime Allowance + $9 managed AI allowance"],
      }),
    ];
    await mount("card");
    expect(text(render("card").find((element) => element.type === "details"))).toContain(
      "$7 monthly Runtime Allowance + $9 managed AI allowance",
    );
  });

  it.each(["email-regular", "voice-email-regular"])(
    "offers setup review for held %s activation without opening checkout",
    async (planId) => {
      h.signupIntent = { preferredPlanId: planId };
      h.catalog.plans = [
        paidPlan(),
        paidPlan({
          id: planId,
          name: planId === "email-regular" ? "Email" : "Calls + Email",
          channels: planId === "email-regular" ? ["email"] : ["voice", "email"],
          included_mailboxes: 1,
          configured: false,
          annual_configured: false,
          contact_sales: true,
        }),
      ];
      await mount("card");
      const elements = render("card");
      expect(
        elements.some((element) =>
          text(element).includes("Email activation requires a setup review."),
        ),
      ).toBe(true);
      expect(
        elements.find(
          (element) => element.type === "a" && text(element).includes("Ask About Email Setup"),
        )?.props.to,
      ).toBe("/contact?topic=email");
      const checkout = button("card", "Checkout Paused");
      expect(checkout.props.disabled).toBe(true);
      await checkout.props.onClick?.();
      expect(h.fetch.mock.calls.some(([path]) => path === "/api/billing/checkout")).toBe(false);
    },
  );

  it("does not offer a free studio bypass while the global checkout gate is paused", async () => {
    h.catalog.checkout_available = false;
    h.catalog.plans = [
      paidPlan({
        id: "personal",
        name: "Personal",
        price_usd_monthly: 12,
        price_usd_annual: 120,
        is_free: false,
        features: ["20 call minutes"],
      }),
      paidPlan(),
    ];
    await mount("card");
    const elements = render("card");
    expect(
      elements.find((element) => element.type === "a" && text(element).includes("Continue Free")),
    ).toBeUndefined();
    expect(
      elements.some((element) => element.type === "a" && text(element).includes("Contact Sales")),
    ).toBe(false);
    expect(button("card", "Checkout Paused").props.disabled).toBe(true);
    expect(
      elements.some((element) => text(element).includes("New purchases are temporarily paused")),
    ).toBe(true);
  });

  it("uses the selected annual price and submits the annual checkout interval", async () => {
    await mount("card");
    button("card", "Annual").props.onClick?.();
    expect(render("card").some((element) => text(element).includes("$150/year"))).toBe(true);
    const checkout = deferred<Response>();
    h.fetch.mockImplementationOnce(() => checkout.promise);
    const pending = button("card", "Continue to Checkout").props.onClick?.();
    expect(button("card", "Monthly").props.disabled).toBe(true);
    expect(button("card", "Annual").props.disabled).toBe(true);
    expect(button("card", "Opening checkout").props.disabled).toBe(true);
    checkout.resolve(
      new Response(JSON.stringify({ url: "https://checkout.example.test/session" })),
    );
    await pending;
    expect(h.fetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({
        body: JSON.stringify({ plan_id: "voice-regular", interval: "year" }),
      }),
    );
  });

  it("keeps an annual-only sale selectable instead of marking every purchase paused", async () => {
    h.catalog.plans = [paidPlan({ configured: false, annual_configured: true })];
    await mount("card");
    button("card", "Annual").props.onClick?.();
    expect(button("card", "Continue to Checkout").props.disabled).toBe(false);
    await button("card", "Continue to Checkout").props.onClick?.();
    expect(h.fetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({
        body: JSON.stringify({ plan_id: "voice-regular", interval: "year" }),
      }),
    );
  });

  it("offers contact for an unavailable annual price without disabling its monthly option", async () => {
    h.catalog.plans = [paidPlan({ annual_configured: false })];
    await mount("card");
    button("card", "Annual").props.onClick?.();
    expect(
      render("card").find(
        (element) => element.type === "a" && text(element).includes("Contact Sales"),
      )?.props.to,
    ).toBeUndefined();
    button("card", "Monthly").props.onClick?.();
    expect(button("card", "Continue to Checkout").props.disabled).toBe(false);
  });

  it("describes an annual fallback only for the selected activation package", async () => {
    h.signupIntent = { preferredPlanId: "voice-regular", preferredBillingInterval: "year" };
    h.catalog.plans = [
      paidPlan(),
      paidPlan({ id: "voice-high", name: "Calls High", annual_configured: false }),
    ];
    await mount("modal");
    const fallbackMessage = "Annual billing is unavailable. Monthly prices are shown.";
    expect(render("modal").some((element) => text(element).includes("$150/year"))).toBe(true);
    expect(render("modal").some((element) => text(element).includes(fallbackMessage))).toBe(false);
    const high = render("modal").find(
      (element) => element.type === "label" && text(element).includes("Pro"),
    );
    descendants(high)
      .find((element) => element.type === "input")
      ?.props.onChange?.();
    expect(render("modal").some((element) => text(element).includes("$15/month"))).toBe(true);
    expect(render("modal").some((element) => text(element).includes(fallbackMessage))).toBe(true);
    await button("modal", "Continue to Checkout").props.onClick?.();
    expect(h.fetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({
        body: JSON.stringify({ plan_id: "voice-high", interval: "month" }),
      }),
    );
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
          (text(element).includes("Continue to Checkout") ||
            text(element).includes("Checkout Paused") ||
            text(element).includes("Continue to Checkout") ||
            text(element).includes("Manage Billing")),
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
      const control = button(surface, "Checkout Paused");
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
    const control = button(
      surface,
      surface === "card" ? "Continue to Checkout" : "Continue to Checkout",
    );
    expect(control.props.disabled).toBe(false);
    if (surface === "card") expect(h.checkoutAvailability).toHaveBeenLastCalledWith("available");
    await control.props.onClick?.();
    expect(h.fetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ plan_id: "voice-regular", interval: "month" }),
      }),
    );
  });
  it("keeps an unconfigured plan disabled even when the platform gate is open", async () => {
    h.catalog.plans = [paidPlan({ configured: false, annual_configured: false })];
    await mount(surface);
    expect(button(surface, "Checkout Paused").props.disabled).toBe(true);
  });
});

it("keeps paused plans optional and makes available checkout immediately accessible", async () => {
  h.catalog.checkout_available = false;
  await mount("modal");
  expect(render("modal").find((element) => element.type === "details")?.props.open).toBe(false);
  const compare = render("modal").find(
    (element) => element.type === "a" && element.props.to === "/settings/billing",
  );
  expect(compare).toBeDefined();
  compare?.props.onClick?.();
  expect(render("modal")).toEqual([]);

  h.catalog.checkout_available = true;
  await mount("modal");
  expect(render("modal").find((element) => element.type === "details")?.props.open).toBe(true);
  expect(button("modal", "Continue to Checkout").props.disabled).toBe(false);
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
    plan_name: "Calls",
    max_agents: 1,
    current_period_end: null,
    cancel_at_period_end: false,
  };
  await mount("card");
  const portal = button("card", "Manage Billing");
  expect(render("card").find((element) => element.type === "usage-meter")?.props.showBalance).toBe(
    true,
  );
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
    expect(button("card", "Checkout Paused").props.disabled).toBe(true);
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

describe.each(["card", "modal"] as const)("%s selected channel package", (surface) => {
  function selectChannel(index: number) {
    const channels = render(surface).filter((element) => element.type === Checkbox);
    expect(channels).toHaveLength(2);
    channels[index].props.onChange?.();
  }
  it("posts Email exactly after Calls is deselected", async () => {
    h.catalog.plans = STRIPE_PLANS.filter((plan) => plan.catalogFamily === "channels").map((plan) =>
      paidPlan({
        ...plan,
        catalog_family: plan.catalogFamily,
        checkout_availability: plan.checkoutAvailability,
      }),
    );
    await mount(surface);
    selectChannel(1);
    selectChannel(0);
    await button(surface, "Continue to Checkout").props.onClick?.();
    expect(h.fetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({
        body: JSON.stringify({ plan_id: "email-regular", interval: "month" }),
      }),
    );
  });
  it("requires review of a visible launch plan when earlier signup intent requested SMS", async () => {
    h.signupIntent = { preferredPlanId: "sms-regular" };
    window.location.search = "?plan=sms-regular";
    h.catalog.plans = STRIPE_PLANS.filter((plan) => plan.catalogFamily === "channels").map((plan) =>
      paidPlan({
        ...plan,
        catalog_family: plan.catalogFamily,
        checkout_availability: "available",
      }),
    );
    await mount(surface);
    const elements = render(surface);
    expect(elements.filter((element) => element.type === Checkbox)).toHaveLength(2);
    expect(elements.some((element) => text(element).includes("SMS is coming soon."))).toBe(false);
    expect(
      elements
        .filter((element) => element.type === "label")
        .some((element) => text(element).trim() === "SMS"),
    ).toBe(false);
    const selectedPackage = elements.find(
      (element) => element.type === "article" && element.props["aria-label"] === "Selected package",
    );
    expect(
      descendants(selectedPackage).find((element) => element.type === "h2")?.props.children,
    ).toBe("Calls");
    expect(
      descendants(selectedPackage).some(
        (element) => element.type === "p" && text(element) === "Plus",
      ),
    ).toBe(true);
    expect(h.fetch.mock.calls.some(([path]) => path === "/api/billing/checkout")).toBe(false);
    await button(surface, "Continue to Checkout").props.onClick?.();
    expect(h.fetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({
        body: JSON.stringify({ plan_id: "voice-regular", interval: "month" }),
      }),
    );
  });
});
