import type { ComponentProps, ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceResizablePanel from "../src/components/layout/WorkspaceResizablePanel";

type EffectSlot = { deps?: unknown[]; cleanup?: () => void };
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void>,
  dirty: false,
  writes: 0,
}));

// Run the component's actual handlers/effects against native EventTargets.
// The harness preserves hook state and dependency cleanup across renders.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots))
      hooks.slots[index] = { value: typeof initial === "function" ? initial() : initial };
    const slot = hooks.slots[index] as { value: unknown };
    return [
      slot.value,
      (next: unknown) => {
        const value = typeof next === "function" ? next(slot.value) : next;
        hooks.writes += 1;
        if (!Object.is(slot.value, value)) hooks.dirty = true;
        slot.value = value;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useCallback(callback: unknown, deps: unknown[]) {
    const index = hooks.cursor++;
    const previous = hooks.slots[index] as { value: unknown; deps: unknown[] } | undefined;
    if (
      previous &&
      deps.length === previous.deps.length &&
      deps.every((value, at) => Object.is(value, previous.deps[at]))
    )
      return previous.value;
    hooks.slots[index] = { value: callback, deps };
    return callback;
  },
  useEffect(effect: () => unknown, deps?: unknown[]) {
    const index = hooks.cursor++;
    const previous = hooks.slots[index] as EffectSlot | undefined;
    if (
      previous &&
      deps &&
      previous.deps &&
      deps.length === previous.deps.length &&
      deps.every((value, at) => Object.is(value, previous.deps![at]))
    )
      return;
    const slot: EffectSlot = { deps, cleanup: previous?.cleanup };
    hooks.slots[index] = slot;
    hooks.effects.push(() => {
      slot.cleanup?.();
      const cleanup = effect();
      slot.cleanup = typeof cleanup === "function" ? (cleanup as () => void) : undefined;
    });
  },
}));

type PanelProps = ComponentProps<typeof WorkspaceResizablePanel>;
type PanelState = Parameters<PanelProps["children"]>[0];
type NodeProps = {
  children?: ReactNode;
  role?: string;
  "aria-label"?: string;
  id?: string;
  style?: { width?: number };
  "data-resizing"?: string;
  "aria-controls"?: string;
  "aria-describedby"?: string;
  "aria-valuemin"?: number;
  "aria-valuemax"?: number;
  "aria-valuenow"?: number;
  "aria-valuetext"?: string;
  "aria-orientation"?: string;
  onPointerDown?: (event: unknown) => void;
  onKeyDown?: (event: unknown) => void;
  onDoubleClick?: () => void;
  onBlur?: () => void;
};

const stored = new Map<string, string>();
let windowTarget: EventTarget;
let documentTarget: EventTarget & { visibilityState: string };
let bodyStyle: { userSelect: string; cursor: string };
let props: PanelProps;
let mounted = false;
let state: PanelState;

function render(overrides: Partial<PanelProps> = {}) {
  props = { ...props, ...overrides };
  let element!: ReactElement<NodeProps>;
  for (let cycle = 0; cycle < 8; cycle += 1) {
    hooks.cursor = 0;
    hooks.effects = [];
    hooks.dirty = false;
    element = WorkspaceResizablePanel(props) as ReactElement<NodeProps>;
    hooks.effects.forEach((effect) => effect());
    if (!hooks.dirty) break;
    if (cycle === 7) throw new Error("Resize component did not settle.");
  }
  mounted = true;
  const children = element.props.children as Array<ReactElement<NodeProps> | null>;
  return {
    element,
    state,
    separator: children.find((child) => child?.props?.role === "separator"),
    children,
  };
}

function unmount() {
  if (!mounted) return;
  for (const slot of hooks.slots) (slot as EffectSlot)?.cleanup?.();
  mounted = false;
}

function dispatch(target: EventTarget, type: string, fields: Record<string, unknown> = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, fields);
  target.dispatchEvent(event);
  return event;
}

function startDrag(
  separator: ReactElement<NodeProps>,
  overrides: Record<string, unknown> = {},
  captureThrows = false,
) {
  let captured = false;
  const handle = Object.assign(new EventTarget(), {
    focus: vi.fn(),
    setPointerCapture: vi.fn(() => {
      if (captureThrows) throw new Error("Capture unavailable");
      captured = true;
    }),
    hasPointerCapture: vi.fn(() => captured),
    releasePointerCapture: vi.fn(() => {
      captured = false;
    }),
  });
  const event = {
    button: 0,
    pointerId: 7,
    isPrimary: true,
    clientX: 700,
    currentTarget: handle,
    preventDefault: vi.fn(),
    ...overrides,
  };
  separator.props.onPointerDown?.(event);
  return { handle, event };
}

function key(separator: ReactElement<NodeProps>, value: string, shiftKey = false) {
  const event = { key: value, shiftKey, preventDefault: vi.fn() };
  separator.props.onKeyDown?.(event);
  return event;
}

beforeEach(() => {
  hooks.slots = [];
  hooks.writes = 0;
  stored.clear();
  bodyStyle = { userSelect: "text", cursor: "crosshair" };
  windowTarget = Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (name: string) => stored.get(name) ?? null,
      setItem: (name: string, value: string) => stored.set(name, value),
    },
  });
  documentTarget = Object.assign(new EventTarget(), {
    visibilityState: "visible",
    body: { style: bodyStyle },
  });
  vi.stubGlobal("window", windowTarget);
  vi.stubGlobal("document", documentTarget);
  props = {
    storageKey: "workspace-inspector",
    side: "right",
    defaultSize: 372,
    minSize: 312,
    maxSize: 520,
    resizeHandleLabel: "Resize workspace panel",
    controlsId: "workspace-inspector-content",
    children: (next) => {
      state = next;
      return null;
    },
  };
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

describe("workspace divider width and keyboard behavior", () => {
  it("keeps the navigation divider and its help inside a named landmark", () => {
    const panel = render({ landmarkLabel: "Navigation panel" });
    expect(panel.element.props.role).toBe("region");
    expect(panel.element.props["aria-label"]).toBe("Navigation panel");
    expect(panel.separator?.props["aria-describedby"]).toBe(
      panel.children.find((child) => child?.props?.id)?.props.id,
    );
    const event = key(panel.separator!, "ArrowLeft");
    expect(event.preventDefault).toHaveBeenCalled();
    expect(render().separator?.props["aria-valuenow"]).toBe(388);
  });

  it.each([
    ['{"size":1e309}', 372],
    ['{"size":-900}', 312],
    ['{"size":9999}', 520],
    ['{"size":"450"}', 372],
    ["[430]", 372],
    ["{broken", 372],
  ])("normalizes saved preference %s before rendering or persisting", (raw, expected) => {
    stored.set("workspace-inspector", raw);
    const panel = render();
    expect(panel.element.props.style?.width).toBe(expected);
    expect(JSON.parse(stored.get("workspace-inspector")!).size).toBe(expected);
  });

  it.each(["left", "right"] as const)("moves the %s divider physically with arrows", (side) => {
    const initial = render({ side });
    const delta = side === "left" ? -16 : 16;
    expect(key(initial.separator!, "ArrowLeft").preventDefault).toHaveBeenCalledOnce();
    expect(render().state.size).toBe(372 + delta);
    key(render().separator!, "ArrowRight", true);
    expect(render().state.size).toBe(372 + delta - delta * 4);
    key(render().separator!, "End");
    expect(render().state.size).toBe(520);
    key(render().separator!, "Home");
    const minimum = render();
    expect(minimum.state.size).toBe(312);
    expect(minimum.separator?.props).toMatchObject({
      "aria-orientation": "vertical",
      "aria-valuemin": 312,
      "aria-valuemax": 520,
      "aria-valuenow": 312,
      "aria-valuetext": "312 pixels wide",
      "aria-controls": "workspace-inspector-content",
    });
    expect(
      minimum.children.some(
        (child) => child?.props?.id === minimum.separator?.props["aria-describedby"],
      ),
    ).toBe(true);
    minimum.separator?.props.onDoubleClick?.();
    expect(render().state.size).toBe(372);
  });

  it("preserves a preferred width on temporary narrowing but resizes from the visible edge", () => {
    stored.set("workspace-inspector", '{"size":500}');
    expect(render().state.size).toBe(500);
    expect(render({ maxSize: 360 }).element.props.style?.width).toBe(360);
    expect(render({ maxSize: 520 }).element.props.style?.width).toBe(500);
    const narrowed = render({ maxSize: 360 });
    key(narrowed.separator!, "ArrowRight");
    expect(render().element.props.style?.width).toBe(344);
  });
});

describe("workspace divider pointer lifecycle", () => {
  it("tracks only the initiating pointer and releases capture/styles on its completion", () => {
    const drag = startDrag(render().separator!);
    expect(drag.handle.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(bodyStyle).toEqual({ userSelect: "none", cursor: "col-resize" });
    dispatch(windowTarget, "pointermove", { pointerId: 8, clientX: 200 });
    expect(render().state.size).toBe(372);
    dispatch(windowTarget, "pointermove", { pointerId: 7, clientX: 600 });
    expect(render().state.size).toBe(472);
    dispatch(windowTarget, "pointerup", { pointerId: 8 });
    expect(render().element.props["data-resizing"]).toBe("true");
    dispatch(windowTarget, "pointerup", { pointerId: 7 });
    expect(render().element.props["data-resizing"]).toBeUndefined();
    expect(drag.handle.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(bodyStyle).toEqual({ userSelect: "text", cursor: "crosshair" });
    dispatch(windowTarget, "pointermove", { pointerId: 7, clientX: 300 });
    expect(render().state.size).toBe(472);
  });

  it.each(["pointercancel", "lostpointercapture", "blur", "hidden"])(
    "ends a drag on %s without leaving a global cursor or live listener",
    (ending) => {
      const drag = startDrag(render().separator!, {}, ending === "blur");
      if (ending === "hidden") {
        documentTarget.visibilityState = "hidden";
        dispatch(documentTarget, "visibilitychange");
      } else if (ending === "lostpointercapture") {
        dispatch(drag.handle, ending, { pointerId: 7 });
      } else dispatch(windowTarget, ending, { pointerId: 7 });
      expect(render().element.props["data-resizing"]).toBeUndefined();
      expect(bodyStyle).toEqual({ userSelect: "text", cursor: "crosshair" });
      dispatch(windowTarget, "pointermove", { pointerId: 7, clientX: 200 });
      expect(render().state.size).toBe(372);
    },
  );

  it("restores the original preferred width when Escape cancels a drag", () => {
    stored.set("workspace-inspector", '{"size":420}');
    startDrag(render().separator!);
    dispatch(windowTarget, "pointermove", { pointerId: 7, clientX: 500 });
    expect(render().state.size).toBe(520);
    const escape = dispatch(windowTarget, "keydown", { key: "Escape" });
    expect(escape.defaultPrevented).toBe(true);
    expect(render().state.size).toBe(420);
    expect(bodyStyle).toEqual({ userSelect: "text", cursor: "crosshair" });
  });

  it.each([{ fill: true }, { collapsed: true }, { maxSize: 400 }, { side: "left" as const }])(
    "cleans up when the parent changes drag geometry: %j",
    (changed) => {
      startDrag(render().separator!);
      render(changed);
      expect(bodyStyle).toEqual({ userSelect: "text", cursor: "crosshair" });
      expect(render().element.props["data-resizing"]).toBeUndefined();
      const width = state.size;
      dispatch(windowTarget, "pointermove", { pointerId: 7, clientX: 200 });
      expect(render().state.size).toBe(width);
    },
  );

  it("restores document styles on unmount without updating unmounted state", () => {
    startDrag(render().separator!);
    const writes = hooks.writes;
    unmount();
    expect(bodyStyle).toEqual({ userSelect: "text", cursor: "crosshair" });
    expect(hooks.writes).toBe(writes);
    dispatch(windowTarget, "pointermove", { pointerId: 7, clientX: 200 });
    expect(hooks.writes).toBe(writes);
  });

  it.each([{ button: 2 }, { isPrimary: false }, { clientX: Number.NaN }])(
    "ignores a non-primary or invalid start: %j",
    (changed) => {
      const drag = startDrag(render().separator!, changed);
      expect(drag.event.preventDefault).not.toHaveBeenCalled();
      expect(bodyStyle).toEqual({ userSelect: "text", cursor: "crosshair" });
      expect(render().element.props["data-resizing"]).toBeUndefined();
    },
  );
});
