import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthAccessPanel from "../src/components/auth/AuthAccessPanel";

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  effects: [] as Array<() => unknown>,
  mounting: true,
  search: "",
  navigate: vi.fn(),
  signIn: vi.fn(),
}));

// Same hook-state harness as auth-access-pending, in signup mode with a
// stored pricing intent (a visitor who clicked "Start with Starter") and a
// ready paid plan. P-4: signup must show no plan, no pill, no checkout
// framing even then. The plan choice lives in the post-create wizard.
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useState: (initial: unknown) => {
      const index = harness.stateCursor++;
      if (!(index in harness.states)) {
        harness.states[index] = typeof initial === "function" ? initial() : initial;
      }
      return [
        harness.states[index],
        (next: unknown) => {
          harness.states[index] = typeof next === "function" ? next(harness.states[index]) : next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = harness.refCursor++;
      return (harness.refs[index] ??= { current: initial });
    },
    useEffect: (effect: () => unknown) => {
      if (harness.mounting) harness.effects.push(effect);
    },
  };
});
vi.mock("react-router", () => ({
  Link: "a",
  useLocation: () => ({ pathname: "/signup", search: harness.search }),
  useNavigate: () => harness.navigate,
}));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false, signIn: harness.signIn }),
}));
vi.mock("../src/lib/canonical-browser-origin", () => ({
  canonicalLegacyBrowserHandoff: () => null,
}));
vi.mock("../src/lib/auth-redirect", () => ({
  persistAuthRedirect: vi.fn(),
  persistOAuthReturnFromSearch: vi.fn(),
  persistWorkspaceMode: vi.fn(),
  readRedirectFromSearch: () => null,
  readStoredWorkspaceMode: () => null,
  resolvePostAuthDestination: () => "/studio",
  workspaceFromIntent: () => "personal",
}));
vi.mock("../src/lib/signup-intent", () => ({
  captureSignupIntentFromLocation: () => ({
    preferredPlanId: "usage",
    preferredUsageTier: "starter",
    preferredBillingInterval: "month",
    capturedAt: new Date().toISOString(),
  }),
  sanitizeSignupIntent: (intent: unknown) => intent,
  syncSignupIntent: vi.fn(),
}));
vi.mock("../src/hooks/usePaidPlanAvailability", () => ({
  usePaidPlanAvailability: () => ({
    notice: "Choose a plan and check out.",
    billingModel: "usage",
    status: "ready",
  }),
}));
vi.mock("../src/lib/demo-attribution-client", () => ({
  captureDemoSourceFromLocation: vi.fn(),
  readDemoSourceCookie: () => null,
}));
vi.mock("../src/lib/product-event-client", () => ({
  emitProductEventOnce: vi.fn(),
}));
vi.mock("../src/lib/post-signup-onboarding", () => ({
  clearFreshSignupSession: vi.fn(),
  markFreshSignupSession: vi.fn(),
}));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "aside" }));
vi.mock("../src/components/ui/shadcn/Checkbox", () => ({ Checkbox: "input" }));
vi.mock("../src/components/brand/WirelineBrand", () => ({
  WirelineLockup: "span",
}));

type Props = {
  children?: ReactNode;
  className?: string;
  type?: string;
  to?: string;
  role?: string;
};

function descendants(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Props>;
  return [element, ...descendants(element.props.children)];
}

function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as ReactElement<Props>).props.children);
  }
  return "";
}

beforeEach(() => {
  harness.states = [];
  harness.refs = [];
  harness.stateCursor = 0;
  harness.refCursor = 0;
  harness.effects = [];
  harness.mounting = true;
});

describe("signup stays plan-neutral (P-4)", () => {
  it("shows the workspace welcome with no plan pill, no Change plan link, and no paid-plan notice", () => {
    harness.stateCursor = 0;
    harness.refCursor = 0;
    const elements = descendants(AuthAccessPanel({ embedded: true, initialMode: "signup" }));
    const allText = elements.map((element) => textOf(element)).join(" ");

    expect(allText).toContain("Your First Bot Starts Here");
    expect(allText).not.toContain("Change plan");
    expect(allText).not.toContain("Choose a plan and check out");
    expect(allText).not.toContain("$24");
    expect(
      elements.some((element) => element.props.className === "wl-access-panel__intent"),
    ).toBe(false);
    expect(
      elements.some(
        (element) => element.props.role === "status" && textOf(element).includes("check out"),
      ),
    ).toBe(false);
    // The account form itself is intact.
    expect(allText).toContain("Create Account");
  });
});
