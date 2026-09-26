import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PostCreateActivationWizard from "../src/components/onboarding/PostCreateActivationWizard";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  effects: [] as Array<() => () => void>,
  mounting: true,
  fetch: vi.fn(),
  event: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
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
  useEffect: (effect: () => () => void) => {
    if (h.mounting) h.effects.push(effect);
  },
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("react-router", () => ({ Link: "a" }));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/lib/use-modal-focus-trap", () => ({ useModalFocusTrap: vi.fn() }));
vi.mock("../src/lib/use-body-scroll-lock", () => ({ useBodyScrollLock: vi.fn() }));
vi.mock("../src/lib/post-signup-onboarding", () => ({ setPostSignupFlowActive: vi.fn() }));
vi.mock("../src/lib/wireline-create-flow", () => ({
  clearPostCreateWizard: vi.fn(),
  readPostCreateWizardStep: () => "launch",
  stashPostCreateWizardStep: vi.fn(),
}));
vi.mock("../src/lib/product-event-client", () => ({
  emitProductEvent: h.event,
  emitProductEventOnce: h.event,
}));
vi.mock("../src/lib/plan-catalog", () => ({ planById: () => ({ price_usd_monthly: 19 }) }));
vi.mock("../src/lib/signup-intent", () => ({
  activationBillingHref: () => "/settings/billing",
  getStoredSignupIntent: () => null,
}));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "aside" }));
vi.mock("../src/components/RoleplaySandbox", () => ({ default: "sandbox" }));

type Props = {
  children?: ReactNode;
  action?: ReactNode;
  title?: string;
  disabled?: boolean;
  onClick?: () => unknown;
};
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children), ...elements(node.props.action)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node))
    return `${node.props.title || ""}${text(node.props.children)}${text(node.props.action)}`;
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
const phone = "+13125550100";
let payload: Parameters<typeof PostCreateActivationWizard>[0]["payload"];
let cleanups: Array<() => void>;
function render() {
  h.stateCursor = 0;
  h.refCursor = 0;
  return PostCreateActivationWizard({ payload, onClose: vi.fn() });
}
function button(label: string) {
  return elements(render()).find((element) => element.type === "button" && text(element) === label);
}
function response(numbers: unknown[], status = 200) {
  return new Response(JSON.stringify({ numbers }), { status });
}
function line(status?: string) {
  return { agent_id: "bot", phone_number: phone, native_voice_status: status };
}
async function mount() {
  render();
  h.mounting = false;
  cleanups = h.effects.map((effect) => effect());
  await vi.waitFor(() => expect(text(render())).not.toContain("Checking your line"));
}
beforeEach(() => {
  vi.clearAllMocks();
  h.states = [];
  h.refs = [];
  h.effects = [];
  h.mounting = true;
  h.fetch.mockReset();
  payload = {
    agentId: "bot",
    agentName: "Front Desk",
    phoneProvisionRequested: true,
    phoneProvisioned: true,
    phoneNumber: phone,
  };
  cleanups = [];
});
afterEach(() => cleanups.forEach((cleanup) => cleanup()));

describe("setup guide requires confirmed calling", () => {
  it.each(["degraded", "configuration_required", "unavailable", undefined])(
    "keeps a %s line reserved and recovers without another number purchase",
    async (status) => {
      h.fetch.mockResolvedValueOnce(response([line(status)]));
      await mount();
      expect(text(render())).toContain("Number reserved");
      expect(text(render())).not.toContain("Your live number");
      expect(button("Continue")).toBeUndefined();
      expect(button("Get a number")).toBeUndefined();
      expect(button("Retry connection")?.props.disabled).toBe(false);
      h.fetch.mockResolvedValueOnce(response([line("active")]));
      button("Retry connection")?.props.onClick?.();
      await vi.waitFor(() => expect(text(render())).toContain("Your live number"));
      button("Continue")?.props.onClick?.();
      expect(text(render())).toContain("It's on the Line");
      expect(h.fetch.mock.calls.map(([url]) => url)).toEqual([
        "/api/phone-numbers",
        "/api/phone-numbers",
      ]);
    },
  );

  it("does not resurrect an old payload number after a successful empty inventory read", async () => {
    h.fetch.mockResolvedValueOnce(response([]));
    await mount();
    expect(text(render())).not.toContain("(312) 555-0100");
    expect(text(render())).toContain("No live line yet");
    expect(button("Get a number")?.props.disabled).toBe(false);
    expect(button("Continue")).toBeUndefined();
  });

  it("does not trust a previously provisioned payload when routing lookup fails", async () => {
    h.fetch.mockResolvedValueOnce(response([], 503));
    await mount();
    expect(text(render())).not.toContain("Your live number");
    expect(button("Continue")).toBeUndefined();
    h.fetch.mockResolvedValueOnce(response([line("active")]));
    button("Retry line lookup")?.props.onClick?.();
    await vi.waitFor(() => expect(text(render())).toContain("Your live number"));
  });

  it("retains a reserved line after partial provisioning and offers routing recovery", async () => {
    payload = {
      agentId: "bot",
      agentName: "Front Desk",
      phoneProvisionRequested: false,
      phoneProvisioned: false,
    };
    h.fetch.mockResolvedValueOnce(response([]));
    await mount();
    h.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, activation_pending: true, phone_number: phone }), {
        status: 503,
      }),
    );
    h.fetch.mockResolvedValueOnce(response([line("degraded")]));
    button("Get a number")?.props.onClick?.();
    await vi.waitFor(() => expect(button("Retry connection")?.props.disabled).toBe(false));
    expect(button("Get a number")).toBeUndefined();
    expect(text(render())).toContain("Number reserved");
    expect(text(render())).not.toContain("It's on the Line");
    expect(h.event.mock.calls.some(([event]) => event.event === "phone_channel_wired")).toBe(false);
    expect(
      h.fetch.mock.calls.filter(([url]) => url === "/api/phone-numbers/provision"),
    ).toHaveLength(1);
  });

  it("uses honest soft-open copy instead of a checkout CTA when billing is closed", async () => {
    payload = {
      agentId: "bot",
      agentName: "Front Desk",
      phoneProvisionRequested: false,
      phoneProvisioned: false,
    };
    h.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/phone-numbers") return response([]);
      if (url === "/api/phone-numbers/provision") {
        return new Response(JSON.stringify({ code: "ACTIVATION_REQUIRED" }), { status: 402 });
      }
      if (url === "/api/billing/plans") {
        return new Response(
          JSON.stringify({ checkout_available: false, stripe_configured: true, plans: [] }),
        );
      }
      throw new Error(String(url));
    });
    await mount();
    button("Get a number")?.props.onClick?.();
    await vi.waitFor(() => expect(text(render())).toContain("Self-serve checkout isn't open yet"));
    const tree = render();
    expect(text(tree)).toContain("Keep training and using Studio Preview Voice");
    expect(text(tree)).not.toContain("Choose your plan");
    expect(text(tree)).not.toContain("Starter begins at $19/mo");
    const contact = elements(tree).find(
      (element) => element.type === "a" && text(element) === "Contact BotBound",
    );
    expect(contact?.props.to).toBe("/contact?topic=billing");
  });

  it("keeps the paid-plan CTA when self-serve checkout is available", async () => {
    payload = {
      agentId: "bot",
      agentName: "Front Desk",
      phoneProvisionRequested: false,
      phoneProvisioned: false,
    };
    h.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/phone-numbers") return response([]);
      if (url === "/api/phone-numbers/provision") {
        return new Response(JSON.stringify({ code: "ACTIVATION_REQUIRED" }), { status: 402 });
      }
      if (url === "/api/billing/plans") {
        return new Response(
          JSON.stringify({ checkout_available: true, stripe_configured: true, plans: [] }),
        );
      }
      throw new Error(String(url));
    });
    await mount();
    button("Get a number")?.props.onClick?.();
    await vi.waitFor(() => expect(text(render())).toContain("Choose your plan"));
    const plan = elements(render()).find(
      (element) => element.type === "a" && text(element) === "Choose your plan",
    );
    expect(plan?.props.to).toBe("/settings/billing");
    expect(text(render())).not.toContain("Self-serve checkout isn't open yet");
  });
});
