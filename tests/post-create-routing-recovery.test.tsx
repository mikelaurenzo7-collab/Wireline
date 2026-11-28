import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BoOnboarding from "../src/components/onboarding/BoOnboarding";
import { readBoOnboarding, writeBoOnboarding } from "../src/lib/bo-onboarding";
import { resolveAppPageSubTabId, resolveAppPageSubTabRoute } from "../src/lib/page-sub-tabs";

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
  effects: [] as Array<() => unknown>,
  mounting: true,
  fetch: vi.fn(),
  event: vi.fn(),
  navigate: vi.fn(),
  flow: vi.fn(),
  bootstrap: vi.fn(),
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
  useEffect: (effect: () => unknown) => {
    if (h.mounting) h.effects.push(effect);
  },
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("react-router", () => ({
  useNavigate: () => h.navigate,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({
    agents: [{ id: "bot", name: "Bo", mark_key: null, channel: "voice" }],
    loading: false,
    degraded: false,
    rememberCreatedAgent: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch, safeJson: vi.fn() }));
vi.mock("../src/lib/bot-identity-bootstrap", () => ({ bootstrapManagedBotIdentity: h.bootstrap }));
vi.mock("../src/lib/product-event-client", () => ({
  emitProductEvent: h.event,
  emitProductEventOnce: h.event,
}));
vi.mock("../src/lib/post-signup-onboarding", () => ({ setPostSignupFlowActive: h.flow }));
vi.mock("../src/lib/signup-intent", () => ({
  choosePlanHref: () => "/settings/billing?plan=starter",
  getStoredSignupIntent: () => null,
}));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  Input: "input",
  Textarea: "textarea",
}));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "aside" }));
vi.mock("../src/components/BotMark", () => ({ default: "span" }));

type Props = { children?: ReactNode; onClick?: () => unknown };
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function render() {
  h.stateCursor = 0;
  h.refCursor = 0;
  return BoOnboarding({});
}
function button(label: string) {
  return elements(render()).find((element) => element.type === "button" && text(element) === label);
}
let cleanups: unknown[];
function mount() {
  render();
  h.mounting = false;
  cleanups = h.effects.map((effect) => effect());
}
beforeEach(() => {
  h.channels = ["voice", "email", "sms"];
  vi.clearAllMocks();
  h.states = [];
  h.refs = [];
  h.effects = [];
  h.mounting = true;
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  // Bo was created and has asked its four questions; the owner picks what is next.
  writeBoOnboarding("owner", { agentId: "bot", step: "done" });
  cleanups = [];
});
afterEach(() => {
  for (const cleanup of cleanups) if (typeof cleanup === "function") cleanup();
  vi.unstubAllGlobals();
});

describe("routing after Bo's first conversation", () => {
  it("opens Lines for the chosen Bot when calling is included, without buying a number", () => {
    mount();
    expect(text(render())).toContain("That's a great start.");
    button("Get a Number")?.props.onClick?.();
    expect(h.navigate).toHaveBeenCalledWith("/phone?tab=lines&agent=bot");
    expect(h.flow).toHaveBeenLastCalledWith(false);
    expect(readBoOnboarding("owner")).toBeNull();
    const phoneRoute = resolveAppPageSubTabRoute("/phone");
    expect(phoneRoute).toBeDefined();
    expect(resolveAppPageSubTabId(phoneRoute!, "lines")).toBe("lines");
    // Older Phone links still say tab=setup; they open the same Lines tab.
    expect(resolveAppPageSubTabId(phoneRoute!, "setup")).toBe("lines");
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.bootstrap).not.toHaveBeenCalled();
    expect(h.event).not.toHaveBeenCalled();
  });

  it.each<[string, string[]]>([
    ["email only", ["email"]],
    ["no channels yet", []],
  ])(
    "sends an account with %s to the plan choice, with no phone prerequisite or invented live milestone",
    (_label, channels) => {
      h.channels = channels;
      mount();
      button("Get a Number")?.props.onClick?.();
      expect(h.navigate).toHaveBeenCalledWith("/settings/billing?plan=starter");
      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.event).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["Hear Me", "/studio?agent=bot&workroom=test"],
    ["Pick My Voice", "/studio?agent=bot&section=setup#voice"],
    ["Start Chatting", "/studio?agent=bot"],
  ])("keeps the chosen Bot when %s opens the Workspace", (label, destination) => {
    mount();
    button(label)?.props.onClick?.();
    expect(h.navigate).toHaveBeenCalledWith(destination);
    expect(readBoOnboarding("owner")).toBeNull();
  });
});
