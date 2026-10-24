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
    /to="\/signup"/,
    "landing must route its primary action to plan-neutral account creation",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    landing,
    /YOUR BOT GETS THEIR OWN PHONE NUMBER, EMAIL ADDRESS, AND COMPUTER/,
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
    /FEATURED_TEMPLATE_KEYS[\s\S]*BOT_ROLE_TEMPLATES\.find/,
    "landing must curate shared role starters",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    landing,
    /template\.summary/,
    "role cards must describe the job without repeating playbook details",
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
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /<h2[^>]*>Personal · \$12\/month<\/h2>/,
    "pricing must preserve the paid Personal plan entry",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /to=\{signupHrefForPlan\("personal", \{ interval: billingInterval \}\)\}/,
    "pricing must route Personal signup through the canonical plan destination",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /STRIPE_PLANS\.filter\([\s\S]*plan\.catalogFamily === "channels" &&[\s\S]*!plan\.channels\.includes\("sms"\)/,
    "public pricing must select current launch packages while retaining SMS in the catalog",
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
