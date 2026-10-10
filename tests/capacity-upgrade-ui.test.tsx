import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CapacityUpgradeCard, { CapacityUpgradeContent } from "../src/components/CapacityUpgradeCard";
import { Checkbox } from "../src/components/ui/shadcn/Checkbox";
import { STRIPE_PLANS } from "../src/lib/plan-catalog";
import type { ClientPlan } from "../src/types/api-billing";

const h = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>,
  cursor: 0,
  effects: [] as Array<() => void>,
  user: { id: "owner-a" } as { id: string } | null,
  fetch: vi.fn(),
  refreshBilling: vi.fn(),
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
vi.mock("../src/components/ui/shadcn/ShadButton", () => ({ ShadButton: "button" }));

type Props = {
  children?: ReactNode;
  disabled?: boolean;
  value?: string;
  onClick?: () => void;
  onChange?: () => void;
  type?: string;
};
type Element = ReactElement<Props>;
const plans = STRIPE_PLANS.filter((plan) => plan.catalogFamily === "channels").map((plan) => ({
  ...plan,
  catalog_family: plan.catalogFamily,
  capacity_tier: plan.capacityTier,
  checkout_availability: plan.checkoutAvailability,
})) as unknown as ClientPlan[];
const props = { currentPlanId: "voice", plans, onRefreshBilling: h.refreshBilling };
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  if (typeof node.type === "function")
    return elements((node.type as (props: Props) => ReactNode)(node.props));
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function render() {
  h.cursor = 0;
  const tree = elements(CapacityUpgradeContent(props));
  h.effects.splice(0).forEach((effect) => effect());
  return tree;
}
function button(label: string) {
  const control = render().find((node) => node.type === "button" && text(node).includes(label));
  if (!control) throw new Error(`Missing ${label}`);
  return control;
}
function status(overrides: Record<string, unknown> = {}) {
  return {
    current_plan_id: "voice",
    interval: "month",
    effective_at: "2026-10-05T00:00:00Z",
    eligible_plan_ids: ["voice-regular", "voice-high"],
    pending: null,
    available: true,
    ...overrides,
  };
}
function response(data: unknown, code = 200) {
  return new Response(JSON.stringify(data), { status: code });
}
async function open() {
  button("Increase Capacity").props.onClick?.();
  render();
  await vi.waitFor(() => expect(button("Schedule Capacity Increase")).toBeDefined());
}
function selectRegular() {
  const control = render().find((node) => node.type === "input" && node.props.value === "regular");
  expect(control?.props.disabled).toBe(false);
  control?.props.onChange?.();
}
beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.user = { id: "owner-a" };
  h.fetch.mockReset().mockResolvedValue(response(status()));
  h.refreshBilling.mockReset();
});
afterEach(() => h.slots.forEach((slot) => slot.cleanup?.()));

describe("paid capacity scheduling", () => {
  it("keeps the same channels, requires selection, and confirms the exact renewal receipt", async () => {
    await open();
    expect(button("Schedule Capacity Increase").props.disabled).toBe(true);
    const channels = render().filter((node) => node.type === Checkbox);
    expect(channels).toHaveLength(3);
    expect(channels.every((node) => node.props.disabled)).toBe(true);
    selectRegular();
    expect(button("Schedule Capacity Increase").props.disabled).toBe(false);
    let finish!: (value: Response) => void;
    h.fetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    const action = button("Schedule Capacity Increase").props.onClick!;
    action();
    action();
    expect(h.fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    expect(h.fetch).toHaveBeenLastCalledWith(
      "/api/billing/capacity-upgrade",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ plan_id: "voice-regular" }),
      }),
    );
    finish(
      response({
        status: "scheduled",
        plan_id: "voice-regular",
        effective_at: "2026-10-05T00:00:00Z",
      }),
    );
    await vi.waitFor(() => expect(render().map(text).join(" ")).toContain("is scheduled for"));
    expect(render().map(text).join(" ")).toContain("after successful renewal payment");
    expect(render().map(text).join(" ")).toContain(
      "Your current capacity stays available until then",
    );
    expect(
      render().some(
        (node) => node.type === "button" && text(node).includes("Schedule Capacity Increase"),
      ),
    ).toBe(false);
  });

  it("does not invent eligibility on a failed lookup and recovers without checkout", async () => {
    h.fetch.mockResolvedValueOnce(response({ error: "Capacity is unavailable." }, 503));
    button("Increase Capacity").props.onClick?.();
    render();
    await vi.waitFor(() => expect(button("Refresh Options")).toBeDefined());
    expect(render().some((node) => node.props.type === "radio")).toBe(false);
    h.fetch.mockResolvedValueOnce(response(status()));
    button("Refresh Options").props.onClick?.();
    render();
    await vi.waitFor(() => expect(button("Schedule Capacity Increase")).toBeDefined());
    expect(h.fetch.mock.calls.some(([path]) => String(path).includes("checkout"))).toBe(false);
  });

  it("rejects a mismatched receipt and reconciles an already-scheduled change on refresh", async () => {
    await open();
    selectRegular();
    h.fetch.mockResolvedValueOnce(
      response({
        status: "scheduled",
        plan_id: "email-regular",
        effective_at: "2026-10-05T00:00:00Z",
      }),
    );
    button("Schedule Capacity Increase").props.onClick?.();
    await vi.waitFor(() => expect(button("Refresh Options")).toBeDefined());
    expect(render().map(text).join(" ")).not.toContain("is scheduled for");
    expect(button("Schedule Capacity Increase").props.disabled).toBe(true);
    h.fetch.mockResolvedValueOnce(
      response(
        status({ pending: { plan_id: "voice-regular", effective_at: "2026-10-05T00:00:00Z" } }),
      ),
    );
    button("Refresh Options").props.onClick?.();
    render();
    await vi.waitFor(() => expect(render().map(text).join(" ")).toContain("is scheduled for"));
    expect(h.fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });

  it("fences the entire financial state with the authenticated owner and removes it on logout", () => {
    const first = CapacityUpgradeCard(props);
    expect(first?.key).toBe("owner-a");
    h.user = { id: "owner-b" };
    expect(CapacityUpgradeCard(props)?.key).toBe("owner-b");
    h.user = null;
    expect(CapacityUpgradeCard(props)).toBeNull();
  });

  it("refreshes parent billing when renewal has changed the current plan", async () => {
    h.fetch.mockResolvedValueOnce(response(status({ current_plan_id: "voice-regular" })));
    button("Increase Capacity").props.onClick?.();
    render();
    await vi.waitFor(() => expect(button("Refresh Options")).toBeDefined());
    expect(render().some((node) => node.props.type === "radio")).toBe(false);
    button("Refresh Options").props.onClick?.();
    expect(h.refreshBilling).toHaveBeenCalledTimes(1);
    expect(h.fetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });

  it("never presents an interrupted request as scheduled and confirms its removal before recovery", async () => {
    h.fetch.mockResolvedValueOnce(
      response(
        status({
          pending: {
            plan_id: "voice-regular",
            effective_at: "2026-10-05T00:00:00Z",
            status: "incomplete",
          },
        }),
      ),
    );
    render();
    await vi.waitFor(() => expect(button("Review Capacity Change")).toBeDefined());
    button("Review Capacity Change").props.onClick?.();
    expect(render().map(text).join(" ")).toContain(
      "Capacity change wasn’t confirmed. Remove it, then try again.",
    );
    expect(render().map(text).join(" ")).not.toContain("is scheduled for");
    h.fetch.mockResolvedValueOnce(response({ status: "unknown" }));
    button("Remove Unconfirmed Change").props.onClick?.();
    await vi.waitFor(() => expect(button("Refresh Options")).toBeDefined());
    expect(button("Remove Unconfirmed Change")).toBeDefined();
    h.fetch
      .mockResolvedValueOnce(response({ status: "removed" }))
      .mockResolvedValueOnce(response(status()));
    button("Remove Unconfirmed Change").props.onClick?.();
    await vi.waitFor(() => expect(button("Schedule Capacity Increase")).toBeDefined());
    expect(render().map(text).join(" ")).not.toContain("wasn’t confirmed");
  });

  it("preserves a scheduled change until removal is confirmed and keeps cancellation reachable", async () => {
    h.fetch.mockResolvedValueOnce(
      response(
        status({ pending: { plan_id: "voice-regular", effective_at: "2026-10-05T00:00:00Z" } }),
      ),
    );
    button("Increase Capacity").props.onClick?.();
    render();
    await vi.waitFor(() => expect(button("Remove Scheduled Change")).toBeDefined());
    expect(render().map(text).join(" ")).toContain("then use Manage Billing");
    h.fetch.mockResolvedValueOnce(response({ status: "unknown" }));
    button("Remove Scheduled Change").props.onClick?.();
    await vi.waitFor(() => expect(button("Refresh Options")).toBeDefined());
    expect(render().map(text).join(" ")).toContain("is scheduled for");
    h.fetch
      .mockResolvedValueOnce(response({ status: "removed" }))
      .mockResolvedValueOnce(response(status()));
    button("Remove Scheduled Change").props.onClick?.();
    await vi.waitFor(() => expect(button("Schedule Capacity Increase")).toBeDefined());
    expect(render().map(text).join(" ")).not.toContain("is scheduled for");
    expect(h.fetch.mock.calls.filter(([, options]) => options?.method === "DELETE")).toHaveLength(
      2,
    );
  });
});
