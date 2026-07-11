/**
 * Public marketing surfaces — centered rails, shared product voice, accessible
 * work-lane interactions, the wire signature, and honest Founder economics.
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
  mustInclude(
    "src/components/layout/MarketingPageFrame.tsx",
    marketingPageFrame,
    /scroll \? "grow" : "min-h-0 flex-1"/,
    "scroll marketing pages must grow with content before the footer",
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
      /text-center|wl-marketing-center/,
      "public marketing page must explicitly center hero or section copy",
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
    /MARKETING_VOICE\.headline/,
    "mobile navigation must consume the canonical brand spine",
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
    /aria-label=\{isBrandSpine \? "Wire\. Work\. Win\."/,
    "the visual arrow headline must expose a screen-reader-safe name",
  );
  mustInclude(
    "src/components/marketing/MarketingHero.tsx",
    marketingHero,
    /aria-label="Wireline proof points"/,
    "hero proof chips must have an accessible list name",
  );

  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /MARKETING_VOICE\.headline/,
    "landing hero must consume the shared headline",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /MARKETING_VOICE\.subline/,
    "landing hero must consume the shared subline",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /role="tablist"[\s\S]*aria-label="Agent call direction"/,
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
    /Conversation Balance/,
    "landing pricing must explain prepaid variable usage",
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
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /wl-eyebrow--wired/,
    "landing section eyebrows must carry the Wire",
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
    /Build → Train → Launch → Improve/,
    "features must preserve the canonical operating loop",
  );
  for (const tier of ["Free Builder", "Starter", "Starter Plus", "Pro", "Business"]) {
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
    /Conversation Balance/,
    "pricing must explain Conversation Balance",
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
    /Programmatic agents/,
    "developer surface must position agents, not assistants",
  );
  mustExclude(
    "src/pages/Developers.tsx",
    developersPage,
    /\bassistant(s)?\b/i,
    "developer surface must use agent language",
  );
}
