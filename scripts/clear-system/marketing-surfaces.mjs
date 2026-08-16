/**
 * Public marketing surfaces with centered rails, shared product voice, visible
 * navigation, accessible work-lane links, proprietary live proof, the Wire
 * signature, and honest plan economics.
 */
export function checkMarketingSurfaces({ read, mustInclude, mustExclude }) {
  const executable = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const claritySystemCss = read("src/styles/clarity-system.css");
  const marketingPageFrame = read("src/components/layout/MarketingPageFrame.tsx");
  const marketingHero = read("src/components/marketing/MarketingHero.tsx");
  const publicHeader = read("src/components/marketing/PrecisionPublicHeader.tsx");
  const wireAgentLanding = read("src/components/marketing/WireAgentLanding.tsx");
  const landingStageCss = read("src/styles/landing-call-stage.css");
  const landingLayoutCss = read("src/styles/landing-stage-layout.css");
  const landingConsoleCss = read("src/styles/landing-live-console.css");
  const signatureCss = read("src/styles/wireline-signature.css");
  const productCopy = read("src/lib/product-copy.ts");
  const developersPage = read("src/pages/Developers.tsx");
  const solutionsPage = read("src/pages/SolutionsPage.tsx");
  const featuresPage = read("src/pages/Features.tsx");
  const pricingPage = read("src/pages/Pricing.tsx");

  mustInclude(
    "src/styles/clarity-system.css",
    claritySystemCss,
    /\.marketing-surface :is\(\.wl-public-rail, \.wl-marketing-center\) \{\s*text-align:\s*center;/,
    "marketing pages must center public rails by design-system rule",
  );
  mustInclude(
    "src/styles/clarity-system.css",
    claritySystemCss,
    /\.marketing-surface \.wl-marketing-actions,[\s\S]*\.marketing-hero__actions[\s\S]*justify-content:\s*center;/,
    "marketing actions must center by default",
  );

  mustInclude(
    "src/components/layout/MarketingPageFrame.tsx",
    marketingPageFrame,
    /className=\{cn\(\s*"marketing-flow relative z-10"/,
    "the shared marketing frame must render exactly one bounded scroller",
  );
  mustInclude(
    "src/components/layout/MarketingPageFrame.tsx",
    marketingPageFrame,
    /longform \? "marketing-section--longform"|longform && "marketing-longform"/,
    "long-form document routes must be able to opt out of panel composition",
  );

  for (const file of [
    "src/pages/Features.tsx",
    "src/pages/Pricing.tsx",
    "src/pages/About.tsx",
    "src/pages/Compare.tsx",
    "src/pages/Blog.tsx",
    "src/pages/Showcase.tsx",
    "src/pages/SolutionsPage.tsx",
    "src/pages/VerticalLanding.tsx",
  ]) {
    mustInclude(
      file,
      read(file),
      /text-center|wl-marketing-center|!text-left/,
      "public marketing page must explicitly declare its copy alignment",
    );
  }

  mustInclude(
    "src/lib/product-copy.ts",
    productCopy,
    /MARKETING_VOICE/,
    "marketing voice must live in the shared product-copy module",
  );
  mustInclude(
    "src/components/marketing/PrecisionPublicHeader.tsx",
    publicHeader,
    /MARKETING_VOICE\.buyingNoun/,
    "mobile navigation must consume the canonical product noun",
  );
  mustInclude(
    "src/components/marketing/PrecisionPublicHeader.tsx",
    publicHeader,
    /aria-label="Site"/,
    "desktop public navigation must remain visible and named",
  );
  mustExclude(
    "src/components/marketing/PrecisionPublicHeader.tsx",
    executable(publicHeader),
    /Wire your agent|landing-os-nav|chrome\?:\s*"bar"\s*\|\s*"hidden"/,
    "public navigation executable code must not revive retired campaign or device-chrome behavior",
  );
  mustInclude(
    "src/components/marketing/MarketingHero.tsx",
    marketingHero,
    /aria-label=\{[\s\S]*?isHomeHero[\s\S]*?typeof title === "string"[\s\S]*?\? title[\s\S]*?: undefined[\s\S]*?\}/,
    "shared hero headlines must expose their visual copy as an accessible name",
  );
  mustExclude(
    "src/components/marketing/MarketingHero.tsx",
    marketingHero,
    /aria-label="Wireline capabilities"/,
    "minimal shared heroes must not reintroduce capability chips",
  );

  for (const [pattern, description] of [
    [/MARKETING_VOICE\.headline/, "landing must consume the shared headline"],
    [/MARKETING_VOICE\.subline/, "landing must consume the shared supporting line"],
    [/MARKETING_VOICE\.primaryCta/, "landing must consume the shared primary action"],
    [/MARKETING_VOICE\.spine/, "landing must consume the shared Build Train Launch spine"],
    [/<PrecisionPublicHeader\s*\/>/, "landing must use the visible shared public header"],
    [/aria-label="Agent work lane"/, "work lanes must stay reachable as named navigation"],
    [/landing-stage__lane-group/, "work lanes must remain a compact supporting entry point"],
    [/variant="stage"/, "home must stage live proof in the proprietary Wireline console"],
    [/landing-console__activity/, "home must show an outcome ledger beside the live agent"],
    [/Illustrative Workflow/, "home must label static proof as illustrative"],
    [/From first answer to confirmed next step\./, "home must explain the completed-work proof"],
    [/Booked and logged/, "home must expose a concrete outcome"],
    [/rules, approvals, spend, and handoffs/, "home must keep owner control explicit"],
    [/Build free/, "landing must keep the free builder visible"],
    [/View Pricing/, "landing must preserve a direct pricing path"],
    [/STRIPE_PLANS/, "landing pricing must stay tied to the Stripe plan catalog"],
    [/Runtime\s+Balance/, "landing pricing must explain prepaid Runtime Balance"],
  ]) {
    mustInclude(
      "src/components/marketing/WireAgentLanding.tsx",
      wireAgentLanding,
      pattern,
      description,
    );
  }

  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    executable(wireAgentLanding),
    /variant="phone"|landing-phone|landing-os__tray|chrome="hidden"|00:42|landing-console__duration|Live Video/,
    "landing executable code must not depend on borrowed device metaphors, pseudo-live telemetry, or optional add-ons",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /Start 7-day trial|Try 7 days free|\$79|postpaid voice-overage/i,
    "landing must not revive retired trial or overage positioning",
  );

  mustInclude(
    "src/styles/landing-call-stage.css",
    landingStageCss,
    /@import "\.\/landing-stage-layout\.css";/,
    "landing shell must import its narrative layout module",
  );
  mustInclude(
    "src/styles/landing-call-stage.css",
    landingStageCss,
    /@import "\.\/landing-live-console\.css";/,
    "landing shell must import its live-console module",
  );
  mustInclude(
    "src/styles/landing-stage-layout.css",
    landingLayoutCss,
    /grid-template-columns:\s*minmax\(0, 0\.93fr\)\s+minmax\(34rem, 1\.07fr\)/,
    "desktop landing must preserve a deliberate narrative and proof split",
  );
  mustInclude(
    "src/styles/landing-stage-layout.css",
    landingLayoutCss,
    /\.landing-stage__lane-group/,
    "work-lane entry points must remain visually subordinate to the primary CTA",
  );
  mustInclude(
    "src/styles/landing-live-console.css",
    landingConsoleCss,
    /\.landing-console__body[\s\S]*grid-template-columns:/,
    "live proof must preserve separate agent and outcome panes",
  );
  mustInclude(
    "src/styles/landing-live-console.css",
    landingConsoleCss,
    /\.landing-demo__microcopy[\s\S]*font-size:\s*0\.71rem/,
    "demo disclosures must remain readable rather than collapsing into micro chrome",
  );
  mustInclude(
    "src/styles/landing-call-stage.css",
    landingStageCss,
    /overflow-y:\s*auto/,
    "mobile landing must use a mechanically scrollable bounded flow",
  );
  for (const [file, source] of [
    ["src/styles/landing-call-stage.css", landingStageCss],
    ["src/styles/landing-stage-layout.css", landingLayoutCss],
    ["src/styles/landing-live-console.css", landingConsoleCss],
  ]) {
    mustExclude(
      file,
      executable(source),
      /#4ade80|#fbbf24|#7dd3fc|#2563eb|landing-phone|landing-os/,
      "landing styles must stay on the Letterpress token system without retired device selectors",
    );
  }

  mustInclude(
    "src/styles/wireline-signature.css",
    signatureCss,
    /--wireline-color-action-secondary-default/,
    "the Wire signature must run on the silver token",
  );
  mustInclude(
    "src/styles/wireline-signature.css",
    signatureCss,
    /prefers-reduced-motion: reduce/,
    "the Wire pulse must respect reduced motion",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /wl-eyebrow--wired/,
    "landing sections must not reintroduce decorative eyebrows",
  );
  mustInclude(
    "src/styles/wireline-signature.css",
    signatureCss,
    /\.wl-wire-step--settled/,
    "the final loop step must settle violet on the wire",
  );

  mustInclude(
    "src/pages/Features.tsx",
    featuresPage,
    /MARKETING_VOICE\.proof\.map/,
    "features must preserve the canonical operating loop",
  );
  for (const tier of ["Free Builder", "Starter", "Starter Plus", "Pro", "Scale"]) {
    mustInclude(
      "src/pages/Pricing.tsx",
      pricingPage,
      new RegExp(tier.replace(" ", "\\s+")),
      `pricing must expose the ${tier} tier`,
    );
  }
  mustExclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /\$159|Wireline\s+Business/,
    "pricing must not revive the retired self-serve Business offer",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /Runtime\s+Balance/,
    "pricing must explain Runtime Balance",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /STRIPE_PLANS/,
    "pricing must stay tied to the Stripe plan catalog",
  );

  mustExclude(
    "src/pages/SolutionsPage.tsx",
    solutionsPage,
    /HeroCallPreview|Sarah/,
    "solutions must not render the retired call preview",
  );
  mustInclude(
    "src/pages/Developers.tsx",
    developersPage,
    /create or refine a private agent configuration draft/i,
    "developer surface must position agents, not assistants",
  );
  mustExclude(
    "src/pages/Developers.tsx",
    developersPage,
    /\bassistant(s)?\b/i,
    "developer surface must use agent language",
  );
}
