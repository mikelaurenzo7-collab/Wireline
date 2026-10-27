/** BotBound launch story and acquisition contract. */
const RETIRED_PRODUCT_TERMS = [
  "Ametrine Precision",
  "Browser Companion",
  "AI profit agent",
  "AI profit agents",
  "Voice agents that get the work done",
  "7-day free trial",
  "WIRE YOUR PHONE BOT",
];

export function checkLaunchStory({ read, mustInclude, mustExclude, failures }) {
  const indexHtml = read("index.html");
  const pageMeta = read("src/lib/page-meta.tsx");
  const manifest = read("public/site.webmanifest");
  const botProduct = read("src/lib/bot-product.ts");
  const landing = read("src/components/marketing/WireAgentLanding.tsx");
  const landingPage = read("src/pages/LandingPage.tsx");
  const planCatalog = read("src/lib/plan-catalog.ts");
  const pricingPage = read("src/pages/Pricing.tsx");
  const usagePricingPanel = read("src/components/usage-billing/UsagePricingPanel.tsx");

  mustInclude(
    "index.html",
    indexHtml,
    /<title>BotBound \| A Bot for You<\/title>/,
    "static metadata must make the voice Bot offer explicit",
  );
  mustInclude(
    "index.html",
    indexHtml,
    /Voice Bots with a computer, phone number, and email address/,
    "static metadata must describe the focused launch offer",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /DEFAULT_TITLE = "BotBound \| A Bot for You"/,
    "runtime metadata must use the BotBound hero",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /DEFAULT_DESCRIPTION =\s*"Voice Bots with a computer, phone number, and email address/,
    "runtime metadata must carry the focused voice Bot offer",
  );
  mustInclude(
    "public/site.webmanifest",
    manifest,
    /"name"\s*:\s*"BotBound \| For You\. For Your Business\."/,
    "install metadata must use BotBound",
  );
  mustExclude(
    "public/site.webmanifest",
    manifest,
    /included numbers/i,
    "install metadata must not imply every tier includes a production number",
  );

  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /name:\s*"BotBound"/,
    "shared model must expose the canonical brand",
  );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /slogan:\s*"For You\. For Your Business\."/,
    "shared model must preserve the BotBound brand slogan",
  );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /supportingLine:\s*"CALL · EMAIL · COMPUTER"/,
    "shared model must keep launch capabilities explicit in canonical order",
  );
  for (const productType of ["Phone Bot", "Conversation Bot", "Human Bot"])
    mustInclude(
      "src/lib/bot-product.ts",
      botProduct,
      new RegExp(`name:\\s*"${productType}"`),
      `shared model must expose ${productType}`,
    );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /name:\s*"Create Your Own"/,
    "shared model must expose custom-role setup",
  );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /title:\s*"Your Bot\. Already Moving"/,
    "shared model must preserve the operating promise",
  );
  for (const channel of ["Call", "Text", "Email"])
    mustInclude(
      "src/lib/bot-product.ts",
      botProduct,
      new RegExp(`label:\\s*"${channel}"`),
      `shared model must expose ${channel.toLowerCase()}`,
    );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /key:\s*"voice"\s+as\s+const/,
    "technical voice identity must remain stable",
  );
  mustExclude(
    "src/lib/bot-product.ts",
    botProduct,
    /guaranteed profit|profit guarantee/i,
    "product must never promise guaranteed profit",
  );

  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    landing,
    /signedIn \? "\/studio" : "\/signup"/,
    "landing must route its primary action to plan-neutral account creation",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    landing,
    /A phone number, an email address, and a computer\./,
    "landing must describe the calling, email and Computer product family",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    landing,
    /BOT_MARKETING_VOICE\.activationLine|landing-prestige__promise/,
    "landing must keep the hero free of a redundant subhero paragraph",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    landing,
    /HERO_CHANNEL_ORDER|BOT_CHANNELS|CALL\s*[·/]\s*TEXT\s*[·/]\s*EMAIL/,
    "landing must not repeat the channel promise as decorative copy",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    landing,
    /role="tablist"[\s\S]*role="tabpanel"/,
    "landing must expose accessible capability navigation",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    landing,
    /to=\{`\/features#\$\{example\.id\}`\}/,
    "capability selection must link to the matching product section",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    landing,
    /template\.category|Business and personal templates|ONE WORKSPACE\. EVERY BOT/i,
    "landing must not revive retired taxonomy",
  );
  mustInclude(
    "src/pages/LandingPage.tsx",
    landingPage,
    /title=\{HOME_TITLE\}[\s\S]*description=\{HOME_DESCRIPTION\}/,
    "landing metadata must use shared homepage title and description",
  );

  mustInclude(
    "src/lib/plan-catalog.ts",
    planCatalog,
    /FOUNDER_CATALOG_VERSION/,
    "catalog must stay versioned",
  );
  mustInclude(
    "src/lib/plan-catalog.ts",
    planCatalog,
    /included_phone_numbers/,
    "plan catalog must back included-number claims",
  );
  // Pricing serves ONE layout: the shared-work (usage) model. The channels
  // layout and its picker were deleted Oct 26 — production never served
  // them (the plans endpoint returns the usage model), and their cold-load
  // branch was the fluctuating pricing title. The $12 entry point is the
  // Lite usage tier in the usage catalog.
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /<UsagePricingPanel availableTiers=\{availableTiers\} \/>[\s\S]*<UsagePricing availableTiers=\{usageTiers\} \/>/,
    "pricing must render the shared-work plans from live availability",
  );
  mustInclude(
    "src/lib/usage-billing-catalog.ts",
    read("src/lib/usage-billing-catalog.ts"),
    /monthlyUsd: 12/,
    "the $12 entry tier must stay in the usage catalog",
  );
  mustExclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /ChannelPlanPicker|CHANNEL_PLANS/,
    "pricing must not revive the retired channels layout",
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
    /unlimited (?:calls|messages|usage)|silent(?:ly)? add(?:ed)? overage/i,
    "pricing must not imply uncontrolled usage",
  );

  for (const [file, source] of [
    ["index.html", indexHtml],
    ["src/lib/page-meta.tsx", pageMeta],
    ["public/site.webmanifest", manifest],
    ["src/lib/bot-product.ts", botProduct],
    ["src/components/marketing/WireAgentLanding.tsx", landing],
    ["src/pages/LandingPage.tsx", landingPage],
  ]) {
    if (source.includes("—")) failures.push(`${file}: em dash found on a core buying surface`);
    const lower = source.toLowerCase();
    const found = RETIRED_PRODUCT_TERMS.filter((term) => lower.includes(term.toLowerCase()));
    if (found.length)
      failures.push(`${file}: retired product language present: ${[...new Set(found)].join(", ")}`);
  }
}
