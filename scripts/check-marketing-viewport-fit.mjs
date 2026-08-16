/**
 * Marketing viewport-fit check.
 *
 * The public surface has one structural rule: the window is the frame, and the
 * frame never scrolls. Every public route renders `.marketing-surface` (100dvh,
 * `overflow: hidden`) wrapping exactly one `.marketing-flow` scroller. Public
 * routes keep a visible fixed header. Most routes also pin the compact chrome
 * bar; home omits that bar and carries legal wayfinding inside its composed
 * product theater. See `src/styles/viewport-first-marketing.css`.
 *
 * This reads source rather than a browser because the failure it guards is a
 * structural one, and it is the kind that comes back a page at a time: a route
 * re-adds `min-h-screen`, hand-rolls its own `<main className="pt-16">`, or
 * grows a second scroller. Browser tests separately certify actual dimensions,
 * mobile mechanical scrolling, and overflow at representative viewports.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const executable = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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

  for (const utility of ["min-h-screen", "min-h-dvh"]) {
    if (source.includes(utility)) {
      failures.push(`${path}: ${utility} defeats the 100dvh frame and returns the page scrollbar`);
    }
  }

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

const frameCss = read("src/styles/viewport-first-marketing.css");
for (const [needle, description] of [
  ["height: 100dvh;", "the surface must be exactly one viewport tall"],
  ["overflow: hidden;", "the surface must not scroll"],
  ["scroll-snap-type: y proximity;", "the flow must snap by proximity, never mandatory"],
  ["scroll-snap-align: start;", "panels must settle flush with the top of the viewport"],
  ["prefers-reduced-motion", "snap and signal motion must yield to reduced-motion"],
  ["margin-inline: auto;", "centred containers must centre the boxes their measure creates"],
  ["min-height: 2.24em;", "card rows must reserve a shared title height"],
  [
    ".wl-ui-caps > .marketing-surface",
    "the app shell must not turn the marketing frame into a second scroller",
  ],
]) {
  if (!frameCss.includes(needle)) {
    failures.push(`src/styles/viewport-first-marketing.css: ${description} (missing "${needle}")`);
  }
}

if (/\.marketing-section \{[^}]*max-height/s.test(frameCss)) {
  failures.push(
    "src/styles/viewport-first-marketing.css: .marketing-section must not cap its own height -- " +
      "a ceiling in CSS clips content rather than composing it",
  );
}

const home = read("src/components/marketing/WireAgentLanding.tsx");
const executableHome = executable(home);
if (!executableHome.includes("<PrecisionPublicHeader />")) {
  failures.push("src/components/marketing/WireAgentLanding.tsx: home must keep visible shared navigation");
}
if (!executableHome.includes('variant="stage"') || !executableHome.includes("landing-console")) {
  failures.push(
    "src/components/marketing/WireAgentLanding.tsx: home must render the professional live-console stage",
  );
}
if (/variant="phone"|landing-phone|landing-os__tray|chrome="hidden"/.test(executableHome)) {
  failures.push(
    "src/components/marketing/WireAgentLanding.tsx: retired device-OS executable markers must stay removed",
  );
}

const landingCss = read("src/styles/landing-call-stage.css");
for (const [needle, description] of [
  ["overflow-y: auto;", "mobile landing flow must remain mechanically scrollable"],
  ["height: auto;", "mobile landing panel must grow honestly with its content"],
  ["flex: 0 0 auto;", "mobile landing panel must not be flex-clipped to the viewport"],
]) {
  if (!landingCss.includes(needle)) {
    failures.push(`src/styles/landing-call-stage.css: ${description} (missing "${needle}")`);
  }
}

// One screen, one display-tier headline. Long-form document routes opt out.
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
      `${path}: ${headlines} display-tier headings across ${panels} panel(s) -- one screen carries ` +
        "one headline; demote supporting group titles to the eyebrow tier",
    );
  }
}

if (failures.length > 0) {
  console.error("Marketing viewport-fit check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Marketing viewport-fit check passed (${PUBLIC_SURFACES.length + FRAMED_PAGES.length} public surfaces)`);
