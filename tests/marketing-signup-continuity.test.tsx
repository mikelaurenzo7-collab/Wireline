import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarketingPageFrame from "../src/components/layout/MarketingPageFrame";
import MarketingStickyCta from "../src/components/marketing/MarketingStickyCta";
import VerticalLanding from "../src/pages/VerticalLanding";
import SolutionsPage from "../src/pages/SolutionsPage";
import { readFileSync } from "node:fs";
import WireAgentLanding from "../src/components/marketing/WireAgentLanding";
import { WEDGES, type VerticalKey } from "../src/data/vertical-wedges";

const harness = vi.hoisted(() => ({ wedge: "sales" }));

// Reveal the sticky action without browser geometry. Traverse the real page,
// frame, and action components to verify that signup intent survives the chain.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: () => undefined,
  useLayoutEffect: () => undefined,
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => [typeof initial === "number" ? initial : true, vi.fn()],
}));
vi.mock("react-router", () => ({
  Link: "a",
  useLocation: () => ({ pathname: "/", search: "", hash: "" }),
  useParams: () => ({ wedge: harness.wedge }),
}));
vi.mock("../src/components/marketing/PrecisionPublicHeader", () => ({ default: "header" }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../src/components/marketing/MarketingChromeBar", () => ({ default: "footer" }));
vi.mock("../src/lib/page-meta", () => ({ PageMeta: "page-meta" }));
vi.mock("../src/lib/product-event-client", () => ({
  emitProductEvent: vi.fn(),
  emitProductEventOnce: vi.fn(),
}));
vi.mock("../src/hooks/usePaidPlanAvailability", () => ({
  usePaidPlanAvailability: () => ({
    canActivate: () => false,
    needsEmailSetupReview: () => false,
    notice: "",
  }),
}));

type Element = ReactElement<{
  children?: ReactNode;
  to?: string;
  href?: string;
  className?: string;
}>;

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Element["props"]>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function stickyDestination(page: ReactElement<Parameters<typeof MarketingPageFrame>[0]>) {
  const frame = MarketingPageFrame(page.props);
  const action = elements(frame).find((element) => element.type === MarketingStickyCta);
  if (!action) return undefined;
  const rendered = MarketingStickyCta(action.props as Parameters<typeof MarketingStickyCta>[0]);
  return elements(rendered)
    .filter((element) => element.type === "a")
    .at(-1)?.props.to;
}

beforeEach(() => vi.clearAllMocks());

describe("marketing signup continuity", () => {
  it.each(Object.keys(WEDGES) as VerticalKey[])(
    "preserves the %s signup intent without a duplicate sticky action",
    (slug) => {
      const page = VerticalLanding({ slug });
      if (!page) throw new Error("Expected the industry landing page.");
      const href = elements(page).find((element) => element.props.href?.startsWith("/signup"))
        ?.props.href;
      expect(href).toBe(WEDGES[slug].primaryCta.href);
      expect(stickyDestination(page)).toBeUndefined();
      const destination = new URL(href!, "https://botbound.app");
      expect(destination.pathname).toBe("/signup");
      expect(destination.searchParams.get("wedge")).toBe(slug);
      expect(destination.searchParams.has("plan")).toBe(false);
    },
  );

  it.each(Object.keys(WEDGES) as VerticalKey[])(
    "keeps outbound positioning on the %s page free of coming-soon language",
    (slug) => {
      const page = VerticalLanding({ slug });
      const renderedText = elements(page)
        .map((element) => Children.toArray(element.props.children).join(""))
        .join(" ");
      expect(renderedText).not.toMatch(/outbound calls are not available yet|coming soon/i);
    },
  );

  it("keeps the minimal landing plan-neutral with accessible capability choices", () => {
    const text = (node: ReactNode): string =>
      Array.isArray(node)
        ? node.map(text).join("")
        : isValidElement<Element["props"]>(node)
          ? text(node.props.children)
          : typeof node === "string"
            ? node
            : "";
    const page = WireAgentLanding();
    const renderedText = elements(page)
      .map((element) => text(element.props.children))
      .join(" ");
    expect(renderedText).not.toContain("For You");
    expect(renderedText).not.toContain("Personal Assistant");
    expect(renderedText).not.toContain("For Your Business");
    expect(renderedText).not.toContain("Front Desk");
    expect(renderedText).toContain("A Phone Number. An Email Address. A Computer.");
    expect(renderedText).not.toContain("Choose calls, email, or both.");
    expect(renderedText).not.toContain("then sends you the summary");
    expect(renderedText).not.toContain("1 number + connected inbox");
    const roleLinks = elements(page).filter((element) =>
      element.props.to?.startsWith("/signup?template="),
    );
    expect(roleLinks).toHaveLength(0);
    expect(elements(page).filter((element) => element.props.role === "tab")).toHaveLength(4);
    expect(elements(page).some((element) => element.props.to === "/signup")).toBe(true);
    expect(renderedText).not.toContain("server-verifiable consent records");
    expect(renderedText).not.toContain("Federal Do Not Call screening");
    expect(renderedText).not.toMatch(/outbound calls are not available yet|coming soon/i);
  });

  it.each(["sales", "support"])("preserves the %s solution's signup destination", (wedge) => {
    harness.wedge = wedge;
    const page = SolutionsPage();
    const heroLink = elements(page).find(
      (element) => element.type === "a" && element.props.to?.startsWith("/signup"),
    );
    expect(heroLink?.props.to).toBeTruthy();
    expect(stickyDestination(page)).toBeUndefined();
    const renderedText = elements(page)
      .map((element) => Children.toArray(element.props.children).join(""))
      .join(" ");
    if (wedge === "sales") {
      expect(renderedText).toContain("Find the Right Prospects");
      expect(renderedText).toContain("Start the Conversation");
      expect(renderedText).toContain("Move the Deal Forward");
      expect(heroLink?.props.to).toBe("/signup?wedge=sales");
      expect(renderedText).not.toMatch(
        /server-verifiable consent records|Federal Do Not Call screening|not available yet|coming soon/i,
      );
    }
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "not-a-solution"])(
    "falls back to the support solution for the unknown route %s",
    (wedge) => {
      harness.wedge = wedge;
      const page = SolutionsPage();
      const heading = elements(page).find((element) => element.type === "h1");
      const heroLink = elements(page).find(
        (element) => element.type === "a" && element.props.to?.startsWith("/signup"),
      );
      expect(heading?.props.children).toBe("Meet Your Front Desk");
      expect(heroLink?.props.to).toBe("/signup?wedge=support");
      expect(stickyDestination(page)).toBeUndefined();
    },
  );

  it("keeps optional shared signup actions plan-neutral", () => {
    const page = <MarketingPageFrame stickyCta>Public content</MarketingPageFrame>;
    expect(stickyDestination(page)).toBe("/signup");
  });

  it("sends the retired blog to the changelog instead of a second signup", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain('<Route path="/blog" element={<PreservingRedirect to="/changelog" />} />');
    expect(app).not.toMatch(/path="\/blog"[\s\S]{0,80}\/signup/);
  });
});
