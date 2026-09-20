import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClientToolbar from "../src/components/layout/ClientToolbar";
import DncManager from "../src/components/DncManager";
import OutboundDialDialog from "../src/components/OutboundDialDialog";
import { dialogContentVariants } from "../src/components/atoms/Dialog";
import { cn } from "../src/lib/utils";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  idCursor: 0,
}));

// Exercise the actual event handlers and rendered field/container relationships.
// Browser QA separately verifies real Radix focus and short-viewport geometry.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.stateCursor++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [
      hooks.states[index],
      (value: unknown) => {
        hooks.states[index] = value;
      },
    ];
  },
  useRef: (initial: unknown) => (hooks.refs[hooks.refCursor++] ??= { current: initial }),
  useId: () => `field-${hooks.idCursor++}`,
  useEffect: () => undefined,
  useMemo: (compute: () => unknown) => compute(),
}));
vi.mock("react-router", () => ({ Link: "a" }));
vi.mock("motion/react", () => ({ motion: { div: "div" }, AnimatePresence: "div" }));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  Dialog: "dialog-root",
  DialogClose: "dialog-close",
  DialogContent: "dialog-content",
  DialogDescription: "dialog-description",
  DialogTitle: "dialog-title",
  DialogTrigger: "dialog-trigger",
}));
vi.mock("../src/components/atoms/Dialog", async (original) => ({
  ...(await original<typeof import("../src/components/atoms/Dialog")>()),
  Dialog: "dialog-root",
  DialogContent: "dialog-content",
  DialogHeader: "dialog-header",
  DialogFooter: "dialog-footer",
  DialogTitle: "dialog-title",
  DialogDescription: "dialog-description",
}));
vi.mock("../src/components/ui/shadcn/Dialog", () => ({
  Dialog: "dialog-root",
  DialogContent: "dialog-content",
  DialogHeader: "dialog-header",
  DialogTitle: "dialog-title",
  DialogDescription: "dialog-description",
}));
vi.mock("../src/components/ui/shadcn/Input", () => ({ Input: "input" }));
vi.mock("../src/components/ui/shadcn/Select", () => ({
  Select: "select-root",
  SelectTrigger: "select-trigger",
  SelectContent: "select-content",
  SelectItem: "select-item",
  SelectValue: "select-value",
}));
vi.mock("../src/components/ui/shadcn/Checkbox", () => ({ Checkbox: "input" }));
vi.mock("../src/components/ui/EmptyState", () => ({ EmptyState: "empty-state" }));
vi.mock("../src/components/layout/ClientRouteLoading", () => ({ default: "loading" }));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({
    agents: [{ id: "bot-1", name: "Front Desk", phone_number: "+15555550123", channel: "voice" }],
    loading: false,
  }),
}));
vi.mock("../src/contexts/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn(), success: vi.fn(), error: vi.fn() }),
}));
vi.mock("../src/lib/api", () => ({ authFetch: vi.fn(), readApiJson: vi.fn() }));
vi.mock("../src/lib/product-event-client", () => ({ emitProductEvent: vi.fn() }));

type Props = {
  children?: ReactNode;
  actions?: ReactNode;
  id?: string;
  htmlFor?: string;
  className?: string;
  open?: boolean;
  type?: string;
  value?: string;
  "aria-label"?: string;
  "data-toolbar-dialog-action"?: boolean;
  ref?: { current: unknown };
  actionTriggerRef?: { current: unknown };
  onClick?: (event: unknown) => void;
  onChange?: (event: { target: { value: string } }) => void;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: { preventDefault: () => void }) => void;
};
type Node = ReactElement<Props>;
function descendants(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  return isValidElement<Props>(node) ? [node, ...descendants(node.props.children)] : [];
}
function render(component: () => ReactNode) {
  hooks.stateCursor = hooks.refCursor = hooks.idCursor = 0;
  return descendants(component());
}

class Target {
  isConnected = true;
  visible = true;
  focus = vi.fn();
  constructor(
    public marked = false,
    public disabled = false,
  ) {}
  closest() {
    return this.marked ? this : null;
  }
  matches() {
    return this.disabled;
  }
  getClientRects() {
    return this.visible ? [{}] : [];
  }
}

beforeEach(() => {
  hooks.states = [];
  hooks.refs = [];
  vi.stubGlobal("Element", Target);
});
afterEach(() => vi.unstubAllGlobals());

describe("mobile dialog handoff", () => {
  const toolbar = () => ClientToolbar({ actions: "actions" });
  function openToolbar() {
    render(toolbar).find((node) => node.type === "dialog-root")!.props.onOpenChange!(true);
    return render(toolbar);
  }
  function choose(target: Target, prevented = false) {
    const actionGroup = openToolbar().find((node) => node.type === "div" && node.props.onClick)!;
    actionGroup.props.onClick!({
      target,
      defaultPrevented: prevented,
      currentTarget: { contains: () => true },
    });
    return render(toolbar);
  }

  it("dismisses an opted-in dialog action without stealing the destination's focus", () => {
    const nodes = choose(new Target(true));
    expect(nodes.find((node) => node.type === "dialog-root")!.props.open).toBe(false);
    const preventDefault = vi.fn();
    const closed = nodes.find((node) => node.type === "dialog-content")!;
    closed.props.onCloseAutoFocus!({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    preventDefault.mockClear();
    closed.props.onCloseAutoFocus!({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it.each([
    ["filter choices", false, false, false],
    ["disabled actions", true, true, false],
    ["prevented actions", true, false, true],
  ] as const)("keeps the drawer available for %s", (_label, marked, disabled, prevented) => {
    expect(
      choose(new Target(marked, disabled), prevented).find((node) => node.type === "dialog-root")!
        .props.open,
    ).toBe(true);
  });

  it("connects DNC labels, keeps one stable import input, and returns from a removed drawer trigger", () => {
    const nodes = render(DncManager);
    const toolbarNode = nodes.find((node) => node.type === ClientToolbar)!;
    expect(nodes.filter((node) => node.props.type === "file")).toHaveLength(1);
    expect(descendants(toolbarNode.props.actions).some((node) => node.props.type === "file")).toBe(
      false,
    );
    for (const label of nodes.filter((node) => node.type === "label" && node.props.htmlFor)) {
      expect(nodes.some((node) => node.props.id === label.props.htmlFor)).toBe(true);
    }
    expect(nodes.filter((node) => node.type === "label" && node.props.htmlFor)).toHaveLength(2);
    const action = descendants(toolbarNode.props.actions).find(
      (node) => node.props["data-toolbar-dialog-action"],
    )!;
    const previousTrigger = new Target(true);
    action.props.onClick!({ currentTarget: previousTrigger });
    previousTrigger.isConnected = false;
    const persistentTrigger = new Target();
    toolbarNode.props.actionTriggerRef!.current = persistentTrigger;
    const preventDefault = vi.fn();
    render(DncManager).find((node) => node.type === "dialog-content")!.props.onCloseAutoFocus!({
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(persistentTrigger.focus).toHaveBeenCalledOnce();
  });

  it("returns to the connected desktop DNC opener instead of relying on a missing Radix trigger", () => {
    const toolbarNode = render(DncManager).find((node) => node.type === ClientToolbar)!;
    const action = descendants(toolbarNode.props.actions).find(
      (node) => node.props["data-toolbar-dialog-action"],
    )!;
    const opener = new Target(true);
    const persistentTrigger = new Target();
    toolbarNode.props.actionTriggerRef!.current = persistentTrigger;
    action.props.onClick!({ currentTarget: opener });
    const preventDefault = vi.fn();
    render(DncManager).find((node) => node.type === "dialog-content")!.props.onCloseAutoFocus!({
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(opener.focus).toHaveBeenCalledOnce();
    expect(persistentTrigger.focus).not.toHaveBeenCalled();
  });

  it.each([
    ["returns to the empty-state Add First Number opener", false, false, "opener"],
    ["uses persistent search when the first add removes the desktop opener", true, false, "search"],
    ["uses Page Actions when the first add removes the mobile opener", true, true, "toolbar"],
  ] as const)("%s", (_label, removed, mobile, expected) => {
    render(DncManager);
    hooks.states[1] = false; // The initial empty inventory finished loading.
    const emptyState = render(DncManager).find((node) => node.type === "empty-state")!;
    const actions = emptyState.props.actions as unknown as Array<{
      label: string;
      onClick: (event: { currentTarget: Target }) => void;
    }>;
    const opener = new Target();
    actions
      .find((action) => action.label === "Add first number")!
      .onClick({
        currentTarget: opener,
      });
    const nodes = render(DncManager);
    expect(nodes.find((node) => node.type === "dialog-root")!.props.open).toBe(true);
    opener.isConnected = !removed;
    const toolbar = new Target();
    toolbar.visible = mobile;
    nodes.find((node) => node.type === ClientToolbar)!.props.actionTriggerRef!.current = toolbar;
    const search = new Target();
    nodes.find(
      (node) => node.props["aria-label"] === "Search blocked numbers",
    )!.props.ref!.current = search;
    const preventDefault = vi.fn();
    nodes.find((node) => node.type === "dialog-content")!.props.onCloseAutoFocus!({
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(opener.focus).toHaveBeenCalledTimes(expected === "opener" ? 1 : 0);
    expect(toolbar.focus).toHaveBeenCalledTimes(expected === "toolbar" ? 1 : 0);
    expect(search.focus).toHaveBeenCalledTimes(expected === "search" ? 1 : 0);
  });
});

describe("outbound dialog viewport ownership", () => {
  it("keeps expanded consent in the scrollable body and actions outside it", () => {
    const component = () => OutboundDialDialog({ open: true, onClose: vi.fn() });
    let nodes = render(component);
    nodes.find((node) => node.type === "select" && node.props.value === "service_or_requested")!
      .props.onChange!({ target: { value: "marketing_or_sales" } });
    nodes = render(component);
    const content = nodes.find((node) => node.type === "dialog-content")!;
    const classes = cn(dialogContentVariants(), content.props.className).split(" ");
    expect(classes).toContain("flex");
    expect(classes).toContain("flex-col");
    expect(classes).not.toContain("grid");
    expect(classes).toContain("max-h-[calc(100dvh-2rem)]");
    const body = nodes.find((node) => node.props.className?.includes("overflow-y-auto"))!;
    expect(body.props.className).toContain("min-h-0");
    expect(descendants(body).some((node) => node.type === "textarea")).toBe(true);
    expect(descendants(body).some((node) => node.type === "a")).toBe(true);
    expect(descendants(body).some((node) => node.type === "dialog-footer")).toBe(false);
    expect(nodes.find((node) => node.type === "dialog-footer")!.props.className).toContain(
      "shrink-0",
    );
    expect(nodes.find((node) => node.type === "dialog-header")!.props.className).toContain(
      "shrink-0",
    );
  });
});
