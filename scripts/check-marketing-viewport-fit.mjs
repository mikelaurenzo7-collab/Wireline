/**
 * Marketing viewport-fit check.
 *
 * The public surface has one structural rule: the window is the frame, and the
 * frame never scrolls. Every public route renders `.marketing-surface` (100dvh,
 * `overflow: hidden`) wrapping exactly one `.marketing-flow` scroller, with a
 * fixed header above it and a pinned chrome bar below. See
 * `src/styles/viewport-first-marketing.css` for the three mechanisms.
 *
 * This reads source rather than a browser because the failure it guards is a
 * structural one, and it is the kind that comes back a page at a time: a route
 * re-adds `min-h-screen`, or hand-rolls its own `<main className="pt-16">`, or
 * grows a second scroller, and that one page quietly gets a document scrollbar
 * while every other page keeps the frame. A screenshot job would catch it later
 * and more expensively; this catches it in the diff that introduces it.
 *
 * What it cannot check is whether a panel's *content* fits its screen. That
 * stays an editorial judgement, made against a real browser at 1440x900 — the
 * numbers in `docs/DESIGN_VIEWPORT_BASELINE.md` are the record of it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

/** Every route that renders public marketing chrome. */
const PUBLIC_SURFACES = [
  "src/components/marketing/WireAgentLanding.tsx",
  "src/components/layout/MarketingPageFrame.tsx",
  "src/pages/Features.tsx",
  "src/pages/Pricing.tsx",
];

/** Pages that reach the frame through the shared component. */
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
    failures.push(
      `${path}: ${flowCount} .marketing-flow scrollers -- the frame allows exactly one`,
    );
  }

  // `min-h-screen` / `min-h-dvh` on a surface that is already exactly 100dvh
  // can only make it taller than the window, which is how a public page grows
  // a document scrollbar back.
  for (const utility of ["min-h-screen", "min-h-dvh"]) {
    if (source.includes(utility)) {
      failures.push(`${path}: ${utility} defeats the 100dvh frame and returns the page scrollbar`);
    }
  }

  // The scroller owns the offset from the fixed header, once.
  if (/<main[^>]*className="[^"]*\bpt-16\b/.test(source)) {
    failures.push(
      `${path}: hand-rolled pt-16 on <main> -- the header offset belongs to .marketing-flow`,
    );
  }
}

for (const path of FRAMED_PAGES) {
  const source = read(path);
  if (!source.includes("MarketingPageFrame")) {
    failures.push(`${path}: public page must reach the frame through MarketingPageFrame`);
  }
  if (source.includes("min-h-screen") || source.includes("min-h-dvh")) {
    failures.push(`${path}: min-height utility defeats the frame supplied by MarketingPageFrame`);
  }
}

// The frame, the panel, and the snap are one system; losing any one of them
// turns the other two into dead weight.
const frameCss = read("src/styles/viewport-first-marketing.css");
for (const [needle, description] of [
  ["height: 100dvh;", "the surface must be exactly one viewport tall"],
  ["overflow: hidden;", "the surface must not scroll"],
  ["scroll-snap-type: y proximity;", "the flow must snap by proximity, never mandatory"],
  ["scroll-snap-align: start;", "panels must settle flush with the top of the viewport"],
  ["prefers-reduced-motion", "snap and signal motion must yield to reduced-motion"],
]) {
  if (!frameCss.includes(needle)) {
    failures.push(`src/styles/viewport-first-marketing.css: ${description} (missing "${needle}")`);
  }
}

// A `max-height` on the panel cannot make content fit; it can only clip it.
// This is how the five-column plan grid lost its bottom two rows of features.
if (/\.marketing-section \{[^}]*max-height/s.test(frameCss)) {
  failures.push(
    "src/styles/viewport-first-marketing.css: .marketing-section must not cap its own height -- " +
      "a ceiling in CSS clips content rather than composing it",
  );
}

if (failures.length > 0) {
  console.error("Marketing viewport-fit check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Marketing viewport-fit check passed (${PUBLIC_SURFACES.length + FRAMED_PAGES.length} public surfaces)`);
