import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("public navigation mobile regression contract", () => {
  it("keeps the public header on the portal-backed dialog primitive", () => {
    const header = source("src/components/marketing/PrecisionPublicHeader.tsx");

    expect(header).toContain("DialogContent");
    expect(header).toContain("DialogTrigger");
    expect(header).toContain("DialogDescription");
    expect(header).toContain('presentation="navigation"');
    expect(header).toContain("showClose={false}");
    expect(header).toContain('id="wireline-mobile-navigation"');
    expect(header).not.toContain("document.body.style.overflow");
    expect(header).not.toContain("querySelector<HTMLElement>");
  });

  it("keeps all primary navigation and account actions visible in the mobile dialog", () => {
    const header = source("src/components/marketing/PrecisionPublicHeader.tsx");

    expect(header).toContain('label: "Solutions"');
    expect(header).toContain('to: "/solutions/support"');
    expect(header).toContain('label: "Features"');
    expect(header).toContain('label: "Pricing"');
    expect(header).toContain('label: "Demos"');
    expect(header).toContain('to="/signin"');
    expect(header).toContain('to="/signup"');
    expect(header).toContain("Start");
    expect(header).toContain("marketing-btn-primary");
  });

  it("keeps skip navigation visually hidden until keyboard focus", () => {
    const foundation = source("src/styles/foundation.css");
    const precisionHeader = source("src/components/marketing/PrecisionPublicHeader.tsx");
    const publicHeader = source("src/components/marketing/PublicSiteHeader.tsx");
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
    expect(publicHeader).toContain('<SkipToContentLink href="#main-content" />');
    expect(workspaceShell).toContain('<SkipToContentLink href="#workspace-main" />');
    expect(publicHeader).not.toContain("focus:not-sr-only");

    // MarketingChrome pages (#security, legal, trust, status) must use a real
    // <main> landmark — not a skip-target-only div — so SR landmark nav works.
    const marketingChrome = source("src/components/marketing/MarketingChrome.tsx");
    expect(marketingChrome).toMatch(/<main\b[^>]*\bid="main-content"/);
    expect(marketingChrome).not.toMatch(/<div\b[^>]*\bid="main-content"/);
  });

  it("keeps Dialog capable of route-safe overlay, close-control, and navigation composition", () => {
    const dialog = source("src/components/atoms/Dialog.tsx");

    expect(dialog).toContain("dialogContentVariants = cva");
    expect(dialog).toContain("presentation: {");
    expect(dialog).toContain("navigation:");
    expect(dialog).toContain("overlayClassName?: string");
    expect(dialog).toContain("showClose?: boolean");
    expect(dialog).toContain('data-slot="dialog-overlay"');
    expect(dialog).toContain("DialogPortal");
  });
});
