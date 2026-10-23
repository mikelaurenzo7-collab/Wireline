import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OutboundDialDialog from "../src/components/OutboundDialDialog";
import OutboundHub from "../src/components/outbound/OutboundHub";
import { authFetch } from "../src/lib/api";
import { readPendingOutboundDial } from "../src/lib/outbound-dial-recovery";

type Hook = {
  value?: unknown;
  deps?: readonly unknown[];
  cleanup?: (() => void) | void;
};
const harness = vi.hoisted(() => ({
  hooks: [] as Hook[],
  cursor: 0,
  effects: [] as Array<() => void>,
  agents: [
    {
      id: "bot-1",
      name: "Personal Assistant",
      role: "personal_assistant",
      is_business_agent: false,
      phone_number: "+13125550124",
      channel: "voice",
    },
  ],
}));
function sameDeps(left: readonly unknown[] | undefined, right: readonly unknown[] | undefined) {
  return (
    !!left &&
    !!right &&
    left.length === right.length &&
    left.every((v, i) => Object.is(v, right[i]))
  );
}

// Run the real public component, its private direct-dialog component, and their
// actual handlers. This small hook driver models state/effect persistence without
// exporting implementation details or enabling the production outbound flag.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    const hook = (harness.hooks[index] ??= {
      value: typeof initial === "function" ? (initial as () => unknown)() : initial,
    });
    return [
      hook.value,
      (next: unknown) => {
        hook.value =
          typeof next === "function" ? (next as (value: unknown) => unknown)(hook.value) : next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const hook = (harness.hooks[harness.cursor++] ??= { value: { current: initial } });
    return hook.value;
  },
  useMemo: (compute: () => unknown, deps: readonly unknown[]) => {
    const index = harness.cursor++;
    let hook = harness.hooks[index];
    if (!hook || !sameDeps(hook.deps, deps))
      hook = harness.hooks[index] = { value: compute(), deps };
    return hook.value;
  },
  useCallback: (callback: unknown, deps: readonly unknown[]) => {
    const index = harness.cursor++;
    let hook = harness.hooks[index];
    if (!hook || !sameDeps(hook.deps, deps))
      hook = harness.hooks[index] = { value: callback, deps };
    return hook.value;
  },
  useEffect: (effect: () => (() => void) | void, deps: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.hooks[index];
    if (previous && sameDeps(previous.deps, deps)) return;
    const hook = (harness.hooks[index] = { deps });
    harness.effects.push(() => {
      previous?.cleanup?.();
      hook.cleanup = effect();
    });
  },
}));
vi.mock("react-router", () => ({ Link: "a" }));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/atoms/Dialog", () => ({
  Dialog: "dialog-root",
  DialogContent: "dialog-content",
  DialogDescription: "dialog-description",
  DialogFooter: "dialog-footer",
  DialogHeader: "dialog-header",
  DialogTitle: "dialog-title",
}));
vi.mock("../src/components/ui/shadcn/Checkbox", () => ({ Checkbox: "input" }));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({ agents: harness.agents, loading: false }),
}));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("../src/contexts/ToastContext", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("../src/lib/api", () => ({ authFetch: vi.fn() }));
vi.mock("../src/lib/product-event-client", () => ({ emitProductEvent: vi.fn() }));
vi.mock("../src/lib/voice-permission-client", () => ({
  loadVoicePermissionWorkspace: async () => ({
    calling: { general: true, nonMarketing: true },
    permissions: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        agent_id: "bot-1",
        purpose: "service_or_requested",
        status: "granted",
        recipient_phone_masked: "•••0123",
      },
    ],
  }),
}));

type Props = {
  children?: ReactNode;
  value?: string;
  open?: boolean;
  initialAgentId?: string;
  "aria-label"?: string;
  disabled?: boolean;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
};
type Node = ReactElement<Props>;
function descendants(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  return isValidElement<Props>(node) ? [node, ...descendants(node.props.children)] : [];
}
const permissionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const close = vi.fn();
const entries = new Map<string, string>();
const store = {
  getItem: (key: string) => entries.get(key) ?? null,
  setItem: (key: string, value: string) => {
    entries.set(key, value);
  },
  removeItem: vi.fn((key: string) => {
    entries.delete(key);
  }),
};
let nextKey = 0;
let postOutcomes: Array<() => Promise<Response>>;
let statusBody: (key: string) => unknown;
let nodes: Node[];

it("opens the reviewed call dialog with the Bot selected in Calls", () => {
  const renderHub = () => {
    harness.cursor = 0;
    return descendants(
      OutboundHub({ activeView: "dispatch", onViewChange: vi.fn(), initialAgentId: "bot-2" }),
    );
  };
  let hub = renderHub();
  expect(hub.find((node) => node.type === OutboundDialDialog)?.props.open).toBe(false);
  const newCall = hub.find(
    (node) => node.type === "button" && node.props["aria-label"] === "New call",
  );
  expect(newCall).toBeDefined();
  newCall!.props.onClick!();
  hub = renderHub();
  expect(hub.find((node) => node.type === OutboundDialDialog)?.props).toMatchObject({
    open: true,
    initialAgentId: "bot-2",
  });
  expect(posts()).toHaveLength(0);
});

function render(open = true) {
  harness.cursor = 0;
  const direct = OutboundDialDialog({
    open,
    onClose: close,
    initialAgentId: "bot-1",
    initialNumber: "+13125550123",
  }) as ReactElement;
  const Component = direct.type as (props: unknown) => ReactNode;
  nodes = descendants(Component(direct.props));
  for (const effect of harness.effects.splice(0)) effect();
  return nodes;
}
async function settle(open = true) {
  for (let round = 0; round < 4; round++) {
    render(open);
    for (let tick = 0; tick < 10; tick++) await Promise.resolve();
  }
  return render(open);
}
function button(label: string) {
  const found = nodes.find((node) => node.type === "button" && node.props.children === label);
  expect(found, `button ${label}`).toBeDefined();
  return found!;
}
function posts() {
  return vi
    .mocked(authFetch)
    .mock.calls.filter(([url, init]) => url === "/api/outbound/dial" && init?.method === "POST");
}
function posted(index: number) {
  return JSON.parse(posts()[index][1]!.body as string) as { requestKey: string; context?: string };
}
function response(status: number, body: unknown = {}) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}
async function prepare() {
  await settle();
  const permission = nodes.find(
    (node) =>
      node.type === "select" &&
      descendants(node.props.children).some((child) => child.props.value === permissionId),
  )!;
  permission.props.onChange!({ target: { value: permissionId } });
  await settle();
  expect(button("Place call").props.disabled).toBe(false);
}
async function place() {
  button("Place call").props.onClick!();
  await settle();
}
function unmount() {
  for (const hook of harness.hooks) hook.cleanup?.();
  harness.hooks = [];
  harness.effects = [];
}

beforeEach(() => {
  unmount();
  harness.agents = [
    {
      id: "bot-1",
      name: "Personal Assistant",
      role: "personal_assistant",
      is_business_agent: false,
      phone_number: "+13125550124",
      channel: "voice",
    },
  ];
  entries.clear();
  close.mockClear();
  store.removeItem.mockReset().mockImplementation((key) => {
    entries.delete(key);
  });
  nextKey = 0;
  postOutcomes = [];
  statusBody = (requestKey) => ({ requestKey, status: "accepted", terminal: false });
  vi.stubGlobal("sessionStorage", store);
  vi.stubGlobal("crypto", {
    randomUUID: () => `${String(++nextKey).padStart(8, "0")}-1111-4111-8111-111111111111`,
  });
  vi.mocked(authFetch)
    .mockReset()
    .mockImplementation(async (url, init) => {
      if (url === "/api/outbound/dial" && init?.method === "POST") {
        const outcome = postOutcomes.shift();
        if (!outcome) throw new Error("Unexpected extra dispatch");
        return outcome();
      }
      const requestKey = String(url).split("/").at(-1)!;
      return new Response(JSON.stringify(statusBody(requestKey)), { status: 200 });
    });
});
afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

describe("direct outbound definitive-refusal retry", () => {
  it("does not substitute a personal Bot for a business Bot named by an existing proposal", async () => {
    harness.agents = [
      {
        id: "bot-1",
        name: "Business Front Desk",
        role: "receptionist",
        is_business_agent: true,
        phone_number: "+13125550124",
        channel: "voice",
      },
      {
        id: "personal-bot",
        name: "Personal Assistant",
        role: "personal_assistant",
        is_business_agent: false,
        phone_number: "+13125550125",
        channel: "voice",
      },
    ];
    await settle();
    const optionLabels = nodes
      .filter((node) => node.type === "option")
      .map((node) => node.props.children)
      .filter((label): label is string => typeof label === "string");
    expect(nodes.some((node) => node.type === "select" && node.props.value === "bot-1")).toBe(true);
    expect(optionLabels).toEqual(
      expect.arrayContaining(["Business Front Desk", "Personal Assistant"]),
    );
    expect(optionLabels).not.toContain("Marketing or sales");
    expect(button("Place call").props.disabled).toBe(true);
    button("Place call").props.onClick!();
    await settle();
    expect(posts()).toHaveLength(0);
    expect(entries.size).toBe(0);
  });

  it.each([400, 403, 409, 429])(
    "uses a fresh operation for an unchanged draft after definite HTTP %s refusal",
    async (status) => {
      postOutcomes.push(
        response(status, { error: "Calling is not available now." }),
        response(403),
      );
      await prepare();
      await place();
      expect(entries.size).toBe(0);
      expect(button("Place call").props.disabled).toBe(false);
      await place();
      expect(posts()).toHaveLength(2);
      expect(posted(1).requestKey).not.toBe(posted(0).requestKey);
    },
  );

  it("sends an edited draft under a fresh operation after definite refusal", async () => {
    postOutcomes.push(response(403), response(403));
    await prepare();
    await place();
    nodes.find((node) => node.type === "textarea")!.props.onChange!({
      target: { value: "Confirm the revised appointment." },
    });
    await settle();
    await place();
    expect(posted(1)).toMatchObject({ context: "Confirm the revised appointment." });
    expect(posted(1).requestKey).not.toBe(posted(0).requestKey);
  });

  it.each([
    ["accepted but unresolved", response(202)],
    ["do-not-retry refusal", response(409, { doNotRetry: true })],
    ["ambiguous provider outcome", response(400, { providerOutcomeAmbiguous: true })],
    ["server error", response(503)],
    ["request timeout", response(408)],
    ["network failure", () => Promise.reject(new Error("Network unavailable"))],
    ["malformed JSON", () => Promise.resolve(new Response("{", { status: 403 }))],
    ["success without call identity", response(200)],
  ] as const)(
    "retains the same recovery identity for %s, including reopen and reload",
    async (_label, outcome) => {
      postOutcomes.push(outcome);
      await prepare();
      await place();
      const key = posted(0).requestKey;
      expect(readPendingOutboundDial("owner-1", store)).toEqual({ requestKey: key });
      expect(button("Place call").props.disabled).toBe(true);
      button("Place call").props.onClick!();
      await settle();
      expect(posts()).toHaveLength(1);
      button("Close").props.onClick!();
      await settle(false);
      await settle(true);
      unmount();
      await settle();
      expect(readPendingOutboundDial("owner-1", store)).toEqual({ requestKey: key });
      expect(button("Place call").props.disabled).toBe(true);
      expect(
        nodes.find((node) => node.type === "input" && node.props.value === "+13125550123")!.props
          .disabled,
      ).toBe(true);
      expect(
        vi.mocked(authFetch).mock.calls.some(([url]) => url === `/api/outbound/dial/${key}`),
      ).toBe(true);
      expect(posts()).toHaveLength(1);
    },
  );

  it("keeps the original operation fenced if definitive-refusal storage cleanup fails", async () => {
    postOutcomes.push(response(403));
    await prepare();
    store.removeItem.mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    await place();
    expect(readPendingOutboundDial("owner-1", store)).toEqual({ requestKey: posted(0).requestKey });
    expect(button("Place call").props.disabled).toBe(true);
    button("Place call").props.onClick!();
    await settle();
    expect(posts()).toHaveLength(1);
  });

  it("clears only an exact confirmed terminal receipt before allowing a fresh operation", async () => {
    postOutcomes.push(response(202), response(403));
    await prepare();
    await place();
    const key = posted(0).requestKey;
    for (const body of [
      { requestKey: "other", terminal: true, status: "failed" },
      { requestKey: key, terminal: true, status: "accepted" },
    ]) {
      statusBody = () => body;
      button("Refresh call status").props.onClick!();
      await settle();
      expect(readPendingOutboundDial("owner-1", store)).toEqual({ requestKey: key });
      expect(button("Place call").props.disabled).toBe(true);
    }
    statusBody = () => ({ requestKey: key, terminal: true, status: "failed" });
    button("Refresh call status").props.onClick!();
    await settle();
    expect(entries.size).toBe(0);
    expect(button("Place call").props.disabled).toBe(false);
    await place();
    expect(posted(1).requestKey).not.toBe(key);
  });

  it("retains a started call's identity after closing until status confirms completion", async () => {
    postOutcomes.push(response(200, { callId: "CAknown" }));
    await prepare();
    await place();
    expect(close).toHaveBeenCalledOnce();
    const key = posted(0).requestKey;
    unmount();
    await settle();
    expect(readPendingOutboundDial("owner-1", store)).toEqual({ requestKey: key });
    expect(button("Place call").props.disabled).toBe(true);
    expect(posts()).toHaveLength(1);
  });
});
