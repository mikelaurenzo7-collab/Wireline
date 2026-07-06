import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("marketing centering contract", () => {
  it("keeps centered public rails and actions as the marketing default", () => {
    const claritySystem = read("src/styles/clarity-system.css");

    expect(claritySystem).toContain(
      ".marketing-surface :is(.wl-public-rail, .wl-marketing-center)",
    );
    expect(claritySystem).toContain("text-align: center");
    expect(claritySystem).toContain(".marketing-surface .wl-marketing-actions");
    expect(claritySystem).toContain("justify-content: center");
    expect(claritySystem).not.toContain("left-aligned reading rail");
  });

  it("lets scroll marketing pages grow before rendering the footer", () => {
    const frame = read("src/components/layout/MarketingPageFrame.tsx");

    expect(frame).toContain('scroll ? "grow" : "min-h-0 flex-1"');
    expect(frame).not.toContain('"relative z-10 min-h-0 flex-1"');
  });

  it("keeps the retired Sarah call preview fully removed from use cases", () => {
    const solutionsPage = read("src/pages/SolutionsPage.tsx");

    expect(existsSync(resolve(process.cwd(), "src/components/marketing/HeroCallPreview.tsx"))).toBe(
      false,
    );
    expect(solutionsPage).not.toContain("HeroCallPreview");
    expect(solutionsPage).not.toContain("Sarah");
    expect(solutionsPage).toContain("wl-marketing-center");
    expect(solutionsPage).toContain("BrowserCallWidget");
  });

  it("ships structured data on the blog for SEO", () => {
    const blog = read("src/pages/Blog.tsx");
    expect(blog).toContain("structuredData");
    expect(blog).toContain("FAQPage");
    expect(blog).toContain("BreadcrumbList");
    expect(blog).toContain('structuredData={structuredData}');
  });

  it("keeps primary public marketing surfaces centered", () => {
    for (const path of [
      "src/pages/Features.tsx",
      "src/pages/Pricing.tsx",
      "src/pages/About.tsx",
      "src/pages/Compare.tsx",
      "src/pages/Blog.tsx",
      "src/pages/Showcase.tsx",
      "src/pages/SolutionsPage.tsx",
      "src/pages/VerticalLanding.tsx",
    ]) {
      expect(
        /text-center|wl-marketing-center/.test(read(path)),
        `${path} should carry explicit centered marketing copy`,
      ).toBe(true);
    }
  });
});
