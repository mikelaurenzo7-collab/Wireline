import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentToolPermissions from "../src/components/AgentToolPermissions";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  fetch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = typeof next === "function" ? next(h.states[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
  useEffect: (effect: () => void | (() => void)) => h.effects.push(effect),
}));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "aside" }));
vi.mock("../src/components/ui/shadcn/Checkbox", () => ({ Checkbox: "input" }));
vi.mock("react-router", () => ({ Link: "a" }));

type NodeProps = {
  children?: ReactNode;
  onClick?: () => void;
  onChange?: () => void;
  checked?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-expanded"?: boolean;
};
function elements(node: ReactNode): Array<ReactElement<NodeProps>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<NodeProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return isValidElement<NodeProps>(node) ? textOf(node.props.children) : "";
}
function render() {
  h.stateCursor = 0;
  h.refCursor = 0;
  h.effects = [];
  return AgentToolPermissions({ agentId: "bot-1" });
}
function toggle() {
  elements(render())
    .find((node) => typeof node.props["aria-expanded"] === "boolean")
    ?.props.onClick?.();
  render();
  return h.effects[0]();
}
async function flush() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
function json(data: unknown) {
  return new Response(JSON.stringify(data));
}

beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.effects = [];
  h.fetch.mockReset();
});

describe("agent action editor loading", () => {
  it("locks the submitted permissions until Save settles and retains edits after failure", async () => {
    let settle!: (response: Response) => void;
    h.fetch.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "POST")
        return new Promise<Response>((resolve) => {
          settle = resolve;
        });
      return Promise.resolve(
        json(url.startsWith("/api/agent-config/") ? { enabledTools: [] } : { accounts: [] }),
      );
    });
    render();
    toggle();
    await flush();
    const firstAction = () => elements(render()).find((node) => node.type === "input")!;
    firstAction().props.onChange!();
    const editor = elements(render());
    const save = editor.find(
      (node) => node.type === "button" && textOf(node).includes("Save actions"),
    )!;
    const enableGroup = editor.find(
      (node) => node.props["aria-label"] === "Enable all CRM actions",
    )!;
    save.props.onClick!();
    const submitted = JSON.parse(
      h.fetch.mock.calls.find(([, options]) => options?.method === "POST")![1].body,
    ).enabled_tools;
    save.props.onClick!(); // Same-render duplicate activation must not submit twice.
    firstAction().props.onChange!();
    enableGroup.props.onClick!();
    expect(
      elements(render()).find((node) => node.props["aria-label"] === "Bot action permissions")
        ?.props.disabled,
    ).toBe(true);
    expect(
      elements(render()).filter((node) => node.type === "input" && node.props.checked),
    ).toHaveLength(submitted.length);
    expect(h.fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    settle(new Response("unavailable", { status: 503 }));
    await flush();
    expect(textOf(render())).toContain("Actions could not be saved");
    expect(firstAction().props.checked).toBe(true);
    expect(
      elements(render()).find((node) => node.props["aria-label"] === "Bot action permissions")
        ?.props.disabled,
    ).toBe(false);
    elements(render()).find(
      (node) => node.type === "button" && textOf(node).includes("Save actions"),
    )!.props.onClick!();
    settle(json({ enabledTools: submitted }));
    await flush();
    expect(textOf(render())).toContain("Run a test before the next live call");
    expect(firstAction().props.checked).toBe(true);
  });

  it("scopes each named action group to its own permissions", async () => {
    h.fetch.mockImplementation((url: string) =>
      Promise.resolve(
        json(url.startsWith("/api/agent-config/") ? { enabledTools: [] } : { accounts: [] }),
      ),
    );
    render();
    toggle();
    await flush();
    const group = (label: string) =>
      elements(render()).find((node) => node.type === "details" && textOf(node).includes(label))!;
    const selected = (label: string) =>
      elements(group(label)).filter((node) => node.type === "input" && node.props.checked);
    elements(render()).find((node) => node.props["aria-label"] === "Enable all CRM actions")!.props
      .onClick!();
    expect(selected("CRM")).toHaveLength(5);
    expect(selected("Platform Actions")).toHaveLength(0);
    expect(selected("Slack")).toHaveLength(0);
    elements(group("Platform Actions")).find((node) => node.type === "input")!.props.onChange!();
    elements(render()).find((node) => node.props["aria-label"] === "Disable all CRM actions")!.props
      .onClick!();
    expect(selected("CRM")).toHaveLength(0);
    expect(selected("Platform Actions")).toHaveLength(1);
  });

  it("recovers when collapsed after config but before optional connections load", async () => {
    let releaseConnections!: () => void;
    const delayed = new Promise<void>((resolve) => {
      releaseConnections = resolve;
    });
    h.fetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/agent-config/")) return Promise.resolve(json({ enabledTools: [] }));
      return delayed.then(() => json({ accounts: [] }));
    });
    render();
    const cleanup = toggle();
    await flush();
    expect(textOf(render())).toContain("Loading actions");
    if (typeof cleanup === "function") cleanup();
    toggle(); // Collapsed while optional status requests are pending.
    toggle(); // Open again without reloading the page.
    releaseConnections();
    await flush();

    expect(textOf(render())).not.toContain("Loading actions");
    expect(textOf(render())).toContain("Save actions");
  });

  it("does not refetch and overwrite loaded edits when collapsed and reopened", async () => {
    h.fetch.mockImplementation((url: string) =>
      Promise.resolve(
        json(url.startsWith("/api/agent-config/") ? { enabledTools: [] } : { accounts: [] }),
      ),
    );
    render();
    const cleanup = toggle();
    await flush();
    const firstAction = () => elements(render()).find((node) => node.type === "input")!;
    firstAction().props.onChange!();
    expect(firstAction().props.checked).toBe(true);
    const calls = h.fetch.mock.calls.length;
    if (typeof cleanup === "function") cleanup();
    toggle();
    toggle();
    await flush();

    expect(textOf(render())).toContain("Save actions");
    expect(firstAction().props.checked).toBe(true);
    expect(h.fetch).toHaveBeenCalledTimes(calls);
  });
});
