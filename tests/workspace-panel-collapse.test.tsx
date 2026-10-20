import type { ComponentProps, ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceResizablePanel from "../src/components/layout/WorkspaceResizablePanel";

const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => unknown>,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) {
      hooks.values[index] = typeof initial === "function" ? initial() : initial;
    }
    return [
      hooks.values[index],
      (next: unknown) => {
        hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => unknown) => hooks.effects.push(effect),
}));

type PanelProps = ComponentProps<typeof WorkspaceResizablePanel>;
type PanelState = Parameters<PanelProps["children"]>[0];
type ElementProps = {
  children?: ReactNode;
  role?: string;
  style?: { width?: number };
  "data-collapsed"?: string;
  "aria-valuemax"?: number;
  "aria-valuenow"?: number;
  onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
};

const stored = new Map<string, string>();

function render(overrides: Partial<PanelProps> = {}) {
  hooks.cursor = 0;
  hooks.effects = [];
  let state!: PanelState;
  const element = WorkspaceResizablePanel({
    storageKey: "inspector",
    side: "right",
    defaultSize: 372,
    minSize: 312,
    maxSize: 520,
    collapsedSize: 0,
    resizeHandleLabel: "Resize settings",
    children: (value) => {
      state = value;
      return null;
    },
    ...overrides,
  }) as ReactElement<ElementProps>;
  hooks.effects.forEach((effect) => effect());
  return { element, state };
}

beforeEach(() => {
  hooks.values = [];
  stored.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("workspace panel collapse ownership", () => {
  it("opens an explicit settings route despite a saved collapsed preference", () => {
    stored.set("inspector", JSON.stringify({ size: 430, collapsed: true }));
    const { element, state } = render({ collapsed: false });
    expect(state.collapsed).toBe(false);
    expect(element.props.style?.width).toBe(430);
  });

  it("keeps settings closed on an ordinary route despite a saved expanded preference", () => {
    stored.set("inspector", JSON.stringify({ size: 430, collapsed: false }));
    const { element, state } = render({ collapsed: true });
    expect(state.collapsed).toBe(true);
    expect(element.props.style?.width).toBe(0);
  });

  it("requests controlled collapse without changing the route-owned state", () => {
    const onCollapsedChange = vi.fn();
    render({ collapsed: false, onCollapsedChange }).state.toggleCollapsed();
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    expect(render({ collapsed: false }).state.collapsed).toBe(false);
    expect(render({ collapsed: true }).state.collapsed).toBe(true);
  });

  it("retains persisted click collapse for existing uncontrolled callers", () => {
    const initial = render();
    expect(initial.state.collapsed).toBe(false);
    initial.state.toggleCollapsed();
    expect(render().state.collapsed).toBe(true);
    expect(JSON.parse(stored.get("inspector") || "{}")).toEqual({
      size: 372,
      collapsed: true,
    });
    render().state.toggleCollapsed();
    expect(render().state.collapsed).toBe(false);
  });

  it("keeps keyboard resize and saved width when collapse is controlled", () => {
    const { element } = render({ collapsed: false });
    const children = element.props.children as Array<ReactElement<ElementProps> | null>;
    const separator = children.find((child) => child?.props.role === "separator");
    expect(separator).toBeDefined();
    const preventDefault = vi.fn();
    separator?.props.onKeyDown?.({ key: "ArrowLeft", preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(render({ collapsed: false }).state.size).toBe(388);
    render({ collapsed: true });
    expect(render({ collapsed: false }).element.props.style?.width).toBe(388);

    const narrowed = render({ collapsed: false, maxSize: 360 });
    const narrowedChildren = narrowed.element.props
      .children as Array<ReactElement<ElementProps> | null>;
    const narrowedSeparator = narrowedChildren.find((child) => child?.props.role === "separator");
    expect(narrowed.element.props.style?.width).toBe(360);
    expect(narrowedSeparator?.props["aria-valuemax"]).toBe(360);
    expect(narrowedSeparator?.props["aria-valuenow"]).toBe(360);
    expect(render({ collapsed: false }).element.props.style?.width).toBe(388);
  });
});
