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

  it("loads public polish then hierarchy, and keeps centered labels on the shared axis", () => {
    const marketingBundle = read("src/styles/wireline-marketing-surfaces.css");
    const publicPolish = read("src/styles/public-marketing-polish.css");
    const hero = read("src/components/marketing/MarketingHero.tsx");
    const polishIndex = marketingBundle.indexOf("public-marketing-polish.css");
    const hierarchyIndex = marketingBundle.indexOf("marketing-information-hierarchy.css");

    expect(polishIndex).toBeGreaterThanOrEqual(0);
    expect(hierarchyIndex).toBeGreaterThan(polishIndex);
    // The viewport frame loads last among shared marketing rhythm files.
    // The home call-stage is a page-specific surface and must follow it.
    expect(marketingBundle.indexOf("viewport-first-marketing.css")).toBeGreaterThan(hierarchyIndex);
    expect(marketingBundle.indexOf("landing-call-stage.css")).toBeGreaterThan(
      marketingBundle.indexOf("viewport-first-marketing.css"),
    );
    expect(marketingBundle.trimEnd()).toMatch(/@import "\.\/landing-call-stage\.css";$/);
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

  it("gives every public route exactly one bounded scroller", () => {
    const frame = read("src/components/layout/MarketingPageFrame.tsx");

    // The frame no longer grows with content: the window is the frame. Every
    // public route is 100dvh with one scroller between a fixed header and a
    // pinned chrome bar, so no public page has a document scrollbar at any
    // width. See src/styles/viewport-first-marketing.css.
    expect(frame).toContain('"marketing-flow relative z-10"');
    expect(frame).toContain("marketing-surface");
    expect(frame).toContain("marketing-frame-stack");
    expect(frame).not.toContain("resp-adaptive-grid");
    // Long-form document routes still need a way out of panel composition.
    expect(frame).toContain("marketing-longform");
  });

  it("lets a one-screen panel fill the flow instead of sitting under the header", () => {
    const frameCss = read("src/styles/viewport-first-marketing.css");
    const executableCss = frameCss.replace(/\/\*[\s\S]*?\*\//g, "");
    const solutionsPage = read("src/pages/SolutionsPage.tsx");

    expect(frameCss).toContain(".marketing-flow > .marketing-frame-stack");
    expect(executableCss).toContain(".marketing-flow > .marketing-frame-stack > *");
    expect(executableCss).not.toContain("padding-block: 0.45rem");
    expect(solutionsPage.match(/marketing-section--screen/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the retired Sarah call preview fully removed from use cases", () => {
    const solutionsPage = read("src/pages/SolutionsPage.tsx");

    expect(existsSync(resolve(process.cwd(), "src/components/marketing/HeroCallPreview.tsx"))).toBe(
      false,
    );
    expect(solutionsPage).not.toContain("HeroCallPreview");
    expect(solutionsPage).not.toContain("Sarah");
    // The two `wl-marketing-center` blocks were the wrappers around two display
    // headings that have since become eyebrow labels — one screen carries one
    // headline. The page still declares its alignment explicitly, which is what
    // the blanket centering rule in clarity-system.css requires.
    expect(solutionsPage).toContain("text-center");
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
      // `!text-left` is the deliberate opt-out: /about is built to be
      // identifiable at a glance as *not* the landing page, and the blanket
      // centering rule in clarity-system.css would otherwise re-centre it.
      expect(
        /text-center|wl-marketing-center|!text-left/.test(read(path)),
        `${path} should explicitly declare its copy alignment`,
      ).toBe(true);
    }
  });
});
