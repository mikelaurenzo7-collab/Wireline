import { isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import StudioWorkroom from "../src/components/StudioWorkroom";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  options: {} as { onError?: (message: string) => void; onComplete?: (data: object) => void },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
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
  useEffect: () => {},
  useLayoutEffect: () => {},
  useCallback: (callback: unknown) => callback,
  useImperativeHandle: () => {},
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock("../src/hooks/useStreamingChat", () => ({
  useStreamingChat: (_endpoint: string, options: typeof h.options) => {
    h.options = options;
    return { state: { phase: "thinking" }, send: vi.fn(), reset: vi.fn() };
  },
}));
vi.mock("../src/lib/api", () => ({ authFetch: vi.fn() }));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));

type Props = {
  children?: ReactNode;
  onClick?: () => void;
  working?: boolean;
  markKey?: string;
  role?: string;
  "aria-label"?: string;
};
function elements(node: ReactNode): Array<{ type: unknown; props: Props }> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}

beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.options = {};
});

it.each(["error", "complete"])(
  "shows the selected mark while a chat reply is pending and removes it after %s",
  (outcome) => {
    const session = {
      snapshot: {
        messages: [],
        clearing: false,
        clearError: null,
        replyError: null,
        interrupted: false,
      },
      loaded: true,
      operations: new Map(),
      listeners: new Set(),
    };
    const render = () => {
      h.stateCursor = 0;
      h.refCursor = 0;
      return (
        StudioWorkroom as unknown as { render: (props: object, ref: null) => ReactNode }
      ).render(
        {
          agentId: "bot-a",
          agentName: "Nora",
          markKey: "spark-rose",
          conversationSession: session,
          initialDraft: { text: "Update the instructions", command: null, commandNonce: null },
        },
        null,
      );
    };
    elements(render()).find((node) => node.props["aria-label"] === "Send")!.props.onClick!();
    const pending = elements(render());
    const mark = pending.find(
      (node) => typeof node.type === "function" && node.type.name === "BotMark",
    );
    expect(mark?.props).toMatchObject({ working: true, markKey: "spark-rose" });
    expect(pending.some((node) => node.props.role === "status")).toBe(true);
    if (outcome === "error") {
      h.options.onError!("Request failed");
    } else {
      vi.stubGlobal("requestAnimationFrame", () => 1);
      h.options.onComplete!({ reply: "Done." });
      vi.unstubAllGlobals();
    }
    expect(
      elements(render()).some(
        (node) => typeof node.type === "function" && node.type.name === "BotMark",
      ),
    ).toBe(false);
  },
);
