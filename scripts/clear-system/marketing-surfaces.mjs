/**
 * Public marketing surfaces — centered rails, the shared marketing voice, the
 * wire signature, and honest positioning across every public page.
 */
export function checkMarketingSurfaces({ read, mustInclude, mustExclude }) {
  const claritySystemCss = read("src/styles/clarity-system.css");
  const marketingPageFrame = read("src/components/layout/MarketingPageFrame.tsx");
  const wireAgentLanding = read("src/components/marketing/WireAgentLanding.tsx");
  const signatureCss = read("src/styles/wireline-signature.css");
  const productCopy = read("src/lib/product-copy.ts");
  const ogImage = read("public/og-image.svg");
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
  mustExclude(
    "src/styles/clarity-system.css",
    claritySystemCss,
    /left-aligned reading rail/,
    "clarity system must not describe the retired left-aligned marketing rail",
  );
  mustInclude(
    "src/components/layout/MarketingPageFrame.tsx",
    marketingPageFrame,
    /scroll \? "grow" : "min-h-0 flex-1"/,
    "scroll marketing pages must grow with content before the footer renders",
  );
  mustExclude(
    "src/components/layout/MarketingPageFrame.tsx",
    marketingPageFrame,
    /"relative z-10 min-h-0 flex-1"/,
    "scroll marketing pages must not constrain content under the footer",
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
    "marketing hero copy must live in product-copy module",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /MARKETING_VOICE\.headline/,
    "landing hero must consume the shared marketing headline",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /MARKETING_VOICE\.subline/,
    "landing hero must keep the short punchy subhero",
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
    "landing pricing must explain Conversation Balance",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /Start 7-day trial|Start your 7-day trial|Try 7 days free|7-day free trial|7-day trial|No gimmick free plan|name:\s*"Starter"|name:\s*"Pro"|Everything in Starter|Everything in Pro|\$79/,
    "landing pricing must not revive retired trial or Starter/Pro catalog copy",
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
    "the loop steps must run silver-to-violet on the wire",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /wl-wire-step__node/,
    "landing loop steps must be nodes on the wire",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /wl-wire-step--settled/,
    "the final loop step must settle violet on the wire",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /wl-featured-wire/,
    "dark ink panels (recommended plan, closing CTA) must carry the wire",
  );
  mustInclude(
    "src/styles/wireline-signature.css",
    signatureCss,
    /\.wl-featured-wire--live::after[\s\S]*?animation: wl-wire-pulse/,
    "the closing CTA wire must carry the live traveling signal",
  );
  mustInclude(
    "src/styles/wireline-signature.css",
    signatureCss,
    /\.wl-mark-signal\s*\{\s*fill: var\(--wireline-color-action-secondary-default\)/,
    "the mark's central node must carry the silver signal on public surfaces",
  );
  mustExclude(
    "public/og-image.svg",
    ogImage,
    /ANSWERING NOW|picks up right now/i,
    "OG image must not use answer-only live-work copy",
  );

  mustInclude(
    "src/pages/Features.tsx",
    featuresPage,
    /Build → Train → Launch → Improve/,
    "features page must preserve the current launch loop",
  );
  mustInclude("src/pages/Pricing.tsx", pricingPage, /Personal/, "pricing must position Personal");
  mustInclude("src/pages/Pricing.tsx", pricingPage, /Team/, "pricing must position Team");
  mustInclude("src/pages/Pricing.tsx", pricingPage, /Business/, "pricing must position Business");
  mustInclude("src/pages/Pricing.tsx", pricingPage, /Enterprise/, "pricing must position Enterprise");
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
    "use-cases page must not render the retired Sarah call preview",
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
  mustExclude(
    "src/components/AssistantComposer.tsx",
    read("src/components/AssistantComposer.tsx"),
    /Ask your assistant/i,
    "shared composer must use agent copy",
  );
  mustExclude(
    "src/components/marketing/TrustSignals.tsx",
    read("src/components/marketing/TrustSignals.tsx"),
    /demo assistants/i,
    "trust strip must use agent language",
  );
}
