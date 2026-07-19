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

  it("keeps mobile navigation balanced and delays duplicate sticky actions", () => {
    const header = read("src/components/marketing/PrecisionPublicHeader.tsx");
    const stickyCta = read("src/components/marketing/MarketingStickyCta.tsx");

    expect(header).toContain("ml-auto lg:hidden");
    expect(stickyCta).toContain('document.querySelector(".marketing-hero__actions")');
    expect(stickyCta).toContain("IntersectionObserver");
    expect(stickyCta).toContain("if (!visible) return null");
  });

  it("keeps each mobile footer column vertical and intrinsically sized", () => {
    const responsive = read("src/styles/responsive.css");

    expect(responsive).toMatch(
      /\.marketing-footer-nav\s*\{[^}]*display: flex !important;[^}]*flex-direction: column;/,
    );
    expect(responsive).not.toMatch(
      /\.marketing-footer-nav\s*\{[^}]*grid-template-columns: repeat\(2/,
    );
  });

  it("loads the public QA layer last and keeps centered labels on the shared axis", () => {
    const marketingBundle = read("src/styles/wireline-marketing-surfaces.css");
    const publicPolish = read("src/styles/public-marketing-polish.css");
    const hero = read("src/components/marketing/MarketingHero.tsx");

    expect(marketingBundle.trimEnd()).toMatch(/@import "\.\/public-marketing-polish\.css";$/);
    expect(publicPolish).toContain(":where(.text-center, .wl-marketing-center)");
    expect(publicPolish).toContain("text-align: center");
    expect(publicPolish).toContain(".marketing-footer-rail");
    expect(publicPolish).toContain("overflow-wrap: anywhere");
    expect(hero).toContain("w-full min-w-0 max-w-[70rem]");
  });

  it("keeps the public signal mark violet from the first terminal", () => {
    const mark = read("src/components/brand/WirelineMark.tsx");

    expect(mark).not.toContain("#C7CCD6");
    expect(mark).not.toContain("action-secondary-default");
    expect(mark).toContain('<stop offset="0" stopColor="#8B5CF6" />');
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
    expect(blog).toContain("structuredData={structuredData}");
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
