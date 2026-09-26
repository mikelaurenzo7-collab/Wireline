import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RouteChangeA11y from "../src/components/RouteChangeA11y";

const harness = vi.hoisted(() => ({
  location: { pathname: "/studio", search: "", hash: "" },
  first: { current: true },
  message: "",
  dependencies: undefined as readonly unknown[] | undefined,
  pendingEffect: undefined as (() => void | (() => void)) | undefined,
  cleanup: undefined as (() => void) | undefined,
  restoreTabIndex: vi.fn(),
}));

// Run the real route effect with React's dependency-change and cleanup rules.
// This catches focus being stolen after a query-backed tab or filter changes.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: () => harness.first,
  useMemo: (factory: () => unknown) => factory(),
  useState: () => [
    harness.message,
    (message: string) => {
      harness.message = message;
    },
  ],
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => {
    if (
      !harness.dependencies ||
      dependencies.some(
        (dependency, index) => !Object.is(dependency, harness.dependencies?.[index]),
      )
    ) {
      harness.pendingEffect = effect;
      harness.dependencies = dependencies;
    }
  },
}));
vi.mock("react-router", () => ({ useLocation: () => harness.location }));
vi.mock("../src/lib/temporary-tab-index", () => ({
  addTemporaryTabIndex: () => harness.restoreTabIndex,
}));

let focused: "heading" | "anchor" | "control" | null = null;
const heading = {
  focus: vi.fn(() => {
    focused = "heading";
  }),
};
const anchor = {
  focus: vi.fn(() => {
    focused = "anchor";
  }),
  scrollIntoView: vi.fn(),
};
const sectionControl = {
  focus: vi.fn(() => {
    focused = "control";
  }),
};
const scrollTo = vi.fn();
const queryModals = vi.fn((): unknown[] => []);

function render(location: Partial<typeof harness.location> = {}) {
  harness.location = { ...harness.location, ...location };
  RouteChangeA11y();
  if (harness.pendingEffect) {
    harness.cleanup?.();
    harness.cleanup = harness.pendingEffect() || undefined;
    harness.pendingEffect = undefined;
  }
  vi.runAllTimers();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  focused = null;
  queryModals.mockReset().mockReturnValue([]);
  harness.location = { pathname: "/studio", search: "", hash: "" };
  harness.first = { current: true };
  harness.message = "";
  harness.dependencies = undefined;
  harness.pendingEffect = undefined;
  harness.cleanup = undefined;
  vi.stubGlobal("window", { setTimeout, clearTimeout, scrollTo });
  vi.stubGlobal("document", {
    querySelector: () => heading,
    querySelectorAll: queryModals,
    getElementById: (id: string) => (id === "usage" ? anchor : null),
  });
});

afterEach(() => {
  harness.cleanup?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("route change focus", () => {
  it("focuses the initial page without announcing a navigation", () => {
    render();
    expect(heading.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, left: 0 });
    expect(harness.message).toBe("");
  });

  it("preserves section-control focus and scrolling across query-only changes", () => {
    render({ search: "?agent=bot-1&section=setup" });
    vi.clearAllMocks();
    sectionControl.focus();

    render({ search: "?agent=bot-1&section=review" });
    render({ search: "?agent=bot-1&section=setup" });

    expect(focused).toBe("control");
    expect(heading.focus).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(harness.restoreTabIndex).not.toHaveBeenCalled();
    expect(harness.message).toBe("");
  });

  it("lets an open dialog own focus when a deep-linked page loads", () => {
    queryModals.mockReturnValue([{ closest: () => null, getClientRects: () => [{}] }]);
    sectionControl.focus();

    render({ search: "?create=1" });

    expect(focused).toBe("control");
    expect(heading.focus).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(harness.message).toBe("");

    queryModals.mockReturnValue([]);
    render({ pathname: "/phone", search: "" });
    expect(heading.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(harness.message).toBe("Phone loaded");
  });

  it("focuses the destination while a closing sheet finishes its animation", () => {
    render();
    vi.clearAllMocks();
    queryModals.mockReturnValue([{ closest: () => ({}), getClientRects: () => [{}] }]);

    render({ pathname: "/settings/billing" });

    expect(heading.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(harness.message).toBe("Settings loaded");
  });

  it("still focuses and announces a different page", () => {
    render();
    vi.clearAllMocks();
    render({ pathname: "/phone", search: "?tab=logs" });

    expect(heading.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, left: 0 });
    expect(harness.restoreTabIndex).toHaveBeenCalledOnce();
    expect(harness.message).toBe("Phone loaded");
  });

  it("still follows a changed anchor while ignoring later filter changes", () => {
    render({ pathname: "/settings/billing" });
    vi.clearAllMocks();
    render({ hash: "#usage" });

    expect(anchor.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(anchor.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start" });
    expect(heading.focus).not.toHaveBeenCalled();
    vi.clearAllMocks();
    render({ search: "?period=month" });
    expect(anchor.focus).not.toHaveBeenCalled();
    expect(anchor.scrollIntoView).not.toHaveBeenCalled();
  });
});
