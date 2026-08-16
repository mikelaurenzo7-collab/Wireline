/**
 * Public marketing surfaces with centered rails, shared product voice, accessible
 * work lane interactions, the wire signature, and honest Founder economics.
 */
export function checkMarketingSurfaces({ read, mustInclude, mustExclude }) {
  const claritySystemCss = read("src/styles/clarity-system.css");
  const marketingPageFrame = read("src/components/layout/MarketingPageFrame.tsx");
  const marketingHero = read("src/components/marketing/MarketingHero.tsx");
  const publicHeader = read("src/components/marketing/PrecisionPublicHeader.tsx");
  const wireAgentLanding = read("src/components/marketing/WireAgentLanding.tsx");
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
  // The frame no longer grows with content: the window *is* the frame. Every
  // public route is 100dvh with a single bounded scroller between a fixed
  // header and a pinned chrome bar, so no public page has a document
  // scrollbar at any width. What this contract now holds is that invariant —
  // the shared frame must render the one scroller, and long-form document
  // routes must still have a way to opt out of the panel composition.
  // See src/styles/viewport-first-marketing.css for the three mechanisms.
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
    // built to be identifiable at a glance as *not* the landing page, and a
    // left-aligned column is the cheapest signal available; the blanket
    // centering rule in clarity-system.css would otherwise re-centre it.
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
    "the home hero headline must expose its visual copy as a screen-reader-safe name",
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
    "landing hero must consume the shared headline",
  );
  // Subline intentionally omitted from the hero (minimal hero); it still backs
  // the SEO/social description in index.html.
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /role="tablist"[\s\S]*aria-label="Agent work lane"/,
    "work lanes must use an accessible tablist",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /onKeyDown=\{handleModeKeyDown\}/,
    "work lanes must support keyboard navigation",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /STRIPE_PLANS/,
    "landing pricing must stay tied to the Stripe plan catalog",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /Runtime\s+Balance/,
    "landing pricing must explain prepaid Runtime Balance",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /Start 7-day trial|Try 7 days free|\$79|postpaid voice-overage/i,
    "landing must not revive retired trial or overage positioning",
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

  // The loop is still on this buying surface, but it is no longer typed as a
  // display line. /features is one screen now, and four cards with a paragraph
  // each cost ~300px to repeat what the landing page already explains in full;
  // the four words in sequence carry the spine for ~50px. Sourcing them from
  // MARKETING_VOICE.proof (BRAND_SYSTEM.proofLoop) also gives the steps and
  // their order exactly one origin, which a hand-typed headline never had --
  // this page used to headline "Build. Train. Launch. Improve." above cards
  // titled "Define the Agent" / "Teach the Business".
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
