import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentTemplates from "../src/components/AgentTemplates";

const hooks = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0 }));

// Exercise the gallery/card event sequence. Real pointer geometry is covered
// separately by local browser QA; this isolates the preview state that moved it.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (value: unknown) => (hooks.states[index] = value)];
  },
  useEffect: () => undefined,
  useMemo: (compute: () => unknown) => compute(),
}));
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("motion/react", () => ({
  motion: { article: "article", div: "div" },
  AnimatePresence: "div",
}));
vi.mock("../src/components/DeployAgentModal", () => ({ default: "deploy-dialog" }));
vi.mock("../src/components/ui/shadcn/ShadButton", () => ({ ShadButton: "button" }));
vi.mock("../src/contexts/ToastContext", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

type Props = {
  children?: ReactNode;
  open?: boolean;
  disabled?: boolean;
  template?: { id: string; firstMessage: string };
  "aria-label"?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
};
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function visibleText(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(visibleText).join("");
  if (!isValidElement<Props>(node)) return typeof node === "string" ? node : "";
  if (node.type === "details" && !node.props.open) {
    return visibleText(elements(node.props.children).find((child) => child.type === "summary"));
  }
  return visibleText(node.props.children);
}
function gallery() {
  hooks.cursor = 0;
  return elements(AgentTemplates());
}
function card(id = "personal-concierge") {
  const node = gallery().find((element) => element.props.template?.id === id)!;
  const render = node.type as (props: Props) => ReactNode;
  return render(node.props);
}
function useAction(node: ReactNode) {
  return elements(node).find((element) => element.props["aria-label"]?.startsWith("Use "))!;
}

beforeEach(() => {
  // Loaded inventory, no deployed Bots, no dialog. No provider or DB calls.
  hooks.states = ["All", "", null, [], null, false];
});

describe("template action stability", () => {
  it("keeps the greeting collapsed during pointer entry and focus, then opens on the first activation", () => {
    const initial = card();
    const originalCopy = visibleText(initial);
    const article = elements(initial).find((element) => element.type === "article")!;
    article.props.onMouseEnter?.();
    article.props.onFocus?.();
    const focused = card();
    expect(visibleText(focused)).toBe(originalCopy);
    expect(originalCopy).not.toContain("Hi, you've reached the line.");
    useAction(focused).props.onClick!();
    const dialog = gallery().find((element) => element.type === "deploy-dialog")!;
    expect(dialog.props.open).toBe(true);
    expect(dialog.props.template?.id).toBe("personal-concierge");
  });

  it("offers the greeting through a native keyboard disclosure without making it a deployment prerequisite", () => {
    const node = card();
    const disclosure = elements(node).find((element) => element.type === "details")!;
    expect(visibleText(disclosure)).toBe("Sample Greeting");
    expect(visibleText({ ...disclosure, props: { ...disclosure.props, open: true } })).toContain(
      "Hi, you've reached the line. How can I help today?",
    );
    expect(useAction(node).props.disabled).toBe(false);
    useAction(node).props.onClick!();
    expect(gallery().find((element) => element.type === "deploy-dialog")!.props.open).toBe(true);
  });
});
