import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarketingPageFrame from "../src/components/layout/MarketingPageFrame";
import MarketingStickyCta from "../src/components/marketing/MarketingStickyCta";
import VerticalLanding from "../src/pages/VerticalLanding";
import SolutionsPage from "../src/pages/SolutionsPage";
import Blog from "../src/pages/Blog";
import { WEDGES, type VerticalKey } from "../src/data/vertical-wedges";

const harness = vi.hoisted(() => ({ wedge: "sales" }));

// Reveal the sticky action without browser geometry. Traverse the real page,
// frame, and action components to verify that signup intent survives the chain.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: () => undefined,
  useState: () => [true, vi.fn()],
}));
vi.mock("react-router", () => ({
  Link: "a",
  useLocation: () => ({ pathname: "/", search: "", hash: "" }),
  useParams: () => ({ wedge: harness.wedge }),
}));
vi.mock("../src/components/marketing/PrecisionPublicHeader", () => ({ default: "header" }));
vi.mock("../src/components/marketing/MarketingChromeBar", () => ({ default: "footer" }));
vi.mock("../src/lib/page-meta", () => ({ PageMeta: "page-meta" }));
vi.mock("../src/lib/product-event-client", () => ({ emitProductEvent: vi.fn() }));

type Element = ReactElement<{ children?: ReactNode; to?: string }>;

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Element["props"]>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function stickyDestination(page: ReactElement<Parameters<typeof MarketingPageFrame>[0]>) {
  const frame = MarketingPageFrame(page.props);
  const action = elements(frame).find((element) => element.type === MarketingStickyCta);
  if (!action) throw new Error("Expected the public page's sticky action.");
  const rendered = MarketingStickyCta(action.props as Parameters<typeof MarketingStickyCta>[0]);
  return elements(rendered)
    .filter((element) => element.type === "a")
    .at(-1)?.props.to;
}

beforeEach(() => vi.clearAllMocks());

describe("marketing signup continuity", () => {
  it.each(Object.keys(WEDGES) as VerticalKey[])(
    "preserves the %s industry while the sticky Start Free action selects Free Builder",
    (slug) => {
      const page = VerticalLanding({ slug });
      if (!page) throw new Error("Expected the industry landing page.");
      const destination = new URL(stickyDestination(page)!, "https://botbound.me");
      expect(destination.searchParams.get("wedge")).toBe(slug);
      expect(destination.searchParams.get("plan")).toBe("free");
    },
  );

  it.each(["sales", "support"])("preserves the %s solution's signup destination", (wedge) => {
    harness.wedge = wedge;
    const page = SolutionsPage();
    const heroLink = elements(page).find(
      (element) => element.type === "a" && element.props.to?.startsWith("/signup"),
    );
    expect(heroLink?.props.to).toBeTruthy();
    expect(stickyDestination(page)).toBe(heroLink?.props.to);
  });

  it("keeps the generic free signup destination for pages without a role choice", () => {
    const page = <MarketingPageFrame stickyCta>Public content</MarketingPageFrame>;
    expect(stickyDestination(page)).toBe("/signup?plan=free");
  });

  it("targets Free Builder explicitly from both Blog signup actions", () => {
    const page = Blog();
    const signupLinks = elements(page).filter(
      (element) => element.type === "a" && element.props.to?.startsWith("/signup"),
    );
    expect(signupLinks).toHaveLength(1);
    expect(new URL(signupLinks[0].props.to!, "https://botbound.me").searchParams.get("plan")).toBe(
      "free",
    );
    expect(stickyDestination(page)).toBe("/signup?plan=free");
  });
});
