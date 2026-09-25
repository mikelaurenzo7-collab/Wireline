import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Pricing from "../src/pages/Pricing";
import { activationBillingHref, captureSignupIntentFromLocation } from "../src/lib/signup-intent";

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  effects: [] as Array<() => () => void>,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = harness.index++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => (harness.states[index] = value)];
  },
  useEffect: (effect: () => () => void) => harness.effects.push(effect),
}));
vi.mock("react-router", () => ({ Link: "a" }));
vi.mock("../src/components/layout/MarketingPageFrame", () => ({ default: "main" }));
vi.mock("../src/lib/page-meta", () => ({ PageMeta: "page-meta" }));

type Element = ReactElement<{
  children?: ReactNode;
  to?: string;
  onClick?: () => void;
}>;

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Element["props"]>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Element["props"]>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

function render() {
  harness.index = 0;
  return Pricing();
}

function links() {
  return elements(render()).filter((element) => element.type === "a");
}

function planLink(plan: string) {
  return links().find((element) => element.props.to?.startsWith(`/signup?plan=${plan}`));
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    checkout_available: true,
    stripe_configured: true,
    plans: ["starter", "team", "business"].map((id) => ({
      id,
      configured: true,
      annual_configured: true,
      contact_sales: false,
    })),
    ...overrides,
  };
}

let cleanups: Array<() => void>;

beforeEach(() => {
  harness.states = [];
  harness.index = 0;
  harness.effects = [];
  cleanups = [];
  const stored = new Map<string, string>();
  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout,
    location: { search: "" },
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    },
  });
});

afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mount() {
  render();
  cleanups.push(harness.effects[0]());
}

async function load(payload: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
  mount();
  await vi.waitFor(() => expect(harness.states[2]).toBe("ready"));
}

describe("public pricing activation availability", () => {
  it("keeps Free Builder and plan intent available while checking, without offering a purchase", () => {
    expect(text(render())).toContain("Checking activation availability…");
    expect(text(planLink("free"))).toBe("Build Free ");
    expect(text(planLink("starter"))).toBe("Set up Starter ");
    expect(text(render())).not.toContain("Start for $19");
  });

  it("offers paid activation only after the live endpoint confirms it", async () => {
    await load(response());
    expect(text(planLink("starter"))).toBe("Start for $19 ");
    expect(fetch).toHaveBeenCalledWith("/api/billing/plans", {
      signal: expect.any(AbortSignal),
      cache: "no-store",
    });
    expect(planLink("starter")?.props.to).toBe("/signup?plan=starter&interval=month");
  });

  it.each([
    ["release is closed", { configured: false, annual_configured: false, contact_sales: true }],
    [
      "sales contact is required",
      { configured: true, annual_configured: true, contact_sales: true },
    ],
    [
      "malformed flags are returned",
      { configured: "true", annual_configured: "true", contact_sales: false },
    ],
  ])("keeps a free setup CTA when %s", async (_reason, flags) => {
    await load(response({ plans: [{ id: "starter", ...flags }] }));
    expect(text(planLink("starter"))).toBe("Set up Starter ");
    expect(planLink("starter")?.props.to).toBe("/signup?plan=starter&interval=month");
    expect(text(render())).toContain("Build free. Paid activation is currently unavailable.");
  });

  it.each([
    ["launch checkout is blocked", response({ checkout_available: false })],
    ["checkout availability is missing", response({ checkout_available: undefined })],
    ["Stripe is unavailable", response({ stripe_configured: false })],
    ["the selected plan is missing", response({ plans: [] })],
  ])("does not offer activation when %s", async (_reason, payload) => {
    await load(payload);
    expect(text(planLink("starter"))).toBe("Set up Starter ");
  });

  it("checks annual availability separately and preserves annual signup intent", async () => {
    await load(
      response({
        plans: [
          { id: "starter", configured: true, annual_configured: false, contact_sales: false },
        ],
      }),
    );
    expect(text(planLink("starter"))).toBe("Start for $19 ");
    elements(render())
      .find((element) => element.type === "button" && text(element) === "Annual")
      ?.props.onClick?.();
    expect(text(planLink("starter"))).toBe("Set up Starter ");
    expect(planLink("starter")?.props.to).toBe("/signup?plan=starter&interval=year");
  });

  it("offers the annual CTA only when that interval is enabled", async () => {
    await load(response());
    elements(render())
      .find((element) => element.type === "button" && text(element) === "Annual")
      ?.props.onClick?.();
    expect(text(planLink("starter"))).toBe("Start for $190/yr ");
  });

  it.each([
    ["starter", "starter"],
    ["starter-plus", "team"],
    ["pro", "business"],
  ])("replaces an earlier annual choice with the visible monthly %s plan", (slug, planId) => {
    const chooseInterval = (label: string) => {
      const button = elements(render()).find(
        (element) => element.type === "button" && text(element) === label,
      );
      if (!button?.props.onClick) throw new Error(`Missing ${label} interval control.`);
      button.props.onClick();
    };
    const followPlanLink = () => {
      const href = planLink(slug)?.props.to;
      if (!href) throw new Error(`Missing ${slug} plan link.`);
      window.location.search = new URL(href, "https://botbound.app").search;
      return captureSignupIntentFromLocation();
    };

    chooseInterval("Annual");
    expect(followPlanLink()?.preferredBillingInterval).toBe("year");

    chooseInterval("Monthly");
    const monthlyIntent = followPlanLink();
    expect(monthlyIntent).toMatchObject({
      preferredPlanId: planId,
      preferredBillingInterval: "month",
    });
    expect(activationBillingHref(monthlyIntent)).toBe(
      `/settings/billing?plan=${planId}&interval=month`,
    );
  });

  it.each(["network", "http", "malformed"])("fails closed after a %s error", async (failure) => {
    vi.stubGlobal(
      "fetch",
      failure === "network"
        ? vi.fn().mockRejectedValue(new Error("offline"))
        : vi
            .fn()
            .mockResolvedValue({ ok: failure !== "http", json: async () => ({ plans: null }) }),
    );
    mount();
    await vi.waitFor(() => expect(harness.states[2]).toBe("unavailable"));
    expect(text(render())).toContain("Activation status unavailable. Build free and check back.");
    expect(text(planLink("starter"))).toBe("Set up Starter ");
    expect(planLink("free")?.props.to).toBe("/signup?plan=free");
  });

  it("aborts the request when the visitor leaves the page", () => {
    const request = vi.fn().mockImplementation((_url, options: RequestInit) => {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    vi.stubGlobal("fetch", request);
    mount();
    const signal = request.mock.calls[0][1].signal as AbortSignal;
    cleanups[0]();
    expect(signal.aborted).toBe(true);
    expect(harness.states[2]).toBe("loading");
  });
});
