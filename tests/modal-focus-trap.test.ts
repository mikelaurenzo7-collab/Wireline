import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModalFocusTrap } from "../src/lib/use-modal-focus-trap";

const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)> }));
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
}));

// Focus/event doubles exercise the shared hook. The browser acceptance pass
// separately verifies native tab movement and actual visibility/layout.
class FocusElement {
  children: FocusElement[] = [];
  parent: FocusElement | null = null;
  attributes = new Map<string, string>();
  disabled = false;
  offsetParent: object | null = {};
  constructor(public tagName = "div") {}
  append(...children: FocusElement[]) {
    children.forEach((child) => {
      child.parent = this;
      this.children.push(child);
    });
    return this;
  }
  descendants(): FocusElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
  contains(node: unknown): boolean {
    return node === this || this.descendants().includes(node as FocusElement);
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  get tabIndex() {
    return this.attributes.has("tabindex")
      ? Number(this.attributes.get("tabindex"))
      : ["button", "input", "textarea", "select", "summary"].includes(this.tagName)
        ? 0
        : -1;
  }
  matches(selector: string) {
    return selector === ":disabled" && this.disabled;
  }
  closest(selector: string): FocusElement | null {
    const matches = selector.includes('role="dialog"')
      ? this.attributes.get("role") === "dialog" && this.attributes.get("aria-modal") === "true"
      : this.attributes.get("aria-hidden") === "true" || this.attributes.has("inert");
    return matches ? this : (this.parent?.closest(selector) ?? null);
  }
  querySelectorAll(selector: string) {
    return this.descendants().filter(
      (element) =>
        (["button", "input", "textarea", "select"].includes(element.tagName) &&
          !element.disabled) ||
        element.hasAttribute("href") ||
        (selector.includes("summary") &&
          element.tagName === "summary" &&
          element.parent?.tagName === "details") ||
        (element.hasAttribute("tabindex") && element.attributes.get("tabindex") !== "-1"),
    );
  }
  compareDocumentPosition(other: FocusElement) {
    const order = [body, ...body.descendants()];
    return order.indexOf(other) > order.indexOf(this) ? 4 : 2;
  }
  focus = vi.fn(() => {
    documentState.activeElement = this;
  });
}

let body: FocusElement;
let documentState: { activeElement: FocusElement };
let listeners: Set<(event: KeyboardEvent) => void>;
let frames: Map<number, () => void>;
let frameId: number;
let cleanups: Array<() => void>;

function flushFrames() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback());
}
function element(tag: string, tabIndex?: number) {
  const node = new FocusElement(tag);
  if (tabIndex !== undefined) node.setAttribute("tabindex", String(tabIndex));
  return node;
}
function modal(...children: FocusElement[]) {
  const node = element("section").append(...children);
  node.setAttribute("role", "dialog");
  node.setAttribute("aria-modal", "true");
  body.append(node);
  return node;
}
function MountFocusTrap(container: FocusElement, onEscape = vi.fn()) {
  useModalFocusTrap({ current: container as unknown as HTMLElement }, { onEscape });
  const cleanup = hooks.effects.pop()!();
  let active = true;
  const close = () => {
    if (!active) return;
    active = false;
    cleanup?.();
  };
  cleanups.push(close);
  return close;
}
function key(key = "Tab", shiftKey = false) {
  const event = {
    key,
    shiftKey,
    target: documentState.activeElement,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  listeners.forEach((listener) => listener(event as unknown as KeyboardEvent));
  return event;
}

beforeEach(() => {
  body = element("body");
  documentState = { activeElement: body };
  listeners = new Set();
  frames = new Map();
  frameId = 0;
  cleanups = [];
  hooks.effects = [];
  vi.stubGlobal("Element", FocusElement);
  vi.stubGlobal("HTMLElement", FocusElement);
  vi.stubGlobal("Node", { DOCUMENT_POSITION_FOLLOWING: 4 });
  vi.stubGlobal("window", {
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
  });
  vi.stubGlobal("document", {
    get activeElement() {
      return documentState.activeElement;
    },
    contains: (node: unknown) => body.contains(node),
    addEventListener: (_type: string, listener: (event: KeyboardEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: KeyboardEvent) => void) =>
      listeners.delete(listener),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
  cleanups.reverse().forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

describe("modal keyboard boundaries", () => {
  it("wraps Shift+Tab from the programmatically focused heading before Close", () => {
    const heading = element("h2", -1);
    const close = element("button");
    const submit = element("button");
    MountFocusTrap(modal(heading, close, element("textarea"), submit));
    heading.focus();
    flushFrames();
    expect(documentState.activeElement).toBe(heading);
    expect(key("Tab", true).defaultPrevented).toBe(true);
    expect(documentState.activeElement).toBe(submit);
  });

  it("wraps Tab from a programmatically focused status after the final action", () => {
    const close = element("button");
    const status = element("p", -1);
    MountFocusTrap(modal(close, element("button"), status));
    status.focus();
    expect(key().defaultPrevented).toBe(true);
    expect(documentState.activeElement).toBe(close);
  });

  it.each([false, true])("leaves interior native Tab order intact (reverse: %s)", (reverse) => {
    const message = element("p", -1);
    MountFocusTrap(modal(element("button"), message, element("input")));
    message.focus();
    expect(key("Tab", reverse).defaultPrevented).toBe(false);
    expect(documentState.activeElement).toBe(message);
  });

  it("preserves normal first/last control wrapping and native interior navigation", () => {
    const first = element("button");
    const middle = element("textarea");
    const last = element("button");
    MountFocusTrap(modal(first, middle, last));
    first.focus();
    expect(key("Tab", true).defaultPrevented).toBe(true);
    expect(documentState.activeElement).toBe(last);
    expect(key().defaultPrevented).toBe(true);
    expect(documentState.activeElement).toBe(first);
    middle.focus();
    expect(key().defaultPrevented).toBe(false);
  });

  it("includes a native disclosure summary as the last Tab stop", () => {
    const first = element("button");
    const summary = element("summary");
    MountFocusTrap(modal(first, element("details").append(summary)));
    first.focus();
    expect(key().defaultPrevented).toBe(false);
    summary.focus();
    expect(key().defaultPrevented).toBe(true);
    expect(documentState.activeElement).toBe(first);
  });

  it("does not count negative-tabindex command options as sequential Tab stops", () => {
    const first = element("input");
    const last = element("button");
    MountFocusTrap(modal(first, last, element("button", -1)));
    last.focus();
    expect(key().defaultPrevented).toBe(true);
    expect(documentState.activeElement).toBe(first);
  });

  it("lets only the nested custom modal own Tab and Escape and restores its opener", () => {
    const parentFirst = element("button");
    const childOpener = element("button");
    const parentEscape = vi.fn();
    MountFocusTrap(modal(parentFirst, childOpener), parentEscape);
    childOpener.focus();
    const childHeading = element("h2", -1);
    const childLast = element("button");
    const childEscape = vi.fn();
    const closeChild = MountFocusTrap(modal(childHeading, childLast), childEscape);
    childHeading.focus();
    expect(key("Tab", true).defaultPrevented).toBe(true);
    expect(documentState.activeElement).toBe(childLast);
    key("Escape");
    expect(childEscape).toHaveBeenCalledOnce();
    expect(parentEscape).not.toHaveBeenCalled();
    closeChild();
    flushFrames();
    expect(documentState.activeElement).toBe(childOpener);
  });

  it("does not intercept a separate portalled dialog owned by another focus manager", () => {
    MountFocusTrap(modal(element("button")));
    const nestedControl = element("button");
    modal(nestedControl);
    nestedControl.focus();
    expect(key("Tab", true).defaultPrevented).toBe(false);
    expect(key("Escape").defaultPrevented).toBe(false);
  });

  it("focuses an otherwise empty dialog and contains its Tab key", () => {
    const container = modal(element("p"));
    MountFocusTrap(container);
    flushFrames();
    expect(container.attributes.get("tabindex")).toBe("-1");
    expect(documentState.activeElement).toBe(container);
    expect(key().defaultPrevented).toBe(true);
    expect(documentState.activeElement).toBe(container);
  });
});
