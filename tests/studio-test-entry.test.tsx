import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioWorkspaceV2 from "../src/components/StudioWorkspaceV2";
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
  params: new URLSearchParams(),
  session: null as unknown,
  focus: vi.fn(),
  setTimer: vi.fn(),
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
  useAgents: () => ({ agents: h.agents, loading: false }),
}));
vi.mock("../src/contexts/StudioSessionContext", () => ({ useStudioSessionState: () => h.session }));
vi.mock("../src/hooks/useStudioActiveAgentId", () => ({
  useStudioActiveAgentId: () => ({ requestedId: h.botId, resolvedId: h.botId, agents: h.agents }),
}));
vi.mock("../src/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("../src/lib/studio-agent-preference", () => ({ writeStudioLastAgentId: vi.fn() }));
vi.mock("../src/components/StudioWorkroom", () => ({ default: "workroom" }));
vi.mock("../src/components/StudioAgentWorkspacePanel", () => ({ default: "setup-panel" }));
vi.mock("../src/components/StudioAgentReviewPanel", () => ({ default: "review-panel" }));
vi.mock("../src/components/layout/WorkspaceResizablePanel", () => ({ default: "resizable-panel" }));
vi.mock("../src/components/WorkspaceRecovery", () => ({ default: "recovery" }));

type Props = {
  children?: ReactNode;
  ref?: { current: unknown };
  mode?: string;
  onTest?: () => void;
  onTestVoiceInChat?: () => void;
  onModeChange?: (mode: "configure" | "test") => void;
};
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function render() {
  let tree: ReactNode;
  let passes = 0;
  do {
    h.dirty = false;
    h.stateCursor = h.refCursor = h.effectCursor = 0;
    tree = StudioWorkspaceV2();
    const workroom = elements(tree).find((node) => node.type === "workroom");
    if (workroom?.props.ref) workroom.props.ref.current = { focusComposer: h.focus };
    h.effects.splice(0).forEach((effect) => effect());
    if (++passes > 10) throw new Error("Workspace did not settle");
  } while (h.dirty);
  return elements(tree);
}
function requestTest() {
  const nodes = render();
  const setup = nodes.find((node) => node.type === "setup-panel");
  const review = nodes.find((node) => node.type === "review-panel");
  (setup?.props.onTestVoiceInChat ?? review?.props.onTest)!();
  return nodes.find((node) => node.type === "workroom")!;
}
beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.dependencies = [];
  h.effects = [];
  h.ownerId = "owner-a";
  h.botId = "bot-a";
  h.params = new URLSearchParams("agent=bot-a&section=setup");
  h.session = createStudioSessionState(h.ownerId);
  h.focus.mockReset();
  h.setTimer.mockReset();
  vi.stubGlobal("window", { setTimeout: h.setTimer });
});
afterEach(() => vi.unstubAllGlobals());

describe("Studio settings-to-Test handoff", () => {
  it.each(["setup", "review"])("focuses the committed Test composer from %s", (section) => {
    h.params.set("section", section);
    requestTest();
    const workroom = render().find((node) => node.type === "workroom")!;
    expect(workroom.props.mode).toBe("test");
    expect(h.params.has("section")).toBe(false);
    expect(h.focus).toHaveBeenCalledExactlyOnceWith(
      "Hi, can you explain what you can do and help me take the next step?",
    );
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
