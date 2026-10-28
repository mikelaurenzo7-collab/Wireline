import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const read = (path: string) => source(path).replace(/\r\n/g, "\n");
const withoutComments = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, "");

function hasModalElement(text: string) {
  const file = ts.createSourceFile(
    "component.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found = false;
  function visit(node: ts.Node) {
    if (found) return;
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(file);
      found =
        (name === "role" && node.initializer.text === "dialog") ||
        (name === "aria-modal" && node.initializer.text === "true");
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return found;
}

describe("E2E design and BotBound brand polish", () => {
  it("keeps every mobile agent tab visible and readable", () => {
    const compactTabs = read("src/styles/agent-tabs-compact.css");
    expect(compactTabs).not.toMatch(/button:nth-child\(4\)\s*\{[^}]*display:\s*none/);
    expect(compactTabs).toContain("overflow-x: auto");
    expect(compactTabs).toContain("min-height: 2.75rem");
    expect(compactTabs).toContain("font-size: 0.75rem");
    expect(compactTabs).toMatch(/button:nth-child\(4\)\s*\{[^}]*display:\s*inline-flex/);
  });

  it("keeps shared workspace tabs comfortable at compact density", () => {
    const tabs = read("src/components/layout/WorkspaceTabStrip.tsx");
    expect(tabs).toContain('"min-h-[44px] px-3 text-[13px] sm:min-h-10 sm:px-3.5"');
    expect(tabs).toContain("overflow-x-auto overscroll-x-contain");
    expect(tabs).toContain("focus-visible:outline-offset-2");
  });

  it("keeps modal titles contained and body copy readable", () => {
    const dialog = read("src/components/atoms/Dialog.tsx");
    expect(dialog).toContain("text-xl font-semibold leading-[1.15]");
    expect(dialog).toContain("text-[15px] leading-6");
    expect(dialog).toContain("size-11");
    expect(dialog).toContain("max-h-[calc(100dvh-2rem)]");
    expect(dialog).toContain("overflow-y-auto overscroll-contain");
  });

  it("keeps authenticated hierarchy task-first and separates Bot selection from status", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    const refinement = read("src/styles/system-aesthetic-refinement.css");
    const selectedRule =
      withoutComments(refinement).match(
        /\.wl-rail-agent-link\[aria-current="page"\]\s*\{[\s\S]*?\}/,
      )?.[0] ?? "";
    expect(shell).toContain("wl-task-header");
    expect(shell).toContain("md:grid-cols-[minmax(0,1fr)_auto]");
    expect(shell).toContain("items-start text-left");
    expect(shell).not.toContain("wl-centered-header");
    expect(shell).toContain("aria-label={`Current Bot: ${agent.name}`}");
    expect(shell).toContain('import BotBoundMark from "./brand/BotBoundMark"');
    expect(shell).toContain('import { BotBoundWordmark } from "./brand/BotBoundBrand"');
    expect(shell).toContain('aria-label="BotBound Workspace"');
    expect(shell).toContain("data-wireline-bot-selected");
    expect(selectedRule).not.toBe("");
    expect(selectedRule).toContain("--wireline-color-action-primary-default");
    expect(selectedRule).not.toContain("status-success");
  });

  it("casts public headings in the title tier and keeps supporting copy sentence case", () => {
    const hero = read("src/components/marketing/MarketingHero.tsx");
    const polish = read("src/styles/e2e-design-polish.css");
    const executablePolish = withoutComments(polish);
    expect(polish).toContain(".marketing-surface :is(h2, h3, h4, h5, h6) {");
    const bodyRule =
      executablePolish.match(
        /\.marketing-surface :is\(p, li, \.wl-public-copy, \.wl-route-copy, \.wl-page-copy\)\s*\{[^}]*\}/,
      )?.[0] ?? "";
    expect(bodyRule).not.toBe("");
    expect(bodyRule).toContain("text-transform: none");
    expect(bodyRule).toContain("letter-spacing: normal");
    const dressers = globSync("src/styles/**/*.css", { cwd: root })
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => withoutComments(source(file)).includes("marketing-hero__description"))
      .sort();
    expect(dressers).toEqual([]);
    expect(polish).toContain(".wl-preserve-case");
    expect(hero).not.toContain("uppercase tracking-[.1em]");
    expect(hero).toContain("max-w-[19ch]");
    expect(hero).toContain("leading-[1]");
    expect(hero).not.toContain("marketing-hero__description");
  });

  it("loads terminal design refinements after responsive/modal layers in deliberate order", () => {
    const index = read("src/index.css");
    const modalAt = index.indexOf('@import "./styles/modal-hierarchy.css";');
    const polishAt = index.indexOf('@import "./styles/e2e-design-polish.css";');
    const prestigeAt = index.indexOf('@import "./styles/prestige-polish.css";');
    const aestheticAt = index.indexOf('@import "./styles/system-aesthetic-refinement.css";');
    const safeAreaAt = index.indexOf('@import "./styles/safe-area-ownership.css";');
    const botMarkAt = index.indexOf('@import "./styles/bot-mark.css";');
    const designSystemAt = index.indexOf('@import "./styles/design-system.css";');
    expect(modalAt).toBeGreaterThan(-1);
    expect(polishAt).toBeGreaterThan(modalAt);
    expect(prestigeAt).toBeGreaterThan(polishAt);
    expect(aestheticAt).toBeGreaterThan(prestigeAt);
    expect(safeAreaAt).toBeGreaterThan(aestheticAt);
    expect(botMarkAt).toBeGreaterThan(designSystemAt);
    expect(botMarkAt).toBeLessThan(modalAt);
  });

  it("keeps public navigation and mobile conversion targets clear", () => {
    const header = read("src/components/marketing/PrecisionPublicHeader.tsx");
    const sticky = read("src/components/marketing/MarketingStickyCta.tsx");
    const footer = read("src/styles/public-design-system.css");
    // The phone-Bot mascot belongs to the home hero; the shared bar carries the wordmark only.
    expect(header).toContain('<BotBoundWordmark className="wl-public-header__wordmark" />');
    expect(header).not.toContain("BotBoundLockup");
    expect(header).toContain('aria-label="BotBound home"');
    expect(header).toContain("text-sm font-medium");
    expect(header).toContain("min-h-11 px-4 text-sm font-semibold");
    expect(header).not.toContain("font-semibold uppercase");
    expect(sticky).toContain("MARKETING_VOICE.primaryCta");
    expect(sticky).toContain('secondaryLabel = "How It Works"');
    expect(sticky).toContain("min-h-[48px]");
    expect(sticky).toContain("marketing-sticky-cta__actions");
    expect(sticky).toContain("--wl-marketing-sticky-height");
    expect(footer).toContain(".marketing-surface .marketing-chrome-bar :is(a, button)");
    expect(footer).toContain("min-height: 2.75rem");
  });

  it("lets the phone conversion actions stack before their labels clip", () => {
    const hardening = read("src/styles/system-hardening.css");
    const polish = read("src/styles/public-marketing-polish.css");
    const mobile = read("src/lib/marketing-mobile.ts");
    const headerException =
      hardening
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .match(
          /\.wl-public-header \.marketing-btn-primary,[\s\S]*?\.marketing-sticky-cta \.marketing-btn-secondary \{[\s\S]*?width:\s*auto;/,
        )?.[0] ?? "";

    expect(headerException).not.toBe("");
    expect(polish).toContain(
      ".marketing-sticky-cta :is(.marketing-btn-primary, .marketing-btn-secondary)",
    );
    expect(polish).toContain("repeat(auto-fit, minmax(min(100%, 8rem), 1fr))");
    expect(mobile).not.toContain('"/blog"');
    expect(mobile).toContain('"/security"');
    expect(mobile).toContain('"/trust"');
    expect(mobile).toContain('"/features"');
    expect(mobile).toContain('"/pricing"');
  });

  it("keeps Features and Pricing on the same page-hero scale as Compare", () => {
    const features = read("src/pages/Features.tsx");
    const pricing = read("src/pages/Pricing.tsx");
    const compare = read("src/pages/Compare.tsx");
    const solutions = read("src/pages/SolutionsPage.tsx");
    const support = read("src/components/SupportPage.tsx");
    const contact = read("src/components/ContactPage.tsx");
    const notFound = read("src/components/layout/NotFound.tsx");
    const responsive = read("src/styles/responsive.css");
    const polish = read("src/styles/public-marketing-polish.css");

    expect(features).toContain("marketing-hero-title");
    expect(features).not.toContain("MarketingHero");
    // Controls use authored Title Case like every other public CTA.
    expect(features).toContain("const signedIn = Boolean(useAuth().user)");
    expect(features).toContain('to={signedIn ? "/studio" : "/signup"}');
    expect(features).toContain('{signedIn ? "Open Workspace" : "GET STARTED"}');
    expect(features).toContain(">\n                See Pricing\n");
    expect(features).not.toMatch(/START FREE|SEE PRICING/);
    const publicSystem = read("src/styles/public-design-system.css");
    expect(publicSystem).toContain("--wl-public-hero-size:");
    expect(publicSystem).toContain("h1.marketing-hero-title");
    expect(pricing).toContain("marketing-hero-title");
    expect(compare).toContain("marketing-hero-title");
    expect(solutions).toContain("marketing-hero-title");
    expect(solutions).not.toContain("<MarketingHero");
    expect(solutions).toContain("marketing-hero-title");
    expect(read("src/App.tsx")).toContain(
      '<Route path="/blog" element={<PreservingRedirect to="/changelog" />} />',
    );
    expect(support).not.toContain("marketing-hero-title");
    expect(contact).not.toContain("marketing-hero-title");
    expect(notFound).toContain("text-[4.25rem]");
    expect(notFound).not.toContain("xl:text-[12rem]");
    expect(responsive).not.toMatch(/\.wl-pricing-page h1\s*\{[^}]*10\.4vw/);
    expect(polish).toContain(".marketing-surface.wl-solutions-page .marketing-section");
    expect(polish).toContain(".marketing-surface .wl-stitch-marketing-hero");
  });

  it("keeps status foregrounds accessible while public entry paths remain text-labeled", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain('aria-labelledby="landing-prestige-showcase-title"');
    expect(landing).not.toContain("FEATURED_TEMPLATES.map");
    expect(landing).not.toContain("encodeURIComponent(template.key)");
    expect(landing).not.toMatch(/BrowserCallWidget|useProtectedPublicDemo/);
    const badge = read("src/components/atoms/Badge.tsx");
    expect(badge).toContain("text-[var(--wireline-color-status-success)]");
  });

  it("keeps the root landing a focused BotBound entrance, not a brochure", () => {
    const landing = withoutComments(read("src/components/marketing/WireAgentLanding.tsx"));
    const prestige = withoutComments(read("src/styles/landing-prestige.css"));
    const auth = read("src/styles/auth-access-panel.css");
    // Account access lives behind two clear actions instead of a split form.
    expect(landing).not.toContain("<AuthAccessPanel");
    expect(landing).toContain('signedIn ? "/studio" : "/signup"');
    expect(read("src/components/marketing/PrecisionPublicHeader.tsx")).toContain('to="/signin"');
    expect(landing).toMatch(/<h1[^>]*>[\s\S]*Your next hire[\s\S]*is a bot\.[\s\S]*<\/h1>/);
    expect(landing).not.toContain("landing-prestige__promise");
    expect(landing).toContain("<BotBoundMark");
    expect(landing).toContain("landing-prestige__hero-mark");
    expect(landing).not.toContain("landing-prestige__directions");
    expect(landing).not.toContain("Personal is $12 a month");
    expect(landing).not.toContain("HERO_CHANNEL_ORDER");
    expect(landing).not.toContain("FEATURED_TEMPLATE_KEYS");
    expect(landing).not.toContain("FEATURED_TEMPLATES.map");
    expect(landing).not.toContain("{template.summary}");
    expect(landing).toContain('to="/pricing"');
    expect(landing).not.toContain("landing-prestige__trust");
    expect(landing).not.toContain("MarketingChromeBar");
    expect(landing).toContain("<PrecisionPublicHeader />");
    expect(landing).not.toContain("ONE WORKSPACE");
    expect(landing).not.toContain("Runtime Balance");
    expect(landing).not.toContain("WIRE YOUR PHONE BOT");
    expect(prestige).toMatch(
      /\.landing-prestige__hero\s*\{[^}]*place-items:\s*center;[^}]*text-align:\s*center;/,
    );
    expect(prestige).toContain("text-wrap: balance;");
    expect(read("src/styles/landing-prestige.css")).toContain("flex-wrap: wrap;");
    expect(prestige).not.toMatch(/\.landing-prestige__(?:auth|entrance|desktop-only)\b/);
    const providerGrid = auth.match(/\.wl-access-panel__oauth\s*\{([^}]+)\}/)?.[1];
    // Provider choices must reflow when the container or enlarged labels need
    // more room; a fixed three-column row collapsed Microsoft's mark at 320px.
    expect(providerGrid).toMatch(
      /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*[\d.]+rem\),\s*1fr\)\)/,
    );
  });

  it("keeps the shell scroll-container rule from swallowing sr-only live regions", () => {
    const foundation = read("src/styles/foundation.css");
    expect(foundation).toContain(".wl-ui-caps > :not(.wl-workspace-shell, .sr-only) {");
    expect(foundation).not.toMatch(/\.wl-ui-caps\s*>\s*:not\(\.wl-workspace-shell\)\s*\{/);
    const app = read("src/App.tsx");
    expect(app).toContain("<RouteChangeA11y />");
    const routeChange = read("src/components/RouteChangeA11y.tsx");
    expect(routeChange).toContain("return null");
    expect(routeChange).toContain('document.querySelector<HTMLElement>("main h1, h1")');
  });

  it("preserves authored case for controls, customer values, and BotBound", () => {
    const caps = read("src/styles/uppercase-system.css");
    const brand = read("src/styles/brand-identity.css");
    expect(caps).toContain("text-transform: uppercase");
    expect(caps).toContain(".wl-preserve-case");
    expect(caps).toContain("text-transform: none !important");
    expect(brand).toContain(".bb-wordmark");
    expect(brand).toContain("text-transform: none");
    expect(brand).toContain(".bb-wordmark__bound");
  });

  it("gives hand-rolled dialog components an accessible name", () => {
    const files = globSync("src/**/*.tsx", { cwd: root });
    const offenders = files.filter((file) => {
      const text = source(file);
      return (
        // Named components already satisfy this contract. Only parse the
        // remaining files; a DOM selector alone does not declare a dialog.
        !/DialogTitle|aria-labelledby|aria-label=|wl-dialog-title|<h[1-3]/.test(text) &&
        hasModalElement(text)
      );
    });
    expect(offenders, `dialogs need an accessible name contract:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });

  it("keeps field captions and values in authored case", () => {
    const caps = read("src/styles/uppercase-system.css");
    expect(caps).toMatch(/:is\(label, legend, th\)[^{]*\{[^}]*text-transform: none;/);
    expect(caps).toMatch(/input|textarea|select/);
    expect(caps).toContain("text-transform: none");
  });
});
