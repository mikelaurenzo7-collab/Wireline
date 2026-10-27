/** Public marketing hierarchy contract. */
export function checkMarketingSurfaces({ read, mustInclude, mustExclude, failures }) {
  const executable = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const claritySystemCss = read("src/styles/clarity-system.css");
  const marketingPageFrame = read("src/components/layout/MarketingPageFrame.tsx");
  const marketingHero = read("src/components/marketing/MarketingHero.tsx");
  const publicHeader = read("src/components/marketing/PrecisionPublicHeader.tsx");
  const landing = read("src/components/marketing/WireAgentLanding.tsx");
  const marketingChrome = read("src/components/marketing/MarketingChromeBar.tsx");
  const landingPrestigeCss = read("src/styles/landing-prestige.css");
  const authAccessCss = read("src/styles/auth-access-panel.css");
  const indexCss = read("src/index.css");
  const documentFlowCss = read("src/styles/marketing-document-flow.css");
  const signatureCss = read("src/styles/wireline-signature.css");
  const botProduct = read("src/lib/bot-product.ts");
  const developersPage = read("src/pages/Developers.tsx");
  const solutionsPage = read("src/pages/SolutionsPage.tsx");
  const pricingPage = read("src/pages/Pricing.tsx");
  const usagePricingPanel = read("src/components/usage-billing/UsagePricingPanel.tsx");

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
    [/to="\/signup"/, "public header must offer a plan-neutral account entry"],
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
    if (!["/", "/features", "/pricing", "/signin", "/signup", "/studio"].includes(destination[1])) {
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
    [/signedIn \? "\/studio" : "\/signup"/, "root landing must offer plan-neutral account access"],
    [
      /A Phone Number\. An Email Address\. A Computer\./,
      "root landing must describe the product family together",
    ],
    [/<PrecisionPublicHeader \/>/, "root landing must share the public header"],
    [/role="tablist"/, "landing must expose capability navigation"],
    [/role="tabpanel"/, "capability details must be associated with their selected tab"],
    [/onKeyDown/, "capability navigation must support keyboard selection"],
    [/to="\/pricing"/, "landing must link directly to pricing"],
    [/<MarketingChromeBar\s*\/>/, "desktop landing must retain wayfinding"],
  ])
    mustInclude("src/components/marketing/WireAgentLanding.tsx", landing, pattern, description);
  mustInclude(
    "src/components/marketing/PrecisionPublicHeader.tsx",
    publicHeader,
    /to="\/signin"/,
    "shared public header must keep sign-in one action away",
  );
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
    /Business and personal templates|Runtime\s+Balance|Start 7-day trial|Try 7 days free|\$159|postpaid voice-overage/i,
    "landing must not lead with architecture or billing mechanics",
  );

  for (const [pattern, description] of [
    [
      /\.landing-prestige__hero\s*\{[^}]*place-items:\s*center;[^}]*text-align:\s*center;/,
      "home hero must be one centered column",
    ],
    [
      /text-wrap:\s*balance;/,
      "display headings must balance lines while retaining text enlargement",
    ],
    [
      /\.landing-prestige__example\s*\{[^}]*text-align:\s*center;/,
      "capability details must align with centered content",
    ],
    [
      /\.landing-prestige__hero h1\s*\{[^}]*flex-wrap:\s*wrap;/,
      "hero phrases must reflow on narrow screens",
    ],
    [/\.landing-prestige__tabs/, "landing must provide channel navigation"],
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
  for (const [pattern, description] of [
    [/<footer\b/, "marketing footer must render a footer landmark"],
    [/to: "\/support"/, "marketing footer must link to support"],
    [/to: "\/privacy"/, "marketing footer must link to privacy"],
    [/to: "\/terms"/, "marketing footer must link to terms"],
    [/wireline:open-privacy-choices/, "marketing footer must open privacy choices"],
  ])
    mustInclude(
      "src/components/marketing/MarketingChromeBar.tsx",
      marketingChrome,
      pattern,
      description,
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
    /<UsagePricingPanel availableTiers=\{availableTiers\} \/>[\s\S]*<UsagePricing availableTiers=\{usageTiers\} \/>/,
    "pricing must render the shared-work plans from live availability",
  );
  mustExclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /ChannelPlanPicker|CHANNEL_PLANS/,
    "pricing must not revive the retired channels layout",
  );
  const planDisplay = read("src/lib/plan-display.ts");
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
  }
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /usePaidPlanAvailability\(\{[\s\S]*interval: billingInterval,[\s\S]*planId: selectedPlanId/,
    "pricing must check live availability for the selected package and interval",
  );
  mustInclude(
    "src/components/usage-billing/UsagePricingPanel.tsx",
    usagePricingPanel,
    /Calls, texts, email, and Computer share that work/,
    "pricing must explain shared work",
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
    /"create_agent_draft", "update_agent_draft"/,
    "developer API identifiers must remain stable",
  );
  mustInclude(
    "src/pages/Developers.tsx",
    developersPage,
    /title: "Draft a Bot"/,
    "developer surface must call customer objects Bots",
  );
}
