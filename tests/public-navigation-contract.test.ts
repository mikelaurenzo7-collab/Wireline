import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("public navigation contract", () => {
  it("keeps the public header focused on brand and account actions", () => {
    const header = source("src/components/marketing/PrecisionPublicHeader.tsx");

    expect(header).toContain('aria-label="Wireline home"');
    expect(header).toContain('aria-label="Account"');
    expect(header).toContain('to="/signin"');
    expect(header).toContain('to="/signup?plan=personal"');
    expect(header).toContain("Sign In");
    expect(header).toContain("Start Free");
    expect(header).toContain("marketing-btn-primary");
  });

  it("does not revive brochure tabs or a mobile menu", () => {
    const header = source("src/components/marketing/PrecisionPublicHeader.tsx");

    expect(header).not.toContain("DialogContent");
    expect(header).not.toContain("DialogTrigger");
    expect(header).not.toContain("SITE_NAV");
    expect(header).not.toContain('aria-label="Site"');
    expect(header).not.toContain('label: "Solutions"');
    expect(header).not.toContain('label: "Features"');
    expect(header).not.toContain('label: "Pricing"');
    expect(header).not.toContain('label: "Demos"');
    expect(header).not.toContain('label: "Trust"');
  });

  it("keeps skip navigation visually hidden until keyboard focus", () => {
    const foundation = source("src/styles/foundation.css");
    const precisionHeader = source("src/components/marketing/PrecisionPublicHeader.tsx");
    const workspaceShell = source("src/components/WorkspaceShell.tsx");
    const skipLink = source("src/components/layout/SkipToContentLink.tsx");

    expect(foundation).toContain(".wl-skip-link {");
    expect(foundation).toContain("clip-path: inset(50%)");
    expect(foundation).toContain("transform: translateY(calc(-100% - 1.5rem))");
    expect(foundation).toContain("opacity: 0");
    expect(foundation).toContain(".wl-skip-link:focus-visible");
    expect(foundation).toContain("clip-path: none");
    expect(foundation).toContain("opacity: 1");

    expect(skipLink).toContain("hiddenStyle");
    expect(skipLink).toContain("focusedStyle");
    expect(skipLink).toContain('className="wl-skip-link"');
    expect(skipLink).toContain("onFocus");
    expect(skipLink).toContain("onBlur");
    expect(precisionHeader).toContain('<SkipToContentLink href="#main-content" />');
    expect(workspaceShell).toContain('<SkipToContentLink href="#workspace-main" />');
    expect(existsSync(resolve(root, "src/components/marketing/PublicSiteHeader.tsx"))).toBe(false);

    const marketingChrome = source("src/components/marketing/MarketingChrome.tsx");
    expect(marketingChrome).toMatch(/<main\b[^>]*\bid="main-content"/);
    expect(marketingChrome).not.toMatch(/<div\b[^>]*\bid="main-content"/);
  });
});
