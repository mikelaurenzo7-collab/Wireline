import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageMeta } from "../src/lib/page-meta";

// Execute the real metadata effect against a small DOM surface. No browser,
// network, authentication, or provider credentials are involved in this test.
vi.mock("react", () => ({ useEffect: (effect: () => void) => effect() }));

class HeadElement {
  attributes = new Map<string, string>();
  id = "";
  type = "";
  textContent: string | null = null;

  constructor(
    readonly tagName: string,
    private readonly siblings: HeadElement[],
  ) {}

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  remove() {
    const index = this.siblings.indexOf(this);
    if (index >= 0) this.siblings.splice(index, 1);
  }
}

let elements: HeadElement[];

function select(selector: string): HeadElement | null {
  if (selector.startsWith("#")) {
    return elements.find((element) => element.id === selector.slice(1)) ?? null;
  }
  const match = /^(\w+)\[(\w+)="([^"]+)"\]$/.exec(selector);
  if (!match) throw new Error(`Unsupported test selector: ${selector}`);
  return (
    elements.find(
      (element) => element.tagName === match[1] && element.attributes.get(match[2]) === match[3],
    ) ?? null
  );
}

function content(name: string) {
  return select(`meta[name="${name}"]`)?.attributes.get("content");
}

beforeEach(() => {
  elements = [];
  vi.stubGlobal("document", {
    title: "",
    head: {
      querySelector: select,
      appendChild: (element: HeadElement) => elements.push(element),
    },
    createElement: (name: string) => new HeadElement(name, elements),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("page metadata across client navigation", () => {
  it("restores both crawler directives when leaving a noindex route", () => {
    PageMeta({ title: "Sign in", path: "/login", noIndex: true });
    expect(content("robots")).toBe("noindex, nofollow");
    expect(content("googlebot")).toBe("noindex, nofollow");

    PageMeta({ title: "BotBound | Bots for Your Work", path: "/" });
    expect(content("robots")).toBe("index, follow, max-image-preview:large, max-snippet:-1");
    expect(content("googlebot")).toBe("index, follow, max-image-preview:large");
    expect(select('link[rel="canonical"]')?.attributes.get("href")).toBe("https://botbound.app/");
  });

  it("replaces a prerendered Googlebot noindex directive rather than adding a duplicate", () => {
    const existing = new HeadElement("meta", elements);
    existing.setAttribute("name", "googlebot");
    existing.setAttribute("content", "noindex, nofollow");
    elements.push(existing);

    PageMeta({ title: "Pricing", path: "/pricing" });
    expect(content("googlebot")).toBe("index, follow, max-image-preview:large");
    expect(
      elements.filter((element) => element.attributes.get("name") === "googlebot"),
    ).toHaveLength(1);
  });

  it("applies both noindex directives when entering a private page", () => {
    PageMeta({ title: "Pricing", path: "/pricing" });
    PageMeta({ title: "Settings", noIndex: true });
    expect(content("robots")).toBe("noindex, nofollow");
    expect(content("googlebot")).toBe("noindex, nofollow");
    expect(select('link[rel="canonical"]')).toBeNull();
    expect(select('meta[property="og:url"]')).toBeNull();
  });

  it("keeps metadata current without duplicating tags on repeated navigation", () => {
    PageMeta({ title: "Pricing", path: "/pricing" });
    const count = elements.length;
    PageMeta({ title: "Support", path: "/support", description: "Contact BotBound support." });
    expect(elements).toHaveLength(count);
    expect(document.title).toBe("Support | BotBound");
    expect(content("description")).toBe("Contact BotBound support.");
    expect(select('meta[property="og:url"]')?.attributes.get("content")).toBe(
      "https://botbound.app/support",
    );
  });

  it("clears route-owned structured data when the next page does not supply it", () => {
    PageMeta({ title: "Pricing", path: "/pricing", structuredData: { "@type": "WebPage" } });
    expect(select("#botbound-page-jsonld")?.textContent).toBe('{"@type":"WebPage"}');
    PageMeta({ title: "Support", path: "/support" });
    expect(select("#botbound-page-jsonld")).toBeNull();
  });
});
