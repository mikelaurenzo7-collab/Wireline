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

  mustInclude(
    "index.html",
    indexHtml,
    /<title>BotBound \| Hire a Voice Bot<\/title>/,
    "static metadata must make the voice Bot offer explicit",
  );
  mustInclude(
    "index.html",
    indexHtml,
    /Calls plans include a dedicated phone number/,
    "static metadata must qualify the dedicated phone identity by plan",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /DEFAULT_TITLE = "BotBound \| Hire a Voice Bot"/,
    "runtime metadata must use the BotBound hero",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /DEFAULT_DESCRIPTION =\s*"Give your voice Bot a goal:[\s\S]*Calls plans include a dedicated phone number/,
    "runtime metadata must carry the voice Bot offer and qualified phone identity",
  );
  mustInclude(
    "public/site.webmanifest",
    manifest,
    /"name"\s*:\s*"BotBound \| Your Next Hire Is a Bot"/,
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
    /slogan:\s*"Your Next Hire Is a Bot"/,
    "shared model must preserve the BotBound brand slogan",
  );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /supportingLine:\s*"CALL · TEXT · EMAIL"/,
    "shared model must keep customer channels explicit in canonical order",
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
    /to=\{signupHrefForPlan\("personal"\)\}/,
    "landing must route its primary action to free account creation",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    landing,
    /<span>Voice Bots<\/span>\s*<span>With a Computer,<\/span>[\s\S]*<span>Phone Number,<\/span>\s*<span>and Branded Email\.<\/span>/,
    "landing must render the computer, phone number, and email hero",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    landing,
    /BOT_MARKETING_VOICE\.activationLine/,
    "landing must source the concise activation promise",
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
    /FEATURED_TEMPLATE_KEYS[\s\S]*BOT_ROLE_TEMPLATES\.find/,
    "landing must curate shared role starters",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    landing,
    /template\.moves\.map/,
    "role cards must expose playbook moves",
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
  for (const tier of ["Free Builder"])
    mustInclude(
      "src/pages/Pricing.tsx",
      pricingPage,
      new RegExp(tier.replace(" ", "\\s+")),
      `pricing must preserve ${tier}`,
    );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /STRIPE_PLANS\.filter\(\(plan\) => plan\.catalogFamily === "channels"\)/,
    "public pricing must select the current channel catalog, not retained historical plans",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /<ChannelPlanPicker[\s\S]*plans=\{CHANNEL_PLANS\}/,
    "public pricing must render the shared channel and capacity selector",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /Runtime\s+Balance/,
    "pricing must explain Runtime Balance",
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
