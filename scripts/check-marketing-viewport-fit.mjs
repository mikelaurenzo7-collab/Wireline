/**
 * Marketing document-flow check.
 *
 * Public routes use the browser document as the one vertical scroll owner.
 * Authenticated workspace routes keep the fixed 100dvh application shell.
 * This source check prevents the two layout contracts from drifting together.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const executable = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PUBLIC_SURFACES = ["src/components/layout/MarketingPageFrame.tsx"];

const FRAMED_PAGES = [
  "src/pages/About.tsx",
  "src/pages/Blog.tsx",
  "src/pages/Compare.tsx",
  "src/pages/Developers.tsx",
  "src/pages/Features.tsx",
  "src/pages/Pricing.tsx",
  "src/pages/SolutionsPage.tsx",
  "src/pages/VerticalLanding.tsx",
  "src/components/ContactPage.tsx",
  "src/components/SupportPage.tsx",
];

const failures = [];

for (const path of PUBLIC_SURFACES) {
  const source = read(path);

  if (!source.includes("marketing-surface")) {
    failures.push(`${path}: public surface must render .marketing-surface`);
  }
  if (!source.includes("marketing-flow")) {
    failures.push(`${path}: public surface must render one .marketing-flow content region`);
  }

  const flowCount = source.split("marketing-flow").length - 1;
  if (flowCount > 1) {
    failures.push(`${path}: ${flowCount} .marketing-flow regions found; public pages allow one`);
  }

  if (/<main[^>]*className="[^"]*\bpt-16\b/.test(source)) {
    failures.push(`${path}: header offset belongs to the shared marketing flow`);
  }
}

for (const path of FRAMED_PAGES) {
  const source = read(path);
  if (!source.includes("MarketingPageFrame")) {
    failures.push(`${path}: public page must use MarketingPageFrame`);
  }
}

const app = read("src/App.tsx");
for (const [needle, description] of [
  ["ViewportModeRoot", "App must own route-aware viewport mode"],
  ["isWorkspaceRoute(pathname)", "viewport mode must follow authenticated route scope"],
  ["html.dataset.wirelineViewport = mode", "the document root must receive viewport mode"],
  ["body.dataset.wirelineViewport = mode", "the body must receive viewport mode"],
  ["wl-ui-caps--${mode}", "the application root must expose its viewport mode"],
]) {
  if (!app.includes(needle)) failures.push(`src/App.tsx: ${description}`);
}

const surfaceIndex = read("src/styles/wireline-marketing-surfaces.css");
const documentCss = read("src/styles/marketing-document-flow.css");

if (!surfaceIndex.includes('@import "./marketing-document-flow.css";')) {
  failures.push("src/styles/wireline-marketing-surfaces.css: document flow must be loaded");
}
if (
  surfaceIndex.indexOf('@import "./marketing-document-flow.css";') <
  surfaceIndex.indexOf('@import "./viewport-first-marketing.css";')
) {
  failures.push(
    "src/styles/wireline-marketing-surfaces.css: document flow must override the retired viewport-first layer",
  );
}

for (const [needle, description] of [
  ['data-wireline-viewport="document"', "public document mode must be explicit"],
  ["height: auto;", "public surfaces must grow with content"],
  ["overflow-y: auto;", "the document must own vertical scrolling"],
  ["overflow: visible;", "public surface content must not be clipped"],
  ["scroll-snap-type: none;", "public sections must not snap"],
  ["min-height: 100dvh;", "short public pages must still fill the screen"],
  ["font-synthesis: none;", "fonts must not synthesize unsupported weights"],
  ["-webkit-font-smoothing: auto;", "font rendering must follow the platform"],
]) {
  if (!documentCss.includes(needle)) {
    failures.push(`src/styles/marketing-document-flow.css: ${description} (missing "${needle}")`);
  }
}

for (const forbidden of ["scroll-snap-type: y proximity;", "scroll-snap-type: y mandatory;"]) {
  if (executable(documentCss).includes(forbidden)) {
    failures.push(
      `src/styles/marketing-document-flow.css: forbidden public scroll rule ${forbidden}`,
    );
  }
}

const frameSource = read("src/components/layout/MarketingPageFrame.tsx");
if (!frameSource.includes("marketing-frame-stack")) {
  failures.push(
    "src/components/layout/MarketingPageFrame.tsx: public content must keep one frame stack",
  );
}
if (frameSource.includes("resp-adaptive-grid")) {
  failures.push(
    "src/components/layout/MarketingPageFrame.tsx: page-level responsive grid is forbidden",
  );
}

const home = read("src/components/marketing/WireAgentLanding.tsx");
const executableHome = executable(home);
for (const [needle, description] of [
  ["marketing-surface", "home must keep the public marketing surface"],
  ["landing-prestige__hero", "home must keep the centered hero"],
  ["<PrecisionPublicHeader />", "home must share the public header"],
  ["<BotBoundMark", "home must lead with the canonical phone-Bot mascot"],
  ['to="/signup"', "home must keep neutral account creation"],
  ['to="/signin"', "home must keep sign-in one action away"],
  ["FEATURED_TEMPLATES.map", "home must expose the canonical role choices"],
  [
    "to={`/signup?template=${encodeURIComponent(template.key)}`}",
    "each role must preserve its signup intent",
  ],
  ['id="solutions"', "home must include solutions"],
  ['id="pricing"', "home must include pricing"],
  ["landing-prestige__trust", "home must include trust controls"],
  ["<LandingFooter />", "home must retain footer wayfinding"],
]) {
  if (!executableHome.includes(needle)) {
    failures.push(`src/components/marketing/WireAgentLanding.tsx: ${description}`);
  }
}
if (
  /BrowserCallWidget|useProtectedPublicDemo|\/api\/public\/demo-(?:session|call)/.test(
    executableHome,
  )
) {
  failures.push(
    "src/components/marketing/WireAgentLanding.tsx: retired public voice-preview code must stay off the landing page",
  );
}
if (/variant="phone"|landing-phone|landing-os__tray|chrome="hidden"/.test(executableHome)) {
  failures.push(
    "src/components/marketing/WireAgentLanding.tsx: retired device markers must stay removed",
  );
}

const showcase = executable(read("src/pages/Showcase.tsx"));
for (const [needle, description] of [
  ["<Navigate", "retired Showcase must redirect instead of rendering a public voice preview"],
  ['to="/signup"', "Showcase must use neutral account creation"],
  ["replace", "Showcase redirect must replace the retired history entry"],
]) {
  if (!showcase.includes(needle)) failures.push(`src/pages/Showcase.tsx: ${description}`);
}
if (/BrowserCallWidget|useProtectedPublicDemo|RTCPeerConnection|getUserMedia/.test(showcase)) {
  failures.push("src/pages/Showcase.tsx: retired public voice-preview runtime must stay removed");
}

const landingFooter = read("src/components/marketing/LandingFooter.tsx");
if (!landingFooter.includes("<MarketingChromeBar />")) {
  failures.push("src/components/marketing/LandingFooter.tsx: shared public link bar is missing");
}

const header = executable(read("src/components/marketing/PrecisionPublicHeader.tsx"));
if (/Dialog|SITE_NAV|aria-label="Site"/.test(header)) {
  failures.push(
    "src/components/marketing/PrecisionPublicHeader.tsx: public header must not contain a full-site navigation overlay",
  );
}
if (!header.includes('aria-label="Account"')) {
  failures.push(
    "src/components/marketing/PrecisionPublicHeader.tsx: account actions must remain named",
  );
}

const landingPrestige = read("src/styles/landing-prestige.css");
for (const [needle, description] of [
  [".landing-prestige__role-grid", "role grid is missing"],
  [".landing-prestige__price-grid", "pricing grid is missing"],
  [".landing-prestige__trust", "trust exit is missing"],
  ["@media (max-width: 820px)", "mobile stacking rules are missing"],
]) {
  if (!landingPrestige.includes(needle)) {
    failures.push(`src/styles/landing-prestige.css: ${description}`);
  }
}

if (failures.length > 0) {
  console.error("Marketing document-flow check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Marketing document-flow check passed (${PUBLIC_SURFACES.length + FRAMED_PAGES.length} public surfaces)`,
);
