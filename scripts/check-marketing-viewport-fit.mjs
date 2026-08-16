/**
 * Viewport-shell contract.
 *
 * Public and authenticated Wireline surfaces share one architectural rule: the
 * browser window is the frame. Persistent chrome stays attached and exactly
 * one content region owns vertical scrolling. Content may be longer than a
 * viewport; the document itself may not become a second scroller.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const PUBLIC_SURFACES = [
  "src/components/marketing/WireAgentLanding.tsx",
  "src/components/layout/MarketingPageFrame.tsx",
  "src/pages/Features.tsx",
  "src/pages/Pricing.tsx",
];

const FRAMED_PAGES = [
  "src/pages/About.tsx",
  "src/pages/Blog.tsx",
  "src/pages/Compare.tsx",
  "src/pages/Developers.tsx",
  "src/pages/Showcase.tsx",
  "src/pages/SolutionsPage.tsx",
  "src/pages/VerticalLanding.tsx",
  "src/components/ContactPage.tsx",
  "src/components/SupportPage.tsx",
];

const failures = [];

for (const path of PUBLIC_SURFACES) {
  const source = read(path);

  if (!source.includes("marketing-surface")) {
    failures.push(`${path}: public surface must render .marketing-surface (the 100dvh frame)`);
  }
  if (!source.includes("marketing-flow")) {
    failures.push(`${path}: public surface must render exactly one .marketing-flow scroller`);
  }

  const flowCount = source.split("marketing-flow").length - 1;
  if (flowCount > 1) {
    failures.push(`${path}: ${flowCount} .marketing-flow scrollers -- the frame allows one`);
  }

  for (const utility of ["min-h-screen", "min-h-dvh"]) {
    if (source.includes(utility)) {
      failures.push(`${path}: ${utility} defeats the 100dvh frame`);
    }
  }

  if (/<main[^>]*className="[^"]*\bpt-16\b/.test(source)) {
    failures.push(`${path}: header offset must belong to .marketing-flow, not a page utility`);
  }
}

for (const path of FRAMED_PAGES) {
  const source = read(path);
  if (!source.includes("MarketingPageFrame")) {
    failures.push(`${path}: public page must reach the frame through MarketingPageFrame`);
  }
  if (source.includes("min-h-screen") || source.includes("min-h-dvh")) {
    failures.push(`${path}: min-height utility defeats the shared frame`);
  }
}

const frameCss = read("src/styles/viewport-first-marketing.css");
for (const [needle, description] of [
  ["height: 100dvh;", "the public surface must be exactly one dynamic viewport"],
  ["overflow: hidden;", "the public surface must not scroll"],
  ["overflow-y: auto;", "the public flow must own vertical scrolling"],
  ["scroll-snap-type: y proximity;", "desktop panel snap must remain proximity-only"],
  ["scroll-snap-align: start;", "panels must settle at a stable boundary"],
  ["prefers-reduced-motion", "snap and signal motion must yield to reduced motion"],
  ["margin-inline: auto;", "centred measures must centre their boxes"],
  ["min-height: 2.24em;", "card rows must reserve a shared title height"],
]) {
  if (!frameCss.includes(needle)) {
    failures.push(`src/styles/viewport-first-marketing.css: ${description} (missing ${needle})`);
  }
}

if (/\.marketing-section \{[^}]*max-height/s.test(frameCss)) {
  failures.push(
    "src/styles/viewport-first-marketing.css: .marketing-section must not cap its own height",
  );
}

const publicHeader = read("src/components/marketing/PrecisionPublicHeader.tsx");
if (!/h-14[\s\S]*lg:h-16/.test(publicHeader)) {
  failures.push(
    "PrecisionPublicHeader: mobile h-14 and desktop h-16 must match viewport variables",
  );
}
if (!publicHeader.includes("!top-14") || !publicHeader.includes("lg:!top-16")) {
  failures.push("PrecisionPublicHeader: mobile navigation must start below the real header height");
}

const chrome = read("src/components/marketing/MarketingChromeBar.tsx");
for (const needle of [
  "marketing-chrome-bar__rail",
  "marketing-chrome-bar__mobile-optional",
  "marketing-chrome-bar__sitemap",
]) {
  if (!chrome.includes(needle)) {
    failures.push(`MarketingChromeBar: missing ${needle} mobile containment hook`);
  }
}

const finalViewportCss = read("src/styles/viewport-final-polish.css");
for (const [needle, description] of [
  ["safe-area-inset-bottom", "bottom chrome must reserve device safe area"],
  ["safe-area-inset-top", "standalone header must reserve device safe area"],
  ["orientation: landscape", "mobile landscape must have an intentional composition"],
  ["--wl-marketing-chrome-top: 3.5rem", "mobile header equation must be explicit"],
  ["--wl-marketing-chrome-top: 4rem", "desktop header equation must be explicit"],
]) {
  if (!finalViewportCss.includes(needle)) {
    failures.push(`src/styles/viewport-final-polish.css: ${description}`);
  }
}

const workspaceShell = read("src/components/WorkspaceShell.tsx");
for (const [needle, description] of [
  ["h-[100dvh]", "workspace shell must be one dynamic viewport"],
  ["overflow-hidden", "workspace shell must not become a document scroller"],
  ["wl-workspace-content min-h-0 flex-1 overflow-y-auto", "workspace content must be the one scroller"],
  ["pb-[max(0.5rem,env(safe-area-inset-bottom))]", "mobile dock must reserve bottom safe area"],
  ["fixed inset-x-0 bottom-0", "mobile dock must remain attached to the viewport"],
]) {
  if (!workspaceShell.includes(needle)) {
    failures.push(`src/components/WorkspaceShell.tsx: ${description}`);
  }
}

const productSurfaceIndex = read("src/styles/wireline-product-surfaces.css");
if (!productSurfaceIndex.includes('@import "./viewport-shell-hardening.css";')) {
  failures.push("wireline-product-surfaces.css: authenticated viewport hardening is not imported");
}

const workspaceViewportCss = read("src/styles/viewport-shell-hardening.css");
for (const [needle, description] of [
  ["max-height: 100dvh", "authenticated frame must have a hard dynamic-viewport ceiling"],
  ["scrollbar-gutter: stable", "desktop content must not shift when a scrollbar appears"],
  ["orientation: landscape", "mobile workspace landscape must be compacted intentionally"],
  ["overflow-y: auto", "modal overflow must remain inside the modal"],
  ["safe-area-inset-bottom", "workspace chrome must reserve mobile safe area"],
]) {
  if (!workspaceViewportCss.includes(needle)) {
    failures.push(`src/styles/viewport-shell-hardening.css: ${description}`);
  }
}

const modalCss = read("src/styles/modal-hierarchy.css");
if (!modalCss.includes("max-height: calc(100dvh - 1.5rem)")) {
  failures.push("modal-hierarchy.css: mobile dialogs must retain a dynamic-viewport ceiling");
}

// One screen, one display-tier headline on composed marketing panels.
const HEADLINE_TIER =
  /\bwl-(?:public-section-heading|stitch-display|page-title)\b|marketing-hero-title|<MarketingHero\b/g;

for (const path of [...PUBLIC_SURFACES, ...FRAMED_PAGES]) {
  if (path.endsWith("MarketingPageFrame.tsx")) continue;
  const source = read(path);
  if (source.includes("marketing-section--longform") || source.includes("<MarketingPageFrame longform")) {
    continue;
  }
  const panels = Math.max(1, (source.match(/\bmarketing-section\b/g) ?? []).length);
  const headlines = (source.match(HEADLINE_TIER) ?? []).length;
  if (headlines > panels) {
    failures.push(
      `${path}: ${headlines} display headings across ${panels} panel(s); one screen carries one headline`,
    );
  }
}

if (failures.length > 0) {
  console.error("Viewport-shell check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Viewport-shell check passed (${PUBLIC_SURFACES.length + FRAMED_PAGES.length} public surfaces plus authenticated shell)`,
);
