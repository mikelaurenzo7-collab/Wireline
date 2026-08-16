import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("safe-area spacing ownership", () => {
  it("keeps the exact-height application root unpadded", () => {
    const app = read("src/App.tsx");
    const ownership = read("src/styles/safe-area-ownership.css");
    const index = read("src/index.css");

    expect(app).toContain("wl-ui-caps w-full max-w-[100vw] overflow-x-hidden");
    expect(app).not.toContain("safe-area-insets");
    expect(ownership).toContain("The application root is exactly 100dvh and never pads itself");
    expect(index.indexOf("safe-area-ownership.css")).toBeGreaterThan(
      index.indexOf("prestige-polish.css"),
    );
  });

  it("assigns notches and home indicators to physical public chrome", () => {
    const ownership = read("src/styles/safe-area-ownership.css");
    const header = read("src/components/marketing/PrecisionPublicHeader.tsx");

    expect(ownership).toContain(
      "--wl-marketing-chrome-top: calc(4rem + env(safe-area-inset-top, 0px))",
    );
    expect(ownership).toContain("--wl-marketing-chrome-bottom: calc(2.1rem + env(");
    expect(ownership).toContain(".wl-public-header {");
    expect(ownership).toContain(".wl-public-nav-overlay {");
    expect(ownership).toContain(".marketing-chrome-bar__row");
    expect(header).toContain("wl-public-header fixed");
    expect(header).toContain("wl-public-nav-overlay");
    expect(header).not.toContain("!top-16");
  });

  it("keeps auth and workspace children inside their safe content boxes", () => {
    const ownership = read("src/styles/safe-area-ownership.css");
    const workspace = read("src/components/WorkspaceShell.tsx");
    const responsive = read("src/styles/responsive.css");
    const hotfix = read("src/styles/visual-qa-hotfix.css");

    expect(ownership).toContain(".wl-stitch-auth-shell {");
    expect(ownership).toMatch(
      /\.wl-stitch-auth-shell \.wl-auth-form-panel \{[^}]*height: 100% !important;[^}]*max-height: 100% !important;/s,
    );
    expect(ownership).toMatch(
      /\.wl-workspace-shell \{[^}]*safe-area-inset-top[^}]*safe-area-inset-bottom/s,
    );
    expect(ownership).toContain(".wl-workspace-shell > .wl-workspace-frame > aside");
    expect(ownership).toContain('nav[aria-label="Workspace navigation"]');
    expect(ownership).toMatch(
      /@media \(max-width: 767px\)[\s\S]*\.wl-workspace-shell \.wl-workspace-content \{[^}]*padding-bottom: 5\.25rem;/,
    );
    // Main fills the shell's safe box. Dock clearance is the scroller's job, so
    // first-run pages are not given two empty bands above the mobile dock.
    expect(workspace).not.toContain("pb-[calc(5.25rem+env(safe-area-inset-bottom))]");
    expect(workspace).toContain("pb-5 sm:px-6 sm:pt-3 lg:px-8 lg:pt-4 lg:pb-6");
    expect(responsive).not.toContain(
      "padding-bottom: calc(5.25rem + env(safe-area-inset-bottom));",
    );
    expect(hotfix).not.toContain("padding-bottom: max(2.5rem");
  });

  it("protects transition surfaces that mount before public or workspace chrome", () => {
    const ownership = read("src/styles/safe-area-ownership.css");
    const transition = read("src/components/TransitionSurface.tsx");

    expect(transition).toContain("wl-transition-shell");
    expect(ownership).toMatch(
      /\.wl-transition-shell \{[\s\S]*safe-area-inset-top[\s\S]*safe-area-inset-right[\s\S]*safe-area-inset-bottom[\s\S]*safe-area-inset-left/,
    );
    expect(ownership).toMatch(
      /\.wl-transition-shell \.wl-transition-rail \{[\s\S]*min-height: calc\([\s\S]*safe-area-inset-top[\s\S]*safe-area-inset-bottom/,
    );
  });

  it("preserves the one-scroller public and form contracts", () => {
    expect(read("src/styles/viewport-first-marketing.css")).toContain(
      "padding-top: var(--wl-marketing-chrome-top);",
    );
    for (const path of ["src/pages/Features.tsx", "src/pages/Pricing.tsx", "src/pages/About.tsx"]) {
      expect(read(path), path).not.toContain('className="pt-16"');
    }
    expect(read("src/components/AuthPortal.tsx")).toContain(
      "wl-auth-form-panel flex h-[100dvh] max-h-[100dvh] items-center justify-center overflow-y-auto overscroll-contain px-4 sm:px-6",
    );
  });
});
