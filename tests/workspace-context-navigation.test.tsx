import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PhoneSetupPanel from "../src/components/PhoneSetupPanel";
import StudioAgentReviewPanel from "../src/components/StudioAgentReviewPanel";
import StudioWorkroom from "../src/components/StudioWorkroom";
import KnowledgePage from "../src/pages/KnowledgePage";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  dependencies: [] as Array<readonly unknown[]>,
  effects: [] as Array<() => unknown>,
  stateCursor: 0,
  refCursor: 0,
  effectCursor: 0,
  dirty: false,
  runEffects: false,
  agents: [
    { id: "bot-a", name: "Alpha" },
    { id: "bot-b", name: "Bravo" },
  ],
  agentsLoading: false,
  params: new URLSearchParams(),
  preferred: "bot-b",
  fetch: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = typeof initial === "function" ? initial() : initial;
    return [
      h.states[index],
      (next: unknown) => {
        const value = typeof next === "function" ? next(h.states[index]) : next;
        if (!Object.is(value, h.states[index])) h.dirty = true;
        h.states[index] = value;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
  useEffect(effect: () => unknown, dependencies: readonly unknown[]) {
    const index = h.effectCursor++;
    const previous = h.dependencies[index];
    h.dependencies[index] = dependencies;
    if (
      h.runEffects &&
      (!previous || dependencies.some((value, i) => !Object.is(value, previous[i])))
    ) {
      h.effects.push(effect);
    }
  },
  useMemo: (factory: () => unknown) => factory(),
  useCallback: (callback: unknown) => callback,
  useImperativeHandle: () => {},
}));
vi.mock("react-router", () => ({
  Link: "a",
  useLocation: () => ({ hash: "" }),
  useSearchParams: () => [h.params, vi.fn()],
  useNavigate: () => h.navigate,
}));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({
    agents: h.agents,
    loading: h.agentsLoading,
    degraded: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/hooks/useStreamingChat", () => ({
  useStreamingChat: () => ({ state: { phase: "idle" }, send: vi.fn(), reset: vi.fn() }),
}));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  EmptyState: "empty-state",
  NativeSelect: "select",
  Skeleton: "skeleton",
}));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));
vi.mock("../src/components/ui/shadcn/Select", () => ({
  Select: "select",
  SelectContent: "options",
  SelectItem: "option",
  SelectTrigger: "trigger",
  SelectValue: "value",
}));
vi.mock("../src/components/settings/CompanyIdentityPack", () => ({ default: "company-identity" }));
vi.mock("../src/components/AgentFace", () => ({ default: "agent-face" }));
vi.mock("../src/components/OutboundDialDialog", () => ({ default: "outbound-dialog" }));
vi.mock("../src/components/layout/WorkspaceControlBand", () => ({ default: "control-band" }));
vi.mock("../src/components/layout/WorkspacePageFrame", () => ({
  WorkspacePageFrame: "page-frame",
  WorkspacePageIntro: "page-intro",
}));
vi.mock("../src/components/layout/WorkspaceTabStrip", () => ({ WorkspaceTabStrip: "tab-strip" }));
vi.mock("../src/components/WorkspaceShell", () => ({ default: "workspace-shell" }));
vi.mock("../src/components/WorkspaceRecovery", () => ({ default: "workspace-recovery" }));
vi.mock("../src/components/KnowledgeBaseClaude", () => ({ default: "knowledge-base" }));
vi.mock("../src/components/training/ReportingPreferences", () => ({
  default: "reporting-preferences",
}));
vi.mock("../src/components/training/RecentCallArtifactRequests", () => ({
  default: "call-artifacts",
}));
vi.mock("../src/components/training/WebsiteKnowledgeImport", () => ({ default: "website-import" }));

type Props = {
  children?: ReactNode;
  action?: ReactNode;
  secondary?: ReactNode;
  id?: string;
  role?: string;
  to?: string;
  title?: string;
  agentId?: string;
  value?: string;
  disabled?: boolean;
  tabIndex?: number;
  "aria-label"?: string;
  "aria-selected"?: boolean;
  "aria-pressed"?: boolean;
  "aria-controls"?: string;
  "aria-labelledby"?: string;
  onClick?: () => unknown;
  onValueChange?: (value: string) => void;
  onChange?: () => void;
  type?: string;
  onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
};
function expand(node: ReactElement<Props>): ReactNode {
  return typeof node.type === "function" && node.type.name === "SoftOpenCheckoutNote"
    ? (node.type as (props: { detail?: string }) => ReactNode)(node.props as { detail?: string })
    : node.props.children;
}
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [
    node,
    ...elements(expand(node)),
    ...elements(node.props.action),
    ...elements(node.props.secondary),
  ];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(expand(node));
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function render(component: () => ReactNode): ReactNode {
  let tree: ReactNode;
  let renders = 0;
  do {
    h.dirty = false;
    h.stateCursor = 0;
    h.refCursor = 0;
    h.effectCursor = 0;
    tree = component();
    h.effects.splice(0).forEach((effect) => effect());
    if (++renders > 10) throw new Error("Component did not settle");
  } while (h.dirty);
  return tree;
}
function phone() {
  return render(() => PhoneSetupPanel({ initialAgentId: h.preferred }));
}
function button(label: string) {
  return elements(phone()).find((node) => node.type === "button" && text(node) === label)!;
}
async function selectNumber() {
  await button("Find numbers").props.onClick!();
  await vi.waitFor(() =>
    expect(elements(phone()).some((node) => node.props.type === "radio")).toBe(true),
  );
  elements(phone()).find((node) => node.props.type === "radio")!.props.onChange!();
}
function formBot() {
  return elements(phone()).find(
    (node) =>
      node.type === "select" &&
      elements(node).some((child) => child.props["aria-label"] === "Bot for this line"),
  )!;
}
const lines = [
  { id: "line-a", agent_id: "bot-a", phone_number: "+13125550101" },
  { id: "line-b", agent_id: "bot-b", phone_number: "+13125550102" },
];
async function loadLines(numbers = lines, checkoutAvailable = true) {
  h.runEffects = true;
  h.fetch.mockImplementation(async (path: string) => {
    if (path === "/api/billing/plans") {
      return new Response(
        JSON.stringify({
          checkout_available: checkoutAvailable,
          stripe_configured: true,
          plans: [],
        }),
      );
    }
    return new Response(JSON.stringify({ numbers }));
  });
  phone();
  await vi.waitFor(() => expect(text(phone())).not.toContain("Loading lines…"));
}
function selectedLine() {
  return elements(phone()).find(
    (node) => node.type === "button" && node.props["aria-pressed"] === true,
  );
}

beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.dependencies = [];
  h.effects = [];
  h.runEffects = false;
  h.agents = [
    { id: "bot-a", name: "Alpha" },
    { id: "bot-b", name: "Bravo" },
  ];
  h.agentsLoading = false;
  h.params = new URLSearchParams();
  h.preferred = "bot-b";
  h.fetch.mockReset();
  h.navigate.mockReset();
  vi.stubGlobal("window", { localStorage: { getItem: () => "bot-b" }, setTimeout, clearTimeout });
});
afterEach(() => vi.unstubAllGlobals());

describe("Bot context across workspace pages", () => {
  it.each([
    ["voice", "setup"],
    ["flows", "setup"],
    ["simulator", "test"],
  ])("preserves the requested Bot on a cold legacy %s redirect", (tab, section) => {
    h.params = new URLSearchParams({ agent: "bot-b", tab });
    h.agents = [];
    h.agentsLoading = true;
    h.runEffects = true;
    render(KnowledgePage);
    expect(h.navigate).toHaveBeenCalledWith(`/studio?agent=bot-b&section=${section}`, {
      replace: true,
    });
  });

  it.each([true, false])(
    "keeps the reviewed Bot in Calls and caller identity links (connected: %s)",
    (connected) => {
      const tree = render(() =>
        StudioAgentReviewPanel({
          agentId: "bot-b",
          agentName: "Bravo",
          phoneNumber: connected ? "+13125550102" : null,
          onEdit: vi.fn(),
          onTest: vi.fn(),
        }),
      );
      const links = elements(tree)
        .filter((node) => node.type === "a")
        .map((node) => node.props.to);
      expect(links).toContain(`/phone?tab=${connected ? "logs" : "setup"}&agent=bot-b`);
      expect(links).toContain("/phone?tab=setup&agent=bot-b#company-identity");
    },
  );

  it.each(["", "deleted-bot", "bot-a"])(
    "uses a valid shared Bot for Knowledge, import and testing (requested: %s)",
    (requested) => {
      if (requested) h.params.set("agent", requested);
      const expected = requested === "bot-a" ? "bot-a" : "bot-b";
      const nodes = elements(render(KnowledgePage));
      for (const type of ["knowledge-base", "website-import"]) {
        expect(nodes.find((node) => node.type === type)?.props.agentId).toBe(expected);
      }
      expect(nodes.find((node) => node.type === "select")?.props.value).toBe(expected);
      expect(
        nodes.find((node) => text(node) === "Test in Studio" && node.type === "a")?.props.to,
      ).toBe(`/studio?agent=${expected}&section=test`);
    },
  );

  it("opens the selected Bot's line without overriding manual line or form choices on roster refresh", async () => {
    await loadLines();
    expect(text(selectedLine())).toContain("Bravo");
    button("Add line").props.onClick!();
    expect(formBot().props.value).toBe("bot-b");
    formBot().props.onValueChange!("bot-a");
    elements(phone()).find((node) => node.type === "button" && text(node).includes("Alpha"))!.props
      .onClick!();
    h.agents = h.agents.map((agent) => ({ ...agent }));
    expect(formBot().props.value).toBe("bot-a");
    expect(text(selectedLine())).toContain("Alpha");
    h.preferred = "bot-a";
    phone();
    h.preferred = "bot-b";
    expect(formBot()).toBeUndefined();
    button("Add line").props.onClick!();
    expect(formBot().props.value).toBe("bot-b");
    expect(text(selectedLine())).toContain("Bravo");
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it("applies Studio context when the Bot roster loads after line inventory", async () => {
    h.agents = [];
    h.agentsLoading = true;
    await loadLines();
    h.agents = [
      { id: "bot-a", name: "Alpha" },
      { id: "bot-b", name: "Bravo" },
    ];
    h.agentsLoading = false;
    expect(text(selectedLine())).toContain("Bravo");
    button("Add line").props.onClick!();
    expect(formBot().props.value).toBe("bot-b");
  });

  it("lets the first-line form close without provisioning", async () => {
    await loadLines([]);
    expect(formBot().props.value).toBe("bot-b");
    expect(button("Activate Line").props.disabled).toBe(true);
    expect(text(phone())).toContain("Area Code (Optional)");
    button("Cancel").props.onClick!();
    expect(elements(phone()).some((node) => node.props["aria-label"] === "Add phone line")).toBe(
      false,
    );
    expect(button("Add line")).toBeDefined();
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it("opens setup for a reviewed Bot without a line and preserves a manual cancellation", async () => {
    h.agents.push({ id: "bot-c", name: "Charlie" });
    h.preferred = "bot-c";
    await loadLines();
    expect(formBot().props.value).toBe("bot-c");
    expect(button("Activate Line").props.disabled).toBe(true);
    button("Cancel").props.onClick!();
    h.agents = h.agents.map((agent) => ({ ...agent }));
    expect(formBot()).toBeUndefined();

    h.preferred = "bot-b";
    expect(text(selectedLine())).toContain("Bravo");
    expect(formBot()).toBeUndefined();
    h.preferred = "bot-c";
    expect(formBot().props.value).toBe("bot-c");
    h.preferred = "bot-b";
    expect(formBot()).toBeUndefined();
    expect(text(selectedLine())).toContain("Bravo");
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps provisioning focused on the chosen Bot even when Studio initially selected another", async () => {
    await loadLines();
    button("Add line").props.onClick!();
    formBot().props.onValueChange!("bot-a");
    h.fetch.mockImplementation(
      async (path: string, options?: RequestInit) =>
        new Response(
          JSON.stringify(
            path === "/api/phone-numbers/available"
              ? { available: [{ phone_number: "+13125550101" }] }
              : options?.method === "POST"
                ? { ok: true, phone_number: "+13125550101" }
                : { numbers: lines },
          ),
        ),
    );
    await selectNumber();
    await button("Activate Line").props.onClick!();
    await vi.waitFor(() => expect(text(selectedLine())).toContain("Alpha"));
    const request = h.fetch.mock.calls.find(([path]) => path === "/api/phone-numbers/provision");
    expect(JSON.parse(String(request?.[1].body))).toEqual({
      agent_id: "bot-a",
      phone_number: "+13125550101",
    });
  });

  it("does not imply Stripe Checkout when self-serve billing is closed", async () => {
    await loadLines([], false);
    const tree = phone();
    expect(text(tree)).toContain("Live activation is paused");
    expect(text(tree)).toContain("Use Studio for private testing.");
    expect(
      elements(tree).some((node) => node.type === "button" && text(node) === "Activate Line"),
    ).toBe(false);
    expect(text(tree)).not.toContain("Choose Starter");
    const contact = elements(tree).find(
      (node) => node.type === "a" && node.props.to === "/contact?topic=billing",
    );
    expect(text(contact)).toBe("Contact support");
    expect(elements(tree).some((node) => node.type === "a" && text(node) === "Open billing")).toBe(
      false,
    );
    expect(elements(tree).some((node) => node.type === "notice")).toBe(false);
  });

  it("keeps the billing recovery CTA when checkout is available", async () => {
    await loadLines([]);
    h.fetch.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/api/phone-numbers/provision" && options?.method === "POST") {
        return new Response(
          JSON.stringify({
            ok: false,
            code: "ACTIVATION_REQUIRED",
            error: "Choose Starter, Starter Plus, or Pro before connecting a production number.",
            recovery_path: "/settings/billing",
          }),
          { status: 402 },
        );
      }
      if (path === "/api/billing/plans") {
        return new Response(
          JSON.stringify({ checkout_available: true, stripe_configured: true, plans: [] }),
        );
      }
      if (path === "/api/phone-numbers/available")
        return new Response(JSON.stringify({ available: [{ phone_number: "+13125550101" }] }));
      return new Response(JSON.stringify({ numbers: [] }));
    });
    await selectNumber();
    await button("Activate Line").props.onClick!();
    await vi.waitFor(() => {
      expect(
        elements(phone()).some((node) => node.type === "a" && text(node) === "Open billing"),
      ).toBe(true);
    });
    const billing = elements(phone()).find(
      (node) => node.type === "a" && text(node) === "Open billing",
    );
    expect(billing?.props.to).toBe("/settings/billing");
    expect(text(phone())).toContain("Choose Starter");
  });
});

describe("Workroom mode keyboard navigation", () => {
  it("connects tabs to the active panel and preserves focus after a mode remount", () => {
    const frames: Array<() => void> = [];
    const focused = new Map<string, ReturnType<typeof vi.fn>>();
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => frames.push(callback));
    vi.stubGlobal("document", { getElementById: (id: string) => ({ focus: focused.get(id) }) });
    let mode: "configure" | "test" = "configure";
    const changed = vi.fn((next: "configure" | "test") => {
      mode = next;
    });
    const workroom = () =>
      render(() =>
        (
          StudioWorkroom as unknown as {
            render: (props: object, ref: null) => ReactNode;
          }
        ).render(
          { agentId: "bot-b", agentName: "Bravo", mode, onModeChange: changed, layout: "split" },
          null,
        ),
      );
    const tab = (label: string) =>
      elements(workroom()).find((node) => node.props.role === "tab" && text(node) === label)!;
    const assertActive = (label: string) => {
      const active = tab(label);
      const panel = elements(workroom()).find((node) => node.props.role === "tabpanel")!;
      expect(active.props["aria-selected"]).toBe(true);
      expect(active.props.tabIndex).toBe(0);
      expect(active.props["aria-controls"]).toBe(panel.props.id);
      expect(panel.props["aria-labelledby"]).toBe(active.props.id);
      return active;
    };
    assertActive("Build");
    expect(tab("Test").props.tabIndex).toBe(-1);
    for (const [key, from, to] of [
      ["ArrowRight", "Build", "Test"],
      ["ArrowLeft", "Test", "Build"],
      ["End", "Build", "Test"],
      ["Home", "Test", "Build"],
    ]) {
      const preventDefault = vi.fn();
      tab(from).props.onKeyDown!({ key, preventDefault });
      const active = assertActive(to);
      const focus = vi.fn();
      focused.set(active.props.id!, focus);
      frames.splice(0).forEach((frame) => frame());
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(focus).toHaveBeenCalledOnce();
    }
    const preventDefault = vi.fn();
    tab("Build").props.onKeyDown!({ key: "Tab", preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(4);
  });
});
