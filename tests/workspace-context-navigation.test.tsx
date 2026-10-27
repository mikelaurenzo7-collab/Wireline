import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PhoneSetupPanel from "../src/components/PhoneSetupPanel";
import StudioAgentReviewPanel from "../src/components/StudioAgentReviewPanel";
import StudioWorkroom from "../src/components/StudioWorkroom";
import KnowledgePage, { KnowledgeEditor } from "../src/pages/KnowledgePage";

vi.mock("../src/hooks/useChannelEntitlements", () => ({
  useChannelEntitlements: () => ({
    status: "ready",
    data: { channels: ["voice", "email", "sms"] },
    includes: () => true,
    retry: vi.fn(),
  }),
}));
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
  refreshAgents: vi.fn(),
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
  useImperativeHandle: (ref: { current: unknown } | null, create: () => unknown) => {
    if (ref) ref.current = create();
  },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));
vi.mock("react-router", () => ({
  Link: "a",
  Navigate: "redirect",
  useLocation: () => ({ hash: "" }),
  useSearchParams: () => [h.params, vi.fn()],
  useNavigate: () => h.navigate,
}));
vi.mock("../src/contexts/AgentsContext", () => ({
  AGENTS_CHANGED_EVENT: "wireline:agents-changed",
  useAgents: () => ({
    agents: h.agents,
    loading: h.agentsLoading,
    degraded: false,
    refresh: h.refreshAgents,
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
  externallyBusy?: boolean;
  onInteractionChange?: (busy: boolean) => void;
  onImportingChange?: (busy: boolean) => void;
  onImported?: () => void;
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
  await button("Find Numbers").props.onClick!();
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
  h.refreshAgents.mockReset();
  vi.stubGlobal("window", {
    localStorage: { getItem: () => "bot-b" },
    setTimeout,
    clearTimeout,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Bot context across workspace pages", () => {
  it("keeps Bot scope when an old Knowledge Reports bookmark opens Calls", () => {
    h.params = new URLSearchParams({ agent: "missing-bot", tab: "reports" });
    const redirect = elements(render(KnowledgePage)).find((node) => node.type === "redirect");
    expect(redirect?.props.to).toBe("/phone?agent=missing-bot&tab=reports");
  });
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
          onRehearse: vi.fn(),
        }),
      );
      const links = elements(tree)
        .filter((node) => node.type === "a")
        .map((node) => node.props.to);
      expect(links).toContain(`/phone?tab=${connected ? "logs" : "setup"}&agent=bot-b`);
      expect(links).toContain("/phone?tab=lines&agent=bot-b#company-identity");
    },
  );

  it.each(["", "bot-a"])(
    "uses a valid shared Bot for Knowledge, import and testing (requested: %s)",
    (requested) => {
      if (requested) h.params.set("agent", requested);
      const expected = requested === "bot-a" ? "bot-a" : "bot-b";
      const nodes = elements(render(KnowledgePage));
      expect(nodes.find((node) => node.type === KnowledgeEditor)?.props.agentId).toBe(expected);
      const editorNodes = elements(render(() => KnowledgeEditor({ agentId: expected })));
      for (const type of ["knowledge-base", "website-import"]) {
        expect(editorNodes.find((node) => node.type === type)?.props.agentId).toBe(expected);
      }
      expect(nodes.find((node) => node.type === "select")?.props.value).toBe(expected);
      expect(nodes.find((node) => text(node) === "Try It" && node.type === "a")?.props.to).toBe(
        `/studio?agent=${expected}&workroom=test`,
      );
    },
  );

  it("blocks knowledge edits for an unavailable Bot deep link until the owner chooses one", () => {
    h.params = new URLSearchParams({ agent: "deleted-bot" });
    const nodes = elements(render(KnowledgePage));
    expect(nodes.find((node) => node.type === KnowledgeEditor)).toBeUndefined();
    expect(nodes.find((node) => node.type === "notice")?.props.title).toBe("Bot Unavailable");
    expect(nodes.find((node) => node.type === "select")?.props.value).toBe("");
    expect(nodes.some((node) => node.type === "option" && node.props.value === "bot-a")).toBe(true);
    expect(
      nodes.find((node) => text(node) === "Rehearse in Studio" && node.type === "a"),
    ).toBeUndefined();
  });

  it("coordinates website import with open Knowledge drafts and its refresh", () => {
    const editor = () => elements(render(() => KnowledgeEditor({ agentId: "bot-a" })));
    const base = () => editor().find((node) => node.type === "knowledge-base")!;
    const website = () => editor().find((node) => node.type === "website-import")!;
    expect(website().props.disabled).toBe(true);
    base().props.onInteractionChange!(false);
    expect(website().props.disabled).toBe(false);
    base().props.onInteractionChange!(true);
    expect(website().props.disabled).toBe(true);
    const before = base().key;
    base().props.onInteractionChange!(false);
    website().props.onImportingChange!(true);
    expect(base().props.externallyBusy).toBe(true);
    expect(base().key).toBe(before);
    website().props.onImported!();
    expect(base().key).not.toBe(before);
    base().props.onInteractionChange!(true);
    website().props.onImportingChange!(false);
    expect(base().props.externallyBusy).toBe(false);
    expect(website().props.disabled).toBe(true);
    base().props.onInteractionChange!(false);
    expect(website().props.disabled).toBe(false);
  });

  it("opens the selected Bot's line without overriding manual line or form choices on roster refresh", async () => {
    await loadLines();
    expect(text(selectedLine())).toContain("Bravo");
    button("Add Line").props.onClick!();
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
    button("Add Line").props.onClick!();
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
    button("Add Line").props.onClick!();
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
    expect(button("Add Line")).toBeDefined();
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
    button("Add Line").props.onClick!();
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

  it("does not imply Stripe Checkout after the server requires activation while sales are closed", async () => {
    await loadLines([], false);
    expect(button("Find Numbers")).toBeDefined();
    h.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: "ACTIVATION_REQUIRED", error: "Activate a paid plan." }),
        {
          status: 402,
        },
      ),
    );
    await button("Find Numbers").props.onClick!();
    await vi.waitFor(() =>
      expect(text(phone())).toContain("Live activation isn't available right now"),
    );
    const tree = phone();
    expect(text(tree)).toContain("Live activation isn't available right now");
    expect(text(tree)).toContain("Keep trying your Bot privately in Set Up, then check back soon.");
    expect(
      elements(tree).some((node) => node.type === "button" && text(node) === "Activate Line"),
    ).toBe(false);
    expect(text(tree)).not.toContain("Choose a Calls");
    const contact = elements(tree).find(
      (node) => node.type === "a" && node.props.to === "/contact?topic=billing",
    );
    expect(text(contact)).toBe("Contact support");
    expect(elements(tree).some((node) => node.type === "a" && text(node) === "Open Billing")).toBe(
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
            error:
              "Choose a Calls, Email, or Calls + Email plan in Billing before connecting a number.",
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
        elements(phone()).some((node) => node.type === "a" && text(node) === "Open Billing"),
      ).toBe(true);
    });
    const billing = elements(phone()).find(
      (node) => node.type === "a" && text(node) === "Open Billing",
    );
    expect(billing?.props.to).toBe("/settings/billing");
    expect(text(phone())).toContain("Choose a Calls, Email, or Calls + Email plan");
  });
});

describe("phone mutations refresh the shared roster", () => {
  it("refreshes shared phone status after purchase even if the panel reload fails", async () => {
    await loadLines([]);
    h.fetch.mockImplementation(async (path: string) => {
      if (path.endsWith("/available"))
        return new Response(
          JSON.stringify({ available: [{ phone_number: lines[1].phone_number }] }),
        );
      if (path.endsWith("/provision"))
        return new Response(JSON.stringify({ ok: true, phone_number: lines[1].phone_number }));
      return new Response(JSON.stringify({ error: "Line reload unavailable" }), { status: 503 });
    });
    await selectNumber();
    button("Activate Line").props.onClick!();
    await vi.waitFor(() => expect(h.refreshAgents).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(text(phone())).toContain("Line reload unavailable"));
  });

  it.each(["bot-a", null])("refreshes after confirmed assignment to %s", async (agentId) => {
    await loadLines();
    h.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, number: { id: "line-b", agentId } })),
    );
    const assignment = elements(phone()).find(
      (node) =>
        node.type === "select" &&
        elements(node).some((child) => child.props["aria-label"] === "Assigned Bot"),
    )!;
    assignment.props.onValueChange!(agentId ?? "__unassigned__");
    await vi.waitFor(() => expect(h.refreshAgents).toHaveBeenCalledOnce());
    expect(text(selectedLine())).toContain(agentId ? "Alpha" : "Unassigned");
    expect(JSON.parse(h.fetch.mock.calls.at(-1)![1].body)).toEqual({ agent_id: agentId });
  });

  it.each(["rejected", "unconfirmed"])("preserves shared state after %s purchase", async (kind) => {
    await loadLines([]);
    h.fetch.mockImplementation(async (path: string) =>
      path.endsWith("/available")
        ? new Response(JSON.stringify({ available: [{ phone_number: lines[1].phone_number }] }))
        : new Response(JSON.stringify(kind === "rejected" ? { error: "Purchase rejected" } : {}), {
            status: kind === "rejected" ? 409 : 200,
          }),
    );
    await selectNumber();
    button("Activate Line").props.onClick!();
    await vi.waitFor(() =>
      expect(text(phone())).toContain(
        kind === "rejected" ? "Purchase rejected" : "could not be confirmed",
      ),
    );
    expect(h.refreshAgents).not.toHaveBeenCalled();
    expect(formBot().props.value).toBe("bot-b");
  });

  it.each(["rejected", "unconfirmed"])("preserves assignment after %s update", async (kind) => {
    await loadLines();
    h.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          kind === "rejected"
            ? { error: "Assignment rejected" }
            : { success: true, number: { id: "line-b", agentId: "bot-b" } },
        ),
        { status: kind === "rejected" ? 409 : 200 },
      ),
    );
    const assignment = elements(phone()).find(
      (node) =>
        node.type === "select" &&
        elements(node).some((child) => child.props["aria-label"] === "Assigned Bot"),
    )!;
    assignment.props.onValueChange!("bot-a");
    await vi.waitFor(() =>
      expect(text(phone())).toContain(
        kind === "rejected" ? "Assignment rejected" : "could not be confirmed",
      ),
    );
    expect(h.refreshAgents).not.toHaveBeenCalled();
    expect(text(selectedLine())).toContain("Bravo");
  });
});

describe("Workroom setup and rehearsal flow", () => {
  it.each([undefined, "Book an appointment."])(
    "keeps rehearsal voice-only without loading or changing configuration for command %s",
    (initialCommand) => {
      h.runEffects = true;
      const focus = vi.fn();
      const onDraftChange = vi.fn();
      const handle = { current: null as null | { focusComposer: (text?: string) => void } };
      vi.stubGlobal("document", {
        getElementById: (id: string) => (id === "studio-voice-start-bot-b" ? { focus } : null),
      });
      const workroom = () =>
        render(() =>
          (
            StudioWorkroom as unknown as {
              render: (props: object, ref: typeof handle) => ReactNode;
            }
          ).render(
            {
              agentId: "bot-b",
              agentName: "Bravo",
              mode: "test",
              initialCommand,
              onDraftChange,
              allowOutbound: true,
              initialDraft: {
                text: "Keep this historical customer scenario private.",
                command: null,
                commandNonce: null,
              },
            },
            handle,
          ),
        );
      const initial = elements(workroom());
      expect(initial.some((node) => node.type === "textarea")).toBe(false);
      expect(initial.some((node) => node.props["aria-label"] === "Bravo voice rehearsal")).toBe(
        true,
      );
      expect(
        initial.some(
          (node) => typeof node.type === "function" && node.type.name === "StudioVoiceRehearsal",
        ),
      ).toBe(true);
      expect(initial.some((node) => node.props["aria-label"] === "Call My Phone")).toBe(true);
      expect(text(initial)).not.toContain("Typed");
      expect(text(initial)).not.toContain("Keep this historical customer scenario private.");
      focus.mockClear();
      handle.current!.focusComposer("This must never become an edit.");
      expect(elements(workroom()).some((node) => node.type === "textarea")).toBe(false);
      expect(focus).toHaveBeenCalledOnce();
      expect(onDraftChange).not.toHaveBeenCalled();
      expect(h.fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    { draft: "Keep this customer scenario.", expected: "Keep this customer scenario." },
    { draft: "", expected: "Suggested customer question" },
    { draft: "  ", expected: "Suggested customer question" },
  ])(
    "focuses the configuration composer without replacing the existing draft: $draft",
    ({ draft, expected }) => {
      const frames: Array<() => void> = [];
      vi.stubGlobal("requestAnimationFrame", (callback: () => void) => frames.push(callback));
      const handle = { current: null as null | { focusComposer: (text?: string) => void } };
      const workroom = () =>
        render(() =>
          (
            StudioWorkroom as unknown as {
              render: (props: object, ref: typeof handle) => ReactNode;
            }
          ).render(
            {
              agentId: "bot-b",
              agentName: "Bravo",
              mode: "configure",
              initialDraft: { text: draft, command: null, commandNonce: null },
            },
            handle,
          ),
        );
      workroom();
      handle.current!.focusComposer("Suggested customer question");
      const composer = elements(workroom()).find(
        (node) => node.props.id === "studio-workroom-message",
      )!;
      expect(composer.props.value).toBe(expected);
      expect((composer.props as Props & { "data-resize": string })["data-resize"]).toBe("none");
      const focus = vi.fn();
      (composer.props as Props & { ref: { current: unknown } }).ref.current = { focus };
      frames.splice(0).forEach((frame) => frame());
      expect(focus).toHaveBeenCalledOnce();
    },
  );

  it("keeps setup and private rehearsal in one workspace and restores focus after switching", () => {
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
    const all = () => elements(workroom());
    const action = (label: string) =>
      all().find((node) => node.type === "button" && text(node) === label)!;

    // Instructions and Try It are two views of one Set Up job, not tabs to separate pages.
    expect(all().some((node) => node.props.role === "tablist")).toBe(false);
    expect(all().find((node) => node.props.role === "group")?.props["aria-label"]).toBe(
      "Set Up view",
    );
    expect(action("Instructions").props["aria-pressed"]).toBe(true);
    const tryFocus = vi.fn();
    focused.set("studio-workroom-bot-b-mode-test", tryFocus);
    action("Try It").props.onClick!();
    frames.splice(0).forEach((frame) => frame());
    expect(changed).toHaveBeenLastCalledWith("test");
    expect(tryFocus).toHaveBeenCalledOnce();
    expect(action("Try It").props["aria-pressed"]).toBe(true);

    const changeFocus = vi.fn();
    focused.set("studio-workroom-bot-b-mode-configure", changeFocus);
    action("Instructions").props.onClick!();
    frames.splice(0).forEach((frame) => frame());
    expect(changed).toHaveBeenLastCalledWith("configure");
    expect(changeFocus).toHaveBeenCalledOnce();
  });
});
