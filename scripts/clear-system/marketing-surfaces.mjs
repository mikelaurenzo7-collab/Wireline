/**
 * Public marketing surface contracts for the consolidated homepage, natural
 * document flow, minimal public header, live proof, and honest plan economics.
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
  const landingLongformCss = read("src/styles/landing-longform.css");
  const documentFlowCss = read("src/styles/marketing-document-flow.css");
  const marketingSurfaceIndex = read("src/styles/wireline-marketing-surfaces.css");
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
    "the shared marketing frame must render one primary content flow",
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

  for (const [pattern, description] of [
    [/aria-label="Wireline home"/, "public header must provide a named home link"],
    [/aria-label="Account"/, "public header must expose only account actions"],
    [/to="\/signin"/, "public header must keep sign in visible"],
    [/to="\/signup\?plan=personal"/, "public header must keep free signup visible"],
    [/Start Free/, "public header must retain the direct conversion action"],
  ]) {
    mustInclude(
      "src/components/marketing/PrecisionPublicHeader.tsx",
      publicHeader,
      pattern,
      description,
    );
  }
  mustExclude(
    "src/components/marketing/PrecisionPublicHeader.tsx",
    executable(publicHeader),
    /Dialog|Menu|SITE_NAV|aria-label="Site"|label:\s*"Solutions"|label:\s*"Features"|label:\s*"Pricing"|label:\s*"Demos"|label:\s*"Trust"/,
    "public header must not revive brochure tabs or a mobile navigation dialog",
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
    [/<PrecisionPublicHeader\s*\/>/, "landing must use the minimal shared public header"],
    [/<MarketingChromeBar\s*\/>/, "landing must retain full footer wayfinding"],
    [/id="solutions"/, "landing must include solutions in the main story"],
    [/id="features"/, "landing must include product capabilities in the main story"],
    [/id="pricing"/, "landing must include pricing in the main story"],
    [/id="trust"/, "landing must include controls and trust in the main story"],
    [/aria-label="Agent work lane"/, "work lanes must stay reachable as named navigation"],
    [/variant="stage"/, "home must stage live proof in the proprietary Wireline console"],
    [/landing-console__activity/, "home must show an outcome ledger beside the live agent"],
    [/Illustrative Workflow/, "home must label static proof as illustrative"],
    [/From first answer to confirmed next step/, "home must explain the completed-work proof"],
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
    /From first answer to confirmed next step\./,
    "cased activity title must not carry a terminal period",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    executable(wireAgentLanding),
    /variant="phone"|landing-phone|landing-os__tray|chrome="hidden"|00:42|landing-console__duration|Live Video/,
    "landing code must not depend on borrowed device metaphors or pseudo-live telemetry",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /Start 7-day trial|Try 7 days free|\$159|postpaid voice-overage/i,
    "landing must not revive retired trial, plan, or overage positioning",
  );

  for (const [pattern, description] of [
    [/@import "\.\/marketing-document-flow\.css";/, "marketing tier must load document flow"],
    [/@import "\.\/landing-longform\.css";/, "marketing tier must load consolidated landing styles"],
  ]) {
    mustInclude(
      "src/styles/wireline-marketing-surfaces.css",
      marketingSurfaceIndex,
      pattern,
      description,
    );
  }

  for (const [pattern, description] of [
    [/data-wireline-viewport="document"/, "public document mode must be explicit"],
    [/height:\s*auto;/, "public documents must grow with content"],
    [/overflow-y:\s*auto;/, "the document must own vertical scrolling"],
    [/scroll-snap-type:\s*none;/, "public documents must not snap between panels"],
    [/font-synthesis:\s*none;/, "type must not synthesize missing font weights"],
    [/-webkit-font-smoothing:\s*auto;/, "font rendering must follow the platform"],
    [/--wireline-typography-display-weight:\s*700;/, "display type must use a shipped static weight"],
    [/--wireline-typography-h3-weight:\s*600;/, "supporting type must use a shipped static weight"],
  ]) {
    mustInclude(
      "src/styles/marketing-document-flow.css",
      documentFlowCss,
      pattern,
      description,
    );
  }

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
    "src/styles/landing-live-console.css",
    landingConsoleCss,
    /\.landing-console__body[\s\S]*grid-template-columns:/,
    "live proof must preserve separate agent and outcome panes",
  );
  mustInclude(
    "src/styles/landing-longform.css",
    landingLongformCss,
    /\.landing-home__pricing-grid/,
    "consolidated landing must include a responsive pricing grid",
  );
  mustInclude(
    "src/styles/landing-longform.css",
    landingLongformCss,
    /\.landing-home__control-grid/,
    "consolidated landing must include a control proof grid",
  );

  for (const [file, source] of [
    ["src/styles/landing-call-stage.css", landingStageCss],
    ["src/styles/landing-stage-layout.css", landingLayoutCss],
    ["src/styles/landing-live-console.css", landingConsoleCss],
    ["src/styles/landing-longform.css", landingLongformCss],
  ]) {
    mustExclude(
      file,
      executable(source),
      /#4ade80|#fbbf24|#7dd3fc|#2563eb|landing-phone|landing-os/,
      "landing styles must stay on the Wireline token system without retired device selectors",
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
