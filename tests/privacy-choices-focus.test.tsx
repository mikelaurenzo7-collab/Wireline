import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CookieConsent from "../src/components/CookieConsent";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  dependencies: [] as Array<readonly unknown[]>,
  cleanups: [] as Array<undefined | (() => void)>,
  effects: [] as Array<{ index: number; run: () => void | (() => void) }>,
  stateCursor: 0,
  refCursor: 0,
  effectCursor: 0,
}));

// Exercise the component's handlers and effect lifetimes with DOM focus doubles.
// Live browser checks separately cover scrolling, focus rings and real tab order.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.stateCursor++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [
      hooks.states[index],
      (next: unknown) => {
        hooks.states[index] = next;
      },
    ];
  },
  useRef: (initial: unknown) => (hooks.refs[hooks.refCursor++] ??= { current: initial }),
  useCallback: (callback: unknown) => callback,
  useEffect: (run: () => void | (() => void), dependencies: readonly unknown[]) => {
    const index = hooks.effectCursor++;
    const previous = hooks.dependencies[index];
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
      hooks.effects.push({ index, run });
      hooks.dependencies[index] = dependencies;
    }
  },
}));
vi.mock("react-dom", () => ({ createPortal: (children: unknown) => children }));
vi.mock("react-router", () => ({
  Link: "a",
  useLocation: () => ({ pathname: "/pricing", search: "" }),
}));
vi.mock("motion/react", () => ({ motion: { div: "div" }, AnimatePresence: "section" }));
vi.mock("../src/components/ui/shadcn/ShadButton", () => ({ ShadButton: "button" }));

type Props = {
  children?: ReactNode;
  ref?: { current: unknown };
  to?: string;
  "aria-label"?: string;
  onClick?: () => void;
};
type Element = ReactElement<Props>;

class FocusTarget {
  isConnected = true;
  hidden = false;
  focus = vi.fn(() => {
    documentState.activeElement = this;
  });
  closest = vi.fn(() => (this.hidden ? {} : null));
}

const body = new FocusTarget();
const opener = new FocusTarget();
const panel = new FocusTarget();
const panelControl = new FocusTarget();
const outsideControl = new FocusTarget();
const documentState = { body, activeElement: body };
const panelContains = (target: unknown) => target === panel || target === panelControl;
const localValues = new Map<string, string>();
let events: EventTarget;

function descendants(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...descendants(node.props.children)];
}

function render() {
  hooks.stateCursor = hooks.refCursor = hooks.effectCursor = 0;
  const elements = descendants(CookieConsent());
  const region = elements.find((element) => element.props["aria-label"] === "Privacy choices");
  if (region?.props.ref)
    region.props.ref.current = Object.assign(panel, { contains: panelContains });
  for (const { index, run } of hooks.effects.splice(0)) {
    hooks.cleanups[index]?.();
    hooks.cleanups[index] = run() || undefined;
  }
  vi.runAllTimers();
  return elements;
}

function open() {
  opener.focus();
  events.dispatchEvent(new Event("wireline:open-privacy-choices"));
  render();
  expect(documentState.activeElement).toBe(panel);
  opener.focus.mockClear();
}

function choose(label: string) {
  const button = render().find(
    (element) => element.props.children === label || element.props["aria-label"] === label,
  );
  if (!button?.props.onClick) throw new Error(`Missing privacy action: ${label}`);
  panelControl.focus();
  button.props.onClick();
  render();
}

function escape(prevented = false) {
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperty(event, "key", { value: "Escape" });
  if (prevented) event.preventDefault();
  events.dispatchEvent(event);
  render();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  hooks.states = [];
  hooks.refs = [];
  hooks.dependencies = [];
  hooks.effects = [];
  hooks.cleanups = [];
  for (const target of [body, opener, panel, panelControl, outsideControl]) {
    target.isConnected = true;
    target.hidden = false;
  }
  documentState.activeElement = body;
  localValues.clear();
  localValues.set("wireline_cookie_consent", "acknowledged");
  events = new EventTarget();
  vi.stubGlobal("HTMLElement", FocusTarget);
  vi.stubGlobal("document", documentState);
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("window", {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => localValues.get(key) ?? null,
    setItem: (key: string, value: string) => localValues.set(key, value),
  });
  render();
});

afterEach(() => {
  for (const cleanup of hooks.cleanups) cleanup?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("privacy choices return focus", () => {
  it.each([
    ["Essential only", "denied"],
    ["Allow measurement", "granted"],
    ["Keep advertising measurement off and dismiss", "denied"],
  ])("returns to the opener after %s and preserves its choice", (label, expectedChoice) => {
    open();
    choose(label);
    expect(documentState.activeElement).toBe(opener);
    expect(opener.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(localValues.get("wireline_marketing_measurement_consent")).toBe(expectedChoice);
  });

  it("returns to the opener when Escape dismisses the panel", () => {
    open();
    escape();
    expect(documentState.activeElement).toBe(opener);
  });

  it("honors an Escape key already handled by another control", () => {
    open();
    escape(true);
    expect(documentState.activeElement).toBe(panel);
    expect(render().some((element) => element.props["aria-label"] === "Privacy choices")).toBe(
      true,
    );
  });

  it("keeps focus on an outside control if the user has already left the panel", () => {
    open();
    outsideControl.focus();
    escape();
    expect(documentState.activeElement).toBe(outsideControl);
    expect(opener.focus).not.toHaveBeenCalled();
  });

  it.each(["removed", "hidden"])("does not focus a %s opener", (state) => {
    open();
    if (state === "removed") opener.isConnected = false;
    else opener.hidden = true;
    choose("Essential only");
    expect(opener.focus).not.toHaveBeenCalled();
  });

  it("leaves focus to the destination when the privacy-policy link is followed", () => {
    open();
    panelControl.focus();
    const link = render().find((element) => element.props.to === "/privacy");
    expect(link).toBeDefined();
    link?.props.onClick?.();
    expect(opener.focus).not.toHaveBeenCalled();
  });

  it("does not replace the opener when an open request repeats inside the panel", () => {
    open();
    events.dispatchEvent(new Event("wireline:open-privacy-choices"));
    render();
    choose("Essential only");
    expect(documentState.activeElement).toBe(opener);
  });

  it("keeps measurement denied when a global privacy signal is active", () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    open();
    choose("Keep advertising measurement off and dismiss");
    expect(localValues.get("wireline_marketing_measurement_consent")).toBe("denied");
    expect(documentState.activeElement).toBe(opener);
  });
});
