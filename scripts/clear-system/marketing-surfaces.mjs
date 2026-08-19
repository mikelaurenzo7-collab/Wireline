/**
 * Public marketing contracts. The root landing is intentionally unlike the
 * document-style supporting pages: desktop is a split product entrance, while
 * mobile is account access first. Long-form product explanation lives elsewhere.
 */
export function checkMarketingSurfaces({ read, mustInclude, mustExclude }) {
  const executable = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const claritySystemCss = read("src/styles/clarity-system.css");
  const marketingPageFrame = read("src/components/layout/MarketingPageFrame.tsx");
  const marketingHero = read("src/components/marketing/MarketingHero.tsx");
  const publicHeader = read("src/components/marketing/PrecisionPublicHeader.tsx");
  const wireAgentLanding = read("src/components/marketing/WireAgentLanding.tsx");
  const landingFooter = read("src/components/marketing/LandingFooter.tsx");
  const landingPrestigeCss = read("src/styles/landing-prestige.css");
  const authAccessCss = read("src/styles/auth-access-panel.css");
  const indexCss = read("src/index.css");
  const documentFlowCss = read("src/styles/marketing-document-flow.css");
  const signatureCss = read("src/styles/wireline-signature.css");
  const botProduct = read("src/lib/bot-product.ts");
  const developersPage = read("src/pages/Developers.tsx");
  const solutionsPage = read("src/pages/SolutionsPage.tsx");
  const pricingPage = read("src/pages/Pricing.tsx");

  mustInclude(
    "src/styles/clarity-system.css",
    claritySystemCss,
    /\.marketing-surface :is\(\.wl-public-rail, \.wl-marketing-center\) \{\s*text-align:\s*center;/,
    "supporting marketing pages must retain the shared public alignment rule",
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

  for (const [pattern, description] of [
    [/aria-label="WIRELINE home"/, "supporting public header must provide a named WIRELINE home link"],
    [/aria-label="Account"/, "supporting public header must expose only account actions"],
    [/to="\/signin"/, "supporting public header must keep sign in visible"],
    [/to="\/signup\?plan=personal"/, "supporting public header must keep free signup visible"],
  ]) {
    mustInclude("src/components/marketing/PrecisionPublicHeader.tsx", publicHeader, pattern, description);
  }
  mustExclude(
    "src/components/marketing/PrecisionPublicHeader.tsx",
    executable(publicHeader),
    /Dialog|Menu|SITE_NAV|aria-label="Site"|label:\s*"Solutions"|label:\s*"Features"|label:\s*"Pricing"|label:\s*"Demos"|label:\s*"Trust"/,
    "supporting public header must not revive brochure tabs or a mobile navigation dialog",
  );

  mustInclude(
    "src/components/marketing/MarketingHero.tsx",
    marketingHero,
    /aria-label=\{[\s\S]*?isHomeHero[\s\S]*?typeof title === "string"[\s\S]*?\? title[\s\S]*?: undefined[\s\S]*?\}/,
    "shared supporting-page heroes must expose their visual copy as an accessible name",
  );

  for (const [pattern, description] of [
    [/<AuthAccessPanel embedded initialMode="signin"\s*\/>/, "root landing must embed real account access"],
    [/<span>WIRE YOUR<\/span>[\s\S]*<span>PHONE BOT<\/span>/, "root landing must use the approved two-line hero"],
    [/landing-prestige__channels[\s\S]*CALL[\s\S]*EMAIL[\s\S]*TEXT/, "root landing must show Call, Email, and Text directly beneath the hero"],
    [/size=\{30\}[\s\S]*active/, "Jordan identity must use a compact animated Bot signal"],
    [/FEATURED_TEMPLATE_KEYS/, "root landing must curate role starters rather than dumping every template"],
    [/template\.moves\.map/, "role starters must show role-specific playbook moves"],
    [/id="pricing"/, "root landing must preserve a direct pricing path"],
    [/STRIPE_PLANS/, "root landing pricing must stay tied to the Stripe plan catalog"],
    [/landing-prestige__trust/, "root landing must retain a concise trust exit"],
    [/<LandingFooter\s*\/>/, "desktop landing must retain public wayfinding after the short narrative"],
  ]) {
    mustInclude("src/components/marketing/WireAgentLanding.tsx", wireAgentLanding, pattern, description);
  }

  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    executable(wireAgentLanding),
    /<PrecisionPublicHeader|variant="stage"|landing-console__activity|Illustrative Workflow|Booked and logged|id="features"|id="trust"|Bot template lane|template\.category/,
    "root landing must not revive the old brochure header, proof console, redundant capability sections, or audience taxonomy",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /ONE WORKSPACE|Business and personal templates|Runtime\s+Balance|Start 7-day trial|Try 7 days free|\$159|postpaid voice-overage/i,
    "root landing must not lead with architecture, retired audience language, or detailed billing mechanics",
  );

  for (const [pattern, description] of [
    [/grid-template-columns:\s*minmax\(0, 1fr\)\s+minmax\(0, 1fr\)/, "desktop entrance must stay a true split panel"],
    [/font-size:\s*clamp\(4\.25rem, 7\.15vw, 8\.4rem\)/, "desktop hero must retain editorial display scale"],
    [/@media \(max-width: 820px\)[\s\S]*\.landing-prestige__hero,[\s\S]*\.landing-prestige__desktop-only[\s\S]*display:\s*none;/, "mobile landing must hide long-form marketing"],
    [/@media \(max-width: 820px\)[\s\S]*\.landing-prestige__auth[\s\S]*min-height:\s*100dvh;/, "mobile landing must dedicate the viewport to account access"],
    [/\.landing-prestige__role-grid/, "desktop landing must provide a dedicated role-playbook grid"],
  ]) {
    mustInclude("src/styles/landing-prestige.css", landingPrestigeCss, pattern, description);
  }

  mustInclude(
    "src/styles/auth-access-panel.css",
    authAccessCss,
    /\.wl-access-panel__oauth[\s\S]*grid-template-columns:\s*repeat\(3/,
    "account access must keep OAuth providers compact and immediately scannable",
  );
  mustInclude(
    "src/index.css",
    indexCss,
    /@import "\.\/styles\/auth-access-panel\.css";/,
    "canonical CSS stack must own access-panel styling",
  );
  mustInclude(
    "src/index.css",
    indexCss,
    /@import "\.\/styles\/landing-prestige\.css";/,
    "canonical CSS stack must own split-landing styling",
  );

  mustInclude(
    "src/components/marketing/LandingFooter.tsx",
    landingFooter,
    /<MarketingChromeBar\s*\/>/,
    "landing footer must render the shared public link bar",
  );

  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /BOT_ROLE_TEMPLATES/,
    "the unified Bot role-template catalog must remain centralized",
  );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /moves:\s*\[/,
    "role templates must carry specific playbook steps",
  );

  for (const [pattern, description] of [
    [/data-wireline-viewport="document"/, "public document mode must be explicit"],
    [/height:\s*auto;/, "public documents must grow with content"],
    [/overflow-y:\s*auto;/, "the document must own vertical scrolling"],
    [/scroll-snap-type:\s*none;/, "public documents must not snap between panels"],
    [/font-synthesis:\s*none;/, "type must not synthesize missing font weights"],
  ]) {
    mustInclude("src/styles/marketing-document-flow.css", documentFlowCss, pattern, description);
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

  for (const tier of ["Free Builder", "Starter", "Starter Plus", "Pro", "Scale"]) {
    mustInclude(
      "src/pages/Pricing.tsx",
      pricingPage,
      new RegExp(tier.replace(" ", "\\s+")),
      `pricing must expose the ${tier} tier`,
    );
  }
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /Runtime\s+Balance/,
    "the dedicated pricing page must explain Runtime Balance",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /STRIPE_PLANS/,
    "pricing must stay tied to the Stripe plan catalog",
  );
  mustExclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /\$159|WIRELINE\s+Business/i,
    "pricing must not revive the retired self-serve Business offer",
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
    /create_agent_draft \/ update_agent_draft/,
    "developer surface must preserve technical agent identifiers for API compatibility",
  );
  mustInclude(
    "src/pages/Developers.tsx",
    developersPage,
    /Create or refine a private Bot configuration draft/,
    "developer surface must describe technical agent objects as Bots to customers",
  );
}
