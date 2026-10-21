import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PostCreateActivationWizard from "../src/components/onboarding/PostCreateActivationWizard";

vi.mock("../src/hooks/useChannelEntitlements", () => ({
  useChannelEntitlements: () => ({
    status: "ready",
    data: { channels: h.channels },
    includes: (channel: string) => h.channels.includes(channel),
    retry: vi.fn(),
  }),
}));
const h = vi.hoisted(() => ({
  channels: ["voice", "email", "sms"] as string[],
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  effects: [] as Array<() => () => void>,
  mounting: true,
  fetch: vi.fn(),
  event: vi.fn(),
  navigate: vi.fn(),
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
vi.mock("react-router", () => ({ Link: "a", useNavigate: () => h.navigate }));
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
  to?: string;
};
type Element = ReactElement<Props>;
function expand(node: Element): ReactNode {
  return typeof node.type === "function" && node.type.name === "SoftOpenCheckoutNote"
    ? (node.type as (props: { detail?: string }) => ReactNode)(node.props as { detail?: string })
    : node.props.children;
}
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(expand(node)), ...elements(node.props.action)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node))
    return `${node.props.title || ""}${text(expand(node))}${text(node.props.action)}`;
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
function plans(available = true) {
  return new Response(
    JSON.stringify({ checkout_available: available, stripe_configured: true, plans: [] }),
  );
}
function line(status?: string) {
  return { agent_id: "bot", phone_number: phone, native_voice_status: status };
}
function stubFetch({
  numbers = [] as unknown[],
  numbersStatus = 200,
  checkoutAvailable = true,
  provision,
}: {
  numbers?: unknown[] | (() => unknown[]);
  numbersStatus?: number | (() => number);
  checkoutAvailable?: boolean;
  provision?: Response | (() => Response);
} = {}) {
  h.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/billing/plans") return plans(checkoutAvailable);
    if (url === "/api/phone-numbers" && init?.method !== "POST") {
      const current = typeof numbers === "function" ? numbers() : numbers;
      const status = typeof numbersStatus === "function" ? numbersStatus() : numbersStatus;
      return response(current, status);
    }
    if (url === "/api/phone-numbers/provision") {
      if (typeof provision === "function") return provision();
      if (provision) return provision;
      throw new Error("unexpected provision");
    }
    throw new Error(String(url));
  });
}
async function mount() {
  render();
  h.mounting = false;
  cleanups = h.effects.map((effect) => effect());
  await vi.waitFor(() => expect(text(render())).not.toContain("Checking your line"));
}
beforeEach(() => {
  h.channels = ["voice", "email", "sms"];
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
      let numbers = [line(status)];
      stubFetch({ numbers: () => numbers });
      await mount();
      expect(text(render())).toContain("Number reserved");
      expect(text(render())).not.toContain("Your live number");
      expect(button("Continue")).toBeUndefined();
      expect(button("Choose a number")).toBeUndefined();
      expect(button("Retry Connection")?.props.disabled).toBe(false);
      numbers = [line("active")];
      button("Retry Connection")?.props.onClick?.();
      await vi.waitFor(() => expect(text(render())).toContain("Your live number"));
      button("Continue")?.props.onClick?.();
      expect(text(render())).toContain("It's on the Line");
      expect(h.fetch.mock.calls.filter(([url]) => url === "/api/phone-numbers")).toHaveLength(2);
      expect(h.fetch.mock.calls.some(([url]) => url === "/api/billing/plans")).toBe(true);
    },
  );

  it("does not resurrect an old payload number after a successful empty inventory read", async () => {
    stubFetch({ numbers: [] });
    await mount();
    expect(text(render())).not.toContain("(312) 555-0100");
    expect(text(render())).toContain("No phone number yet");
    expect(button("Choose a number")?.props.disabled).toBe(false);
    expect(button("Continue")).toBeUndefined();
  });

  it("does not trust a previously provisioned payload when routing lookup fails", async () => {
    let numbersStatus = 503;
    let numbers: unknown[] = [];
    stubFetch({
      numbers: () => numbers,
      numbersStatus: () => numbersStatus,
    });
    await mount();
    expect(text(render())).not.toContain("Your live number");
    expect(button("Continue")).toBeUndefined();
    numbersStatus = 200;
    numbers = [line("active")];
    button("Retry Line Lookup")?.props.onClick?.();
    await vi.waitFor(() => expect(text(render())).toContain("Your live number"));
  });

  it.each(["picker", "completion"])(
    "keeps the chosen Bot in the %s route without an automatic purchase",
    async (route) => {
      payload = {
        agentId: "bot",
        agentName: "Front Desk",
        phoneProvisionRequested: false,
        phoneProvisioned: false,
      };
      stubFetch({ numbers: [] });
      await mount();
      if (route === "picker") {
        button("Choose a number")?.props.onClick?.();
        expect(h.navigate).toHaveBeenCalledWith("/phone?tab=setup&agent=bot");
      } else {
        button("Finish for Now")?.props.onClick?.();
        const phoneSetup = elements(render()).find((element) => element.type === "a");
        expect(phoneSetup?.props.to).toBe("/phone?tab=setup&agent=bot");
      }
      expect(h.fetch.mock.calls.some(([url]) => url === "/api/phone-numbers/provision")).toBe(
        false,
      );
      expect(h.event.mock.calls.some(([event]) => event.event === "phone_channel_wired")).toBe(
        false,
      );
    },
  );

  it("uses honest soft-open copy instead of a checkout CTA when billing is closed", async () => {
    payload = {
      agentId: "bot",
      agentName: "Front Desk",
      phoneProvisionRequested: false,
      phoneProvisioned: false,
      phoneActivationRequired: true,
    };
    stubFetch({ numbers: [], checkoutAvailable: false });
    await mount();
    const tree = render();
    expect(button("Choose a number")).toBeUndefined();
    expect(text(tree)).toContain("Live activation is paused");
    expect(text(tree)).toContain("Use Set Up to try your Bot privately.");
    expect(text(tree)).not.toContain("Every paid plan includes a US number");
    expect(text(tree)).not.toContain("Choose your plan");
    expect(text(tree)).not.toContain("Starter begins at $19/mo");
    const contact = elements(tree).find(
      (element) => element.type === "a" && text(element) === "Contact support",
    );
    expect(contact?.props.to).toBe("/contact?topic=billing");
  });

  it("keeps the paid-plan CTA when self-serve checkout is available", async () => {
    payload = {
      agentId: "bot",
      agentName: "Front Desk",
      phoneProvisionRequested: false,
      phoneProvisioned: false,
      phoneActivationRequired: true,
    };
    stubFetch({ numbers: [], checkoutAvailable: true });
    await mount();
    expect(text(render())).toContain("Choose your plan");
    const plan = elements(render()).find(
      (element) => element.type === "a" && text(element) === "Choose your plan",
    );
    expect(plan?.props.to).toBe("/settings/billing");
    expect(text(render())).not.toContain("Live activation is paused");
  });
});

it("email-only activation has no phone prerequisite or invented live milestone", async () => {
  h.channels = ["email"];
  payload = {
    agentId: "bot",
    agentName: "Email Bot",
    phoneProvisionRequested: false,
    phoneProvisioned: false,
    phoneActivationRequired: true,
  };
  stubFetch({ numbers: [] });
  await mount();
  expect(text(render())).toContain("Open Email");
  expect(text(render())).not.toContain("No phone number");
  expect(button("Choose a number")).toBeUndefined();
  button("Finish for Now")?.props.onClick?.();
  expect(text(render())).toContain("Your Bot Is Saved");
  expect(h.event.mock.calls.some(([event]) => event.event === "agent_launch_completed")).toBe(
    false,
  );
});
