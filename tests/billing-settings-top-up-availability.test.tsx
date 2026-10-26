import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BillingSettings from "../src/pages/BillingSettings";
import type { CheckoutAvailability } from "../src/components/StripeBillingCard";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  stateCursor: 0,
  effects: [] as Array<() => unknown>,
  fetch: vi.fn(),
  subscription: { plan_id: "starter", status: "active" } as Record<string, unknown> | null,
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
  useEffect: (effect: () => unknown) => h.effects.push(effect),
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("../src/components/StripeBillingCard", () => ({
  default: "billing-card",
  BillingTrustFooter: "footer",
}));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/molecules/StatusNotice", () => ({ StatusNotice: "aside" }));
vi.mock("../src/components/settings/SettingsTabs", () => ({ default: "nav" }));
vi.mock("../src/components/layout/WorkspacePageFrame", () => ({
  WorkspacePageFrame: "main",
  WorkspacePageIntro: "header",
}));
vi.mock("../src/components/WorkspaceShell", () => ({ default: "div" }));
vi.mock("../src/lib/api", () => ({ authFetch: (...args: unknown[]) => h.fetch(...args) }));
vi.mock("../src/lib/wireline-create-flow", () => ({
  readPostCreateWizard: () => null,
  readPostCreateWizardStep: () => null,
  updatePostCreateWizard: vi.fn(),
}));

type Props = {
  children?: ReactNode;
  disabled?: boolean;
  onClick?: () => unknown;
  onCheckoutAvailabilityChange?: (availability: CheckoutAvailability) => void;
  billingReady?: boolean;
};
type Element = ReactElement<Props>;
function descendants(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...descendants(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function render() {
  h.stateCursor = 0;
  h.effects = [];
  return descendants(BillingSettings());
}
function topUps() {
  return render().filter((element) => element.type === "button" && text(element).startsWith("$"));
}
function reportAvailability(availability: CheckoutAvailability) {
  const card = render().find((element) => element.type === "billing-card");
  if (!card?.props.onCheckoutAvailabilityChange) throw new Error("Missing shared checkout gate");
  card.props.onCheckoutAvailabilityChange(availability);
}
async function mount() {
  render();
  h.effects[0]();
  await vi.waitFor(() =>
    expect(render().some((element) => text(element).includes("$5.00"))).toBe(true),
  );
}
beforeEach(() => {
  h.states = [];
  h.effects = [];
  h.subscription = { plan_id: "starter", status: "active" };
  h.fetch.mockReset();
  h.fetch.mockImplementation(async (path: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      path === "/api/billing/status"
        ? { subscription: h.subscription }
        : path === "/api/conversation-balance"
          ? { balance_usd: 5 }
          : { url: "https://checkout.example.test/top-up" },
  }));
  vi.stubGlobal("window", {
    location: { search: "", pathname: "/billing", hash: "", href: "" },
    history: { state: null, replaceState: vi.fn() },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Billing Settings top-up availability", () => {
  it.each([
    ["loading", "Checking top-up availability"],
    ["paused", "Balance top-ups are paused. Check back later."],
    ["unavailable", "Top-up status is unavailable. Refresh this page to retry."],
  ] as const)(
    "withholds purchase controls while %s, despite an active paid plan",
    async (availability, copy) => {
      await mount();
      reportAvailability(availability);
      expect(topUps()).toHaveLength(0);
      expect(render().some((element) => text(element).includes(copy))).toBe(true);
      expect(
        h.fetch.mock.calls.some(([path]) => path === "/api/conversation-balance/checkout"),
      ).toBe(false);
    },
  );

  it("requires a fresh availability result after page mount", async () => {
    await mount();
    expect(topUps()).toHaveLength(0);
    expect(render().find((element) => element.type === "billing-card")?.props.billingReady).toBe(
      true,
    );
  });

  it("opens the selected top-up only after checkout is available", async () => {
    await mount();
    reportAvailability("available");
    const button = topUps().find((element) => text(element) === "$10");
    expect(button).toBeDefined();
    expect(button?.props.disabled).toBe(false);
    await button?.props.onClick?.();
    expect(h.fetch).toHaveBeenCalledWith(
      "/api/conversation-balance/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ amount_usd: 10 }),
      }),
    );
  });

  it("withdraws controls when a catalog refresh closes checkout", async () => {
    await mount();
    reportAvailability("available");
    expect(topUps().length).toBeGreaterThan(0);
    reportAvailability("loading");
    expect(topUps()).toHaveLength(0);
    reportAvailability("paused");
    expect(topUps()).toHaveLength(0);
  });

  it.each([
    null,
    { plan_id: "personal", status: "active" },
    { plan_id: "starter", status: "past_due" },
    { plan_id: "missing-plan", status: "active" },
  ])("still requires an active paid catalog plan: %j", async (subscription) => {
    h.subscription = subscription;
    await mount();
    reportAvailability("available");
    expect(topUps()).toHaveLength(0);
  });
});
