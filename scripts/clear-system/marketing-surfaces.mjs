/**
 * Public marketing surfaces with centered rails, shared product voice, a
 * protected live product theater, the wire signature, and honest Founder
 * economics on the dedicated pricing surface.
 */
export function checkMarketingSurfaces({ read, mustInclude, mustExclude }) {
  const claritySystemCss = read("src/styles/clarity-system.css");
  const marketingPageFrame = read("src/components/layout/MarketingPageFrame.tsx");
  const marketingHero = read("src/components/marketing/MarketingHero.tsx");
  const publicHeader = read("src/components/marketing/PrecisionPublicHeader.tsx");
  const chromeBar = read("src/components/marketing/MarketingChromeBar.tsx");
  const wireAgentLanding = read("src/components/marketing/WireAgentLanding.tsx");
  const landingTheaterCss = read("src/styles/landing-product-theater.css");
  const landingDemoCss = read("src/styles/landing-product-theater-demo.css");
  const viewportFinalCss = read("src/styles/viewport-final-polish.css");
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
    /h-14[\s\S]*lg:h-16/,
    "public header height must match the mobile and desktop viewport equations",
  );
  mustExclude(
    "src/components/marketing/PrecisionPublicHeader.tsx",
    publicHeader,
    /Wire your agent/,
    "public navigation must not revive retired campaign copy",
  );
  mustInclude(
    "src/components/marketing/MarketingHero.tsx",
    marketingHero,
    /aria-label=\{[\s\S]*?isHomeHero[\s\S]*?typeof title === "string"[\s\S]*?\? title[\s\S]*?: undefined[\s\S]*?\}/,
    "shared home-hero semantics must expose visual copy as a screen-reader-safe name",
  );
  mustExclude(
    "src/components/marketing/MarketingHero.tsx",
    marketingHero,
    /aria-label="Wireline capabilities"/,
    "minimal heroes must not reintroduce capability chips",
  );

  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /MARKETING_VOICE\.headline/,
    "landing must consume the shared headline",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /MARKETING_VOICE\.subline/,
    "landing must consume the shared explanatory copy",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /aria-label="Animated preview and protected live demo of a Wireline voice agent/,
    "the product scene must expose an accessible description",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /OUTCOME_SIGNALS\.map/,
    "the landing scene must show concrete operating outcomes",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /<WirelineMark/,
    "the landing scene must be visibly owned by Wireline",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /useProtectedPublicDemo/,
    "the landing must use the protected live-demo path",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /const PRIMARY_CTA_PATH = "\/signup\?plan=personal"/,
    "the landing must preserve free-builder conversion intent",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /role="tablist"|handleModeKeyDown|MODE_OPTIONS/,
    "the homepage must not restore a multi-lane configurator before signup",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /LANDING_PUBLIC_DEMO_AGENTS|href=\{`tel:|<BrowserCallWidget/,
    "the homepage must not expose a demo number or direct runtime widget",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /STRIPE_PLANS|Runtime\s+Balance/,
    "the homepage must route plan comparison and usage economics to pricing",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /Start 7-day trial|Try 7 days free|\$79|postpaid voice-overage/i,
    "landing must not revive retired trial or overage positioning",
  );

  mustInclude(
    "src/styles/landing-product-theater.css",
    landingTheaterCss,
    /\.marketing-surface \.wireline-theater\.marketing-section--screen/,
    "the homepage scene must compose inside the shared viewport frame",
  );
  mustInclude(
    "src/styles/landing-product-theater.css",
    landingTheaterCss,
    /100dvh/,
    "the homepage scene must size against the dynamic viewport",
  );
  mustInclude(
    "src/styles/landing-product-theater-demo.css",
    landingDemoCss,
    /\.wireline-device__demo-button/,
    "live proof must remain integrated into the phone object",
  );
  mustInclude(
    "src/styles/landing-product-theater-demo.css",
    landingDemoCss,
    /prefers-reduced-motion:\s*reduce/,
    "live-demo presentation must yield to reduced-motion preferences",
  );
  mustInclude(
    "src/styles/viewport-final-polish.css",
    viewportFinalCss,
    /safe-area-inset-bottom/,
    "pinned public chrome must reserve mobile safe areas",
  );
  mustInclude(
    "src/styles/viewport-final-polish.css",
    viewportFinalCss,
    /orientation:\s*landscape/,
    "mobile landscape must receive its own composition",
  );
  mustInclude(
    "src/components/marketing/MarketingChromeBar.tsx",
    chromeBar,
    /marketing-chrome-bar__mobile-optional/,
    "the pinned footer must keep a one-row mobile priority set",
  );

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
