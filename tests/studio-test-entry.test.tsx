import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioWorkspaceV2 from "../src/components/StudioWorkspaceV2";
import StudioContextChrome from "../src/components/studio/StudioContextChrome";
import { createStudioSessionState } from "../src/lib/studio-session-state";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  dependencies: [] as Array<readonly unknown[]>,
  effects: [] as Array<() => unknown>,
  stateCursor: 0,
  refCursor: 0,
  effectCursor: 0,
  dirty: false,
  ownerId: "owner-a",
  botId: "bot-a",
  wide: false,
  loading: false,
  degraded: false,
  params: new URLSearchParams(),
  session: null as unknown,
  focus: vi.fn(),
  setTimer: vi.fn(),
  writePreference: vi.fn(),
  refresh: vi.fn(),
  agents: [
    { id: "bot-a", name: "Alpha" },
    { id: "bot-b", name: "Bravo" },
  ],
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
  useCallback: (callback: unknown) => callback,
  useMemo: (compute: () => unknown) => compute(),
  useEffect(effect: () => unknown, dependencies: readonly unknown[]) {
    const index = h.effectCursor++;
    const previous = h.dependencies[index];
    h.dependencies[index] = dependencies;
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i])))
      h.effects.push(effect);
  },
}));
vi.mock("react-router", () => ({
  Link: "a",
  Navigate: "navigate",
  useSearchParams: () => [
    h.params,
    (update: (current: URLSearchParams) => URLSearchParams) => {
      h.params = update(h.params);
      h.dirty = true;
    },
  ],
}));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: h.ownerId } }) }));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({
    agents: h.agents,
    loading: h.loading,
    degraded: h.degraded,
    refresh: h.refresh,
  }),
}));
vi.mock("../src/contexts/StudioSessionContext", () => ({ useStudioSessionState: () => h.session }));
vi.mock("../src/hooks/useStudioActiveAgentId", () => ({
  useStudioActiveAgentId: () => ({
    requestedId: h.params.get("agent"),
    resolvedId: h.botId,
    agents: h.agents,
  }),
}));
vi.mock("../src/hooks/useMediaQuery", () => ({ useMediaQuery: () => h.wide }));
vi.mock("../src/lib/studio-agent-preference", () => ({
  writeStudioLastAgentId: h.writePreference,
}));
vi.mock("../src/components/molecules/StatusNotice", () => ({ StatusNotice: "notice" }));
vi.mock("../src/components/StudioWorkroom", () => ({ default: "workroom" }));
vi.mock("../src/components/StudioAgentWorkspacePanel", () => ({ default: "setup-panel" }));
vi.mock("../src/components/StudioAgentReviewPanel", () => ({ default: "review-panel" }));
vi.mock("../src/components/layout/WorkspaceResizablePanel", () => ({ default: "resizable-panel" }));
vi.mock("../src/components/WorkspaceRecovery", () => ({ default: "recovery" }));

type Props = {
  children?: ReactNode;
  action?: ReactNode;
  title?: string;
  agentId?: string;
  initialCommand?: string;
  id?: string;
  ref?: { current: unknown };
  mode?: string;
  fill?: boolean;
  to?: string;
  "aria-label"?: string;
  "aria-selected"?: boolean;
  onClick?: () => void;
  onTest?: () => void;
  onRehearseVoiceInChat?: () => void;
  onModeChange?: (mode: "configure" | "test") => void;
};
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children), ...elements(node.props.action)];
}
function render() {
  let tree: ReactNode;
  let passes = 0;
  do {
    h.dirty = false;
    h.stateCursor = h.refCursor = h.effectCursor = 0;
    tree = StudioWorkspaceV2();
    // The account provider is exercised in browser tests; this hook harness
    // executes its child orchestrator to inspect route/focus behavior.
    if (isValidElement<{ children: ReactElement }>(tree)) {
      const child = tree.props.children;
      if (isValidElement(child) && typeof child.type === "function")
        tree = (child.type as () => ReactNode)();
    }
    const workroom = elements(tree).find((node) => node.type === "workroom");
    if (workroom?.props.ref) workroom.props.ref.current = { focusVoiceRehearsal: h.focus };
    h.effects.splice(0).forEach((effect) => effect());
    if (++passes > 10) throw new Error("Workspace did not settle");
  } while (h.dirty);
  return elements(tree);
}
function requestTest() {
  const nodes = render();
  const setup = nodes.find((node) => node.type === "setup-panel");
  const review = nodes.find((node) => node.type === "review-panel");
  (setup?.props.onRehearseVoiceInChat ?? review?.props.onRehearse)!();
  return nodes.find((node) => node.type === "workroom")!;
}
beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.dependencies = [];
  h.effects = [];
  h.ownerId = "owner-a";
  h.botId = "bot-a";
  h.wide = false;
  h.loading = false;
  h.degraded = false;
  h.params = new URLSearchParams("agent=bot-a&section=setup");
  h.session = createStudioSessionState(h.ownerId);
  h.focus.mockReset();
  h.setTimer.mockReset();
  h.writePreference.mockReset();
  h.refresh.mockReset();
  vi.stubGlobal("window", { setTimeout: h.setTimer });
});
afterEach(() => vi.unstubAllGlobals());

describe("Studio settings-to-Test handoff", () => {
  it.each([false, true])(
    "blocks a missing explicit Bot and its commands on wide layout %s",
    (wide) => {
      h.wide = wide;
      h.params = new URLSearchParams(
        "agent=missing%2Fbot&command=Review+this+request&commandNonce=old-request&panel=computer&focus=computer",
      );
      const nodes = render();
      expect(nodes.find((node) => node.type === "notice")?.props.title).toBe("Bot Unavailable");
      expect(nodes.find((node) => node.type === "a")?.props.to).toBe("/studio");
      expect(
        nodes.some((node) =>
          ["workroom", "setup-panel", "review-panel", "resizable-panel", "navigate"].includes(
            String(node.type),
          ),
        ),
      ).toBe(false);
      expect(h.params.get("agent")).toBe("missing/bot");
      expect(h.params.get("commandNonce")).toBe("old-request");
      expect(h.params.get("panel")).toBe("computer");
      expect(h.writePreference).not.toHaveBeenCalled();
      expect((h.session as ReturnType<typeof createStudioSessionState>).conversations.size).toBe(0);
      const chrome = elements(StudioContextChrome());
      expect(chrome.some((node) => node.props["aria-label"] === "Bot details")).toBe(false);
      expect(chrome.find((node) => node.type === "h1")?.props.children).not.toBe("Alpha");

      h.degraded = true;
      const degraded = render();
      expect(degraded.find((node) => node.type === "notice")?.props.title).toBe(
        "Bot Lookup Unavailable",
      );
      degraded.find((node) => node.props.children === "Retry")!.props.onClick!();
      expect(h.refresh).toHaveBeenCalledOnce();
      expect(h.params.get("agent")).toBe("missing/bot");

      h.degraded = false;
      h.params = new URLSearchParams();
      h.botId = "bot-b";
      const recovered = render();
      expect(h.params.get("agent")).toBe("bot-b");
      expect(recovered.find((node) => node.type === "workroom")?.props.agentId).toBe("bot-b");
      expect(
        recovered
          .filter((node) => node.type === "workroom")
          .every((node) => node.props.initialCommand === undefined),
      ).toBe(true);
    },
  );

  it("focuses explicit Computer navigation while retaining the setup conversation", () => {
    h.wide = true;
    h.params = new URLSearchParams("agent=bot-a&panel=computer&focus=computer");
    const nodes = render();
    expect(nodes.find((node) => node.type === "resizable-panel")?.props.fill).toBe(true);
    expect(nodes.find((node) => node.type === "workroom")?.props.mode).toBe("configure");
    expect(h.params.get("agent")).toBe("bot-a");
    expect(h.params.get("focus")).toBe("computer");
    expect(h.params.has("panel")).toBe(false);

    h.params = new URLSearchParams("agent=bot-a");
    expect(render().find((node) => node.type === "resizable-panel")?.props.fill).toBe(false);
  });

  it("keeps the selected Bot when focused Computer moves to a narrow screen", () => {
    h.params = new URLSearchParams("agent=bot-a&focus=computer");
    expect(render().find((node) => node.type === "navigate")?.props.to).toBe(
      "/computer?agent=bot-a",
    );
  });

  it("keeps Computer when restoring a focused bookmark to the side panel without saved preferences", () => {
    h.wide = true;
    h.params = new URLSearchParams("agent=bot-a&focus=computer");
    const panelNodes = () => {
      const panel = render().find((node) => node.type === "resizable-panel")!;
      const content = panel.props.children as unknown as (state: {
        collapsed: boolean;
      }) => ReactNode;
      return elements(content({ collapsed: false }));
    };
    panelNodes().find((node) => node.props["aria-label"] === "Restore split view")!.props
      .onClick!();
    expect(render().find((node) => node.type === "resizable-panel")?.props.fill).toBe(false);
    expect(
      panelNodes().find((node) => node.props.id === "studio-inspector-tab-computer")?.props[
        "aria-selected"
      ],
    ).toBe(true);
    expect(h.params.get("agent")).toBe("bot-a");
    expect(h.params.has("focus")).toBe(false);
  });

  it.each(["setup", "review"])("focuses the committed voice Start control from %s", (section) => {
    h.params.set("section", section);
    requestTest();
    const workroom = render().find((node) => node.type === "workroom")!;
    expect(workroom.props.mode).toBe("test");
    expect(h.params.has("section")).toBe(false);
    expect(h.focus).toHaveBeenCalledExactlyOnceWith();
    expect(h.setTimer).not.toHaveBeenCalled();
    render();
    expect(h.focus).toHaveBeenCalledOnce();
  });

  it.each(["bot", "owner", "mode"])(
    "does not apply a stale Test request after a %s switch",
    (context) => {
      const workroom = requestTest();
      if (context === "bot") {
        h.botId = "bot-b";
        h.params.set("agent", h.botId);
      } else if (context === "owner") h.ownerId = "owner-b";
      else workroom.props.onModeChange!("configure");
      render();
      expect(h.focus).not.toHaveBeenCalled();
      expect(h.setTimer).not.toHaveBeenCalled();
    },
  );
});
