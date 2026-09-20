import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TransitionSurface from "../src/components/TransitionSurface";
import BrowserHandoffBridge from "../src/pages/BrowserHandoffBridge";

const harness = vi.hoisted(() => ({
  error: null as string | null,
  effects: [] as Array<() => void>,
  authFetch: vi.fn(),
}));

// Exercise the real handoff state and rendered transition tree with the
// repository's lightweight hook harness; no browser or live provider needed.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: () => [harness.error, (value: string | null) => (harness.error = value)],
  useEffect: (effect: () => void) => harness.effects.push(effect),
}));
vi.mock("react-router", () => ({
  Link: "a",
  Navigate: "navigate",
  useLocation: () => ({ pathname: "/studio/handoff", hash: "" }),
}));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "owner-1" }, loading: false }),
}));
vi.mock("../src/lib/api", () => ({ authFetch: harness.authFetch }));

type Props = {
  children?: ReactNode;
  role?: string;
  className?: string;
  to?: string;
  "aria-busy"?: string;
};

function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}

beforeEach(() => {
  harness.error = null;
  harness.effects = [];
  harness.authFetch.mockReset();
});

describe("handoff recovery and transition status", () => {
  it("retains the default working status for loading transitions", () => {
    const rendered = elements(TransitionSurface({ eyebrow: "Studio", title: "Opening" }));

    expect(rendered.find((node) => node.props.role === "status")?.props["aria-busy"]).toBe("true");
    expect(rendered.some((node) => node.props.children === "Working")).toBe(true);
  });

  it.each(["", "   "])("omits busy status for the non-loading label %j", (busyLabel) => {
    const rendered = elements(
      TransitionSurface({ eyebrow: "Studio", title: "Unavailable", busyLabel }),
    );

    expect(rendered.some((node) => node.props.role === "status")).toBe(false);
    expect(rendered.some((node) => node.props.className?.includes("animate-spin"))).toBe(false);
  });

  it("provides a usable Studio exit without a spinner when browser context is missing", () => {
    const loading = BrowserHandoffBridge();
    expect(loading.props.title).toBe("Securing Browser Context");
    expect(loading.props.busyLabel).toBe("Preparing Studio");

    for (const effect of harness.effects.splice(0)) effect();

    const failed = BrowserHandoffBridge();
    expect(failed.type).toBe(TransitionSurface);
    expect(failed.props.title).toBe("Handoff Unavailable");
    expect(failed.props.description).toBe("No browser context was provided.");
    expect(harness.authFetch).not.toHaveBeenCalled();

    const rendered = elements(TransitionSurface(failed.props));
    expect(rendered.some((node) => node.props.role === "status")).toBe(false);
    expect(
      rendered.some((node) => node.props.to === "/studio" && node.props.children === "Open Studio"),
    ).toBe(true);
  });
});
