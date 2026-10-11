import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Pricing from "../src/pages/Pricing";
import BillingIntervalControl from "../src/components/BillingIntervalControl";
import ChannelPlanPicker from "../src/components/ChannelPlanPicker";
import {
  activationBillingHref,
  captureSignupIntentFromLocation,
  persistSignupIntent,
} from "../src/lib/signup-intent";

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  effects: [] as Array<() => () => void>,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = harness.index++;
    if (!(index in harness.states))
      harness.states[index] = typeof initial === "function" ? initial() : initial;
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
  // Exercise the real shared picker so these tests still select its controls.
  if (
    isValidElement<Parameters<typeof BillingIntervalControl>[0]>(node) &&
    node.type === BillingIntervalControl
  ) {
    return elements(BillingIntervalControl(node.props));
  }
  if (
    isValidElement<Parameters<typeof ChannelPlanPicker>[0]>(node) &&
    node.type === ChannelPlanPicker
  )
    return elements(ChannelPlanPicker(node.props));
  if (!isValidElement<Element["props"]>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (
    isValidElement<Parameters<typeof ChannelPlanPicker>[0]>(node) &&
    node.type === ChannelPlanPicker
  )
    return text(ChannelPlanPicker(node.props));
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
    plans: ["voice-regular", "email", "voice-email"].map((id) => ({
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
  await vi.waitFor(() => expect(harness.states[3]).toBe("ready"));
}

describe("public pricing activation availability", () => {
  it("defaults new choices to Regular while honoring an explicit or stored Light choice", () => {
    expect(planLink("voice-regular")?.props.to).toBe("/signup?plan=voice-regular&interval=month");
    harness.states = [];
    persistSignupIntent({
      preferredPlanId: "email",
      preferredBillingInterval: "year",
      capturedAt: "2026-09-27T12:00:00Z",
    });
    expect(planLink("email")?.props.to).toBe("/signup?plan=email&interval=year");
    harness.states = [];
    window.location.search = "?plan=voice&interval=month";
    expect(planLink("voice")?.props.to).toBe("/signup?plan=voice&interval=month");
  });
  it("keeps Free Builder and plan intent available while checking, without offering a purchase", () => {
    expect(text(render())).toContain("Checking activation availability…");
    expect(text(planLink("free"))).toBe("Create a Free Bot ");
    expect(text(planLink("voice-regular"))).toBe("Set Up These Channels ");
    expect(text(render())).not.toContain("Start for $19");
  });

  it("offers paid activation only after the live endpoint confirms it", async () => {
    await load(response());
    expect(text(planLink("voice-regular"))).toBe("Get Started ");
    expect(fetch).toHaveBeenCalledWith("/api/billing/plans", {
      signal: expect.any(AbortSignal),
      cache: "no-store",
    });
    expect(planLink("voice-regular")?.props.to).toBe("/signup?plan=voice-regular&interval=month");
  });

  it("offers private setup and a review contact for an unconfigured Email package", async () => {
    window.location.search = "?plan=voice-email-regular&interval=month";
    await load(
      response({
        plans: [
          {
            id: "voice-email-regular",
            configured: false,
            annual_configured: false,
            contact_sales: true,
          },
          {
            id: "voice-regular",
            configured: true,
            annual_configured: true,
            contact_sales: false,
          },
        ],
      }),
    );
    expect(text(render())).toContain(
      "Email activation requires a setup review. Create a Bot for free, rehearse privately, then ask us about activation.",
    );
    expect(text(planLink("voice-email-regular"))).toBe("Create a Free Bot ");
    expect(planLink("voice-email-regular")?.props.to).toBe(
      "/signup?plan=voice-email-regular&interval=month",
    );
    const contact = links().find((element) => element.props.to === "/contact?topic=email");
    expect(text(contact)).toBe("Ask About Email Setup");
  });

  it("keeps SMS as private planning with a setup review instead of paid checkout", async () => {
    window.location.search = "?plan=sms&interval=month";
    await load(
      response({
        plans: [{ id: "sms", configured: false, annual_configured: false, contact_sales: true }],
      }),
    );
    expect(text(render())).toContain(
      "Plan and rehearse an SMS Bot privately. Ask us to review what live activation would require.",
    );
    expect(text(planLink("sms"))).toBe("Create a Free Bot ");
    expect(planLink("sms")?.props.to).toBe("/signup?plan=sms&interval=month");
    const contact = links().find((element) => element.props.to === "/contact?topic=sms");
    expect(text(contact)).toBe("Ask About SMS Setup");
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
    await load(response({ plans: [{ id: "voice-regular", ...flags }] }));
    expect(text(planLink("voice-regular"))).toBe("Set Up These Channels ");
    expect(planLink("voice-regular")?.props.to).toBe("/signup?plan=voice-regular&interval=month");
    expect(text(render())).toContain(
      "Paid activation is unavailable. Create a Bot for free and rehearse privately.",
    );
  });

  it.each([
    ["launch checkout is blocked", response({ checkout_available: false })],
    ["checkout availability is missing", response({ checkout_available: undefined })],
    ["Stripe is unavailable", response({ stripe_configured: false })],
    ["the selected plan is missing", response({ plans: [] })],
  ])("does not offer activation when %s", async (_reason, payload) => {
    await load(payload);
    expect(text(planLink("voice-regular"))).toBe("Set Up These Channels ");
  });

  it("checks annual availability separately and preserves annual signup intent", async () => {
    await load(
      response({
        plans: [
          { id: "voice-regular", configured: true, annual_configured: false, contact_sales: false },
        ],
      }),
    );
    expect(text(planLink("voice-regular"))).toBe("Get Started ");
    elements(render())
      .find((element) => element.type === "button" && text(element) === "Annual")
      ?.props.onClick?.();
    expect(text(planLink("voice-regular"))).toBe("Set Up These Channels ");
    expect(planLink("voice-regular")?.props.to).toBe("/signup?plan=voice-regular&interval=year");
  });

  it("offers the annual CTA only when that interval is enabled", async () => {
    await load(response());
    elements(render())
      .find((element) => element.type === "button" && text(element) === "Annual")
      ?.props.onClick?.();
    expect(text(planLink("voice-regular"))).toBe("Get Started ");
  });

  it.each([
    ["voice", "voice"],
    ["email", "email"],
    ["voice-email", "voice-email"],
  ])("replaces an earlier annual choice with the visible monthly %s plan", (slug, planId) => {
    window.location.search = `?plan=${slug}`;
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
    await vi.waitFor(() => expect(harness.states[3]).toBe("unavailable"));
    expect(text(render())).toContain(
      "Activation status unavailable. Create a Bot for free and rehearse privately.",
    );
    expect(text(planLink("voice-regular"))).toBe("Set Up These Channels ");
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
    expect(harness.states[3]).toBe("loading");
  });
});
