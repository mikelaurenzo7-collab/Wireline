/** Public marketing hierarchy contract. */
export function checkMarketingSurfaces({ read, mustInclude, mustExclude, failures }) {
  const executable = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const claritySystemCss = read("src/styles/clarity-system.css");
  const marketingPageFrame = read("src/components/layout/MarketingPageFrame.tsx");
  const marketingHero = read("src/components/marketing/MarketingHero.tsx");
  const publicHeader = read("src/components/marketing/PrecisionPublicHeader.tsx");
  const landing = read("src/components/marketing/WireAgentLanding.tsx");
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
    "supporting pages must retain shared alignment",
  );
  mustInclude(
    "src/components/layout/MarketingPageFrame.tsx",
    marketingPageFrame,
    /className=\{cn\(\s*"marketing-flow relative z-10"/,
    "shared frame must render one primary flow",
  );
  mustInclude(
    "src/components/layout/MarketingPageFrame.tsx",
    marketingPageFrame,
    /longform \? "marketing-section--longform"|longform && "marketing-longform"/,
    "long-form routes must opt out of panel composition",
  );
  for (const [pattern, description] of [
    [/aria-label="BotBound home"/, "public header must name the BotBound home link"],
    [/aria-label="Account"/, "public header must expose account actions"],
    [/to="\/signin"/, "public header must keep sign in visible"],
    [
      /signupHrefForPlan\("personal"\)/,
      "public header must keep free signup visible through the canonical slug builder",
    ],
  ])
    mustInclude(
      "src/components/marketing/PrecisionPublicHeader.tsx",
      publicHeader,
      pattern,
      description,
    );
  mustExclude(
    "src/components/marketing/PrecisionPublicHeader.tsx",
    executable(publicHeader),
    /Dialog|SITE_NAV|aria-label="Site"|label:\s*"Solutions"|label:\s*"Demos"|label:\s*"Trust"/,
    "supporting public headers keep navigation limited to product, pricing, and account entry",
  );
  for (const destination of executable(publicHeader).matchAll(/\bto(?:=|:\s*)["']([^"']+)["']/g)) {
    if (!["/", "/features", "/pricing", "/signin"].includes(destination[1])) {
      failures.push(
        `src/components/marketing/PrecisionPublicHeader.tsx: unexpected header destination ${destination[1]}`,
      );
    }
  }
  mustInclude(
    "src/components/marketing/MarketingHero.tsx",
    marketingHero,
    /aria-label=\{[\s\S]*?isHomeHero[\s\S]*?typeof title === "string"/,
    "supporting heroes must expose an accessible name",
  );

  for (const [pattern, description] of [
    [
      /<AuthAccessPanel embedded initialMode="signup" showBrand=\{false\}\s*\/>/,
      "root landing must embed concise account creation",
    ],
    [
      /<span>Your Next Hire<\/span>[\s\S]*<span>Is a Bot<\/span>/,
      "root landing must use BotBound hero",
    ],
    [
      /BOT_MARKETING_VOICE\.activationLine/,
      "root landing must source the concise activation promise",
    ],
    [/landing-prestige__directions/, "hero must expose inbound and outbound starting paths"],
    [/Find\. Call\. Book\./, "hero must retain the outbound activation path"],
    [/Answer\. Qualify\. Route\./, "hero must retain the inbound activation path"],
    [/FEATURED_TEMPLATE_KEYS/, "landing must curate role starters"],
    [/template\.moves\.map/, "role starters must show playbook moves"],
    [/id="pricing"/, "landing must preserve direct pricing"],
    [/STRIPE_PLANS/, "landing pricing must use Stripe plan catalog"],
    [/landing-prestige__trust/, "landing must retain trust exit"],
    [/<LandingFooter\s*\/>/, "desktop landing must retain wayfinding"],
  ])
    mustInclude("src/components/marketing/WireAgentLanding.tsx", landing, pattern, description);
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    executable(landing),
    /<PrecisionPublicHeader|<BrowserCallWidget|useProtectedPublicDemo|\/api\/public\/demo-(?:session|call)|variant="stage"|landing-console__activity|Illustrative Workflow|Booked and logged|id="features"|id="trust"|Bot template lane|template\.category|HERO_CHANNEL_ORDER|BOT_CHANNELS|<BotMark|markKey/,
    "root landing must not revive old brochure structures",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    landing,
    /ONE WORKSPACE|Business and personal templates|Runtime\s+Balance|Start 7-day trial|Try 7 days free|\$159|postpaid voice-overage/i,
    "landing must not lead with architecture or billing mechanics",
  );

  for (const [pattern, description] of [
    [
      /grid-template-columns:\s*minmax\(0, 1fr\)\s+minmax\(0, 1fr\)/,
      "desktop entrance must stay split",
    ],
    [
      /font-size:\s*clamp\(3\.25rem, 5vw, 6\.2rem\)/,
      "desktop hero must retain the verified horizontal editorial scale",
    ],
    [
      /\.landing-prestige__hero-copy h1 span\s*\{[\s\S]*?white-space:\s*nowrap;/,
      "desktop hero must preserve its intentional two-line composition",
    ],
    [
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__entrance\s*\{[\s\S]*?display:\s*flex;[\s\S]*?min-height:\s*auto;/,
      "mobile entrance must remain in document flow",
    ],
    [
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__hero\s*\{[\s\S]*?display:\s*grid;/,
      "mobile landing must retain the BotBound product story",
    ],
    [
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__desktop-only\s*\{[\s\S]*?display:\s*block;/,
      "mobile landing must retain long-form BotBound proof",
    ],
    [
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__auth\s*\{[\s\S]*?min-height:\s*auto;/,
      "mobile account access must remain in the public document flow",
    ],
    [/\.landing-prestige__role-grid/, "desktop landing must provide role grid"],
  ])
    mustInclude("src/styles/landing-prestige.css", landingPrestigeCss, pattern, description);
  mustExclude(
    "src/styles/landing-prestige.css",
    landingPrestigeCss,
    /\.landing-prestige__hero,[\s\S]*?\.landing-prestige__desktop-only\s*\{[\s\S]*?display:\s*none;/,
    "mobile landing must not hide the BotBound product story",
  );
  mustInclude(
    "src/styles/auth-access-panel.css",
    authAccessCss,
    /\.wl-access-panel__oauth\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*[\d.]+rem\),\s*1fr\)\)/,
    "account access must let compact OAuth providers reflow on narrow screens",
  );
  mustInclude(
    "src/index.css",
    indexCss,
    /@import "\.\/styles\/auth-access-panel\.css";/,
    "CSS stack must own access-panel styling",
  );
  mustInclude(
    "src/index.css",
    indexCss,
    /@import "\.\/styles\/landing-prestige\.css";/,
    "CSS stack must own split landing styling",
  );
  mustInclude(
    "src/components/marketing/LandingFooter.tsx",
    landingFooter,
    /<MarketingChromeBar\s*\/>/,
    "landing footer must render shared link bar",
  );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /BOT_ROLE_TEMPLATES/,
    "role template catalog must remain centralized",
  );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /moves:\s*\[/,
    "role templates must carry playbook steps",
  );
  for (const [pattern, description] of [
    [/data-wireline-viewport="document"/, "public document mode must remain explicit"],
    [/height:\s*auto;/, "public docs must grow with content"],
    [/overflow-y:\s*auto;/, "document must own scroll"],
    [/scroll-snap-type:\s*none;/, "public docs must not snap"],
    [/font-synthesis:\s*none;/, "type must not synthesize weights"],
  ])
    mustInclude("src/styles/marketing-document-flow.css", documentFlowCss, pattern, description);
  mustInclude(
    "src/styles/wireline-signature.css",
    signatureCss,
    /--wireline-color-action-secondary-default/,
    "signature treatment must use silver token",
  );
  mustInclude(
    "src/styles/wireline-signature.css",
    signatureCss,
    /prefers-reduced-motion: reduce/,
    "signature motion must respect reduced motion",
  );
  for (const tier of ["Free Builder", "Light", "Regular", "High"])
    mustInclude(
      "src/pages/Pricing.tsx",
      pricingPage,
      new RegExp(tier.replace(" ", "\\s+")),
      `pricing must expose ${tier}`,
    );
  const channelPicker = read("src/components/ChannelPlanPicker.tsx");
  for (const label of ["Calls", "Email", "SMS", "Light", "Regular", "High"])
    mustInclude(
      "src/components/ChannelPlanPicker.tsx",
      channelPicker,
      new RegExp(`label: "${label}"`),
      `shared pricing selector must preserve ${label}`,
    );
  mustInclude(
    "src/components/ChannelPlanPicker.tsx",
    channelPicker,
    /interval === "year" \? plan\.price_usd_annual : plan\.price_usd_monthly/,
    "pricing must use the exact catalog price for each interval",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /usePaidPlanAvailability\(\{[\s\S]*interval: billingInterval,[\s\S]*planId: selectedPlanId/,
    "pricing must check live availability for the selected package and interval",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /checkoutAvailability === "sms_readiness_required"[\s\S]*canActivate\(plan\.id\) && !smsPending/,
    "pricing must keep unavailable SMS selections out of activation",
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
    "pricing must use Stripe catalog",
  );
  mustExclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /BotBound\s+(?:Starter(?:\s+Plus)?|Pro|Scale|Business)\b|WIRELINE\s+Business/i,
    "pricing must not revive retired offer",
  );
  mustExclude(
    "src/pages/SolutionsPage.tsx",
    solutionsPage,
    /HeroCallPreview|Sarah|tel:/,
    "solutions must not render retired call preview or public phone CTAs",
  );
  mustInclude(
    "src/pages/Developers.tsx",
    developersPage,
    /create_agent_draft \/ update_agent_draft/,
    "developer API identifiers must remain stable",
  );
  mustInclude(
    "src/pages/Developers.tsx",
    developersPage,
    /Create or refine a private Bot configuration draft/,
    "developer surface must call customer objects Bots",
  );
}
