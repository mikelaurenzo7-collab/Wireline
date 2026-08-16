/**
 * Public marketing surfaces with centered rails, shared product voice, a
 * zero-runtime landing product theater, the wire signature, and honest Founder
 * economics on the dedicated pricing surface.
 */
export function checkMarketingSurfaces({ read, mustInclude, mustExclude }) {
  const claritySystemCss = read("src/styles/clarity-system.css");
  const marketingPageFrame = read("src/components/layout/MarketingPageFrame.tsx");
  const marketingHero = read("src/components/marketing/MarketingHero.tsx");
  const publicHeader = read("src/components/marketing/PrecisionPublicHeader.tsx");
  const wireAgentLanding = read("src/components/marketing/WireAgentLanding.tsx");
  const landingTheaterCss = read("src/styles/landing-product-theater.css");
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
  // The frame no longer grows with content: the window is the frame. Every
  // public route is 100dvh with a single bounded scroller between a fixed
  // header and a pinned chrome bar, so no public page has a document scrollbar
  // at any width. What this contract now holds is that invariant.
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
    // `!text-left` is the deliberate opt-out, not an oversight. /about is
    // built to be identifiable at a glance as not the landing page, and a
    // left-aligned column is the cheapest signal available.
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
    /aria-label="Animated preview of a Wireline voice agent/,
    "the visual product scene must expose an accessible description",
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
    /import BrowserCallWidget|<BrowserCallWidget|LANDING_PUBLIC_DEMO_AGENTS|href=\{`tel:/,
    "anonymous landing traffic must not execute or expose a live provider demo",
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
    "src/styles/landing-product-theater.css",
    landingTheaterCss,
    /\.wireline-device__waveform/,
    "the product scene must carry a voice-specific signature",
  );
  mustInclude(
    "src/styles/landing-product-theater.css",
    landingTheaterCss,
    /prefers-reduced-motion:\s*reduce/,
    "landing motion must yield to reduced-motion preferences",
  );
  mustInclude(
    "src/styles/landing-product-theater.css",
    landingTheaterCss,
    /animation:\s*none !important/,
    "landing animation must have a deterministic still state",
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

  // Features owns the operating-loop explanation; the homepage only stages a
  // representative outcome. This keeps the first screen singular while the
  // deeper product page preserves the complete Build/Train/Launch/Improve loop.
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
