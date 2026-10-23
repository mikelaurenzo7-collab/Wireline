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
    // "/studio" is the signed-in visitor's single way back to work.
    if (!["/", "/features", "/pricing", "/signin", "/studio"].includes(destination[1])) {
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
      /to=\{signupHrefForPlan\("personal"\)\}[\s\S]*?Get Started/,
      "root landing must lead with the paid Personal plan",
    ],
    [/to="\/signin"/, "root landing must keep sign-in one action away"],
    [
      /<span>Voice Bots<\/span>\s*<span>With a Computer,<\/span>[\s\S]*<span>Phone Number,<\/span>\s*<span>and Email Address\.<\/span>/,
      "root landing must make the computer, phone number, and email offer explicit",
    ],
    [/<PrecisionPublicHeader \/>/, "root landing must share the public header"],
    [/landing-prestige__directions/, "hero must expose personal and business starting paths"],
    [/Plan\. Coordinate\./, "hero must retain the personal assistant path"],
    [/Answer\. Book\./, "hero must retain the front desk path"],
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
    landing,
    /BOT_MARKETING_VOICE\.activationLine|landing-prestige__promise/,
    "root landing must keep the hero free of a redundant subhero paragraph",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    executable(landing),
    /<AuthAccessPanel|<BrowserCallWidget|useProtectedPublicDemo|\/api\/public\/demo-(?:session|call)|variant="stage"|landing-console__activity|Illustrative Workflow|Booked and logged|id="features"|id="trust"|Bot template lane|template\.category|HERO_CHANNEL_ORDER|BOT_CHANNELS|<BotMark|markKey/,
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
      /\.landing-prestige__hero\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*text-align:\s*center;/,
      "home hero must be one centered column",
    ],
    [
      /\.landing-prestige h2 > span,\s*\.landing-prestige__title-line > span\s*\{[^}]*display:\s*inline-block;[^}]*white-space:\s*nowrap;/,
      "headings must wrap between phrases, never strand one word",
    ],
    [
      /\.landing-prestige__section-heading\s*\{[^}]*margin-inline:\s*auto;[^}]*text-align:\s*center;/,
      "section headings must align with centered content",
    ],
    [
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__hero\s*\{[\s\S]*?min-height:\s*auto;/,
      "mobile hero must remain in document flow",
    ],
    [/\.landing-prestige__role-grid/, "landing must provide role grid"],
  ])
    mustInclude("src/styles/landing-prestige.css", landingPrestigeCss, pattern, description);
  mustExclude(
    "src/styles/landing-prestige.css",
    landingPrestigeCss,
    /\.landing-prestige__(?:auth|entrance|desktop-only)\b/,
    "the retired split entrance must not return",
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
    "CSS stack must own landing styling",
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
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /<h2[^>]*>Personal · \$12\/month<\/h2>[\s\S]*?to=\{signupHrefForPlan\("personal"\)\}/,
    "pricing must expose the paid Personal plan through its canonical signup destination",
  );
  const channelPicker = read("src/components/ChannelPlanPicker.tsx");
  const planDisplay = read("src/lib/plan-display.ts");
  for (const label of ["Calls", "Email", "SMS"])
    mustInclude(
      "src/components/ChannelPlanPicker.tsx",
      channelPicker,
      new RegExp(`label: "${label}"`),
      `shared pricing selector must preserve ${label}`,
    );
  mustInclude(
    "src/components/ChannelPlanPicker.tsx",
    channelPicker,
    /import\s*\{[^}]*\bPLAN_CAPACITY_LABELS\b[^}]*\}\s*from\s*"\.\.\/lib\/plan-display"/,
    "shared pricing selector must import canonical capacity labels",
  );
  for (const [capacity, label] of [
    ["light", "Starter"],
    ["regular", "Plus"],
    ["high", "Pro"],
  ]) {
    mustInclude(
      "src/lib/plan-display.ts",
      planDisplay,
      new RegExp(`PLAN_CAPACITY_LABELS[^=]*=\\s*\\{[^}]*\\b${capacity}:\\s*"${label}"`),
      `canonical capacity labels must preserve ${label}`,
    );
    mustInclude(
      "src/components/ChannelPlanPicker.tsx",
      channelPicker,
      new RegExp(`id:\\s*"${capacity}",\\s*label:\\s*PLAN_CAPACITY_LABELS\\.${capacity}\\b`),
      `shared pricing selector must use the canonical ${label} label`,
    );
  }
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
    /!plan\.channels\.includes\("sms"\)[\s\S]*availableChannels=\{\["voice", "email"\]\}/,
    "pricing must keep SMS packages and controls out of launch selection",
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
