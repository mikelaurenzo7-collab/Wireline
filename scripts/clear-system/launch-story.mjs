/** BotBound launch story and acquisition contract. */
const RETIRED_PRODUCT_TERMS = ["Ametrine Precision", "Browser Companion", "AI profit agent", "AI profit agents", "Voice agents that get the work done", "7-day free trial", "WIRE YOUR PHONE BOT"];

export function checkLaunchStory({ read, mustInclude, mustExclude, failures }) {
  const indexHtml = read("index.html");
  const pageMeta = read("src/lib/page-meta.tsx");
  const manifest = read("public/site.webmanifest");
  const botProduct = read("src/lib/bot-product.ts");
  const landing = read("src/components/marketing/WireAgentLanding.tsx");
  const landingPage = read("src/pages/LandingPage.tsx");
  const planCatalog = read("src/lib/plan-catalog.ts");
  const pricingPage = read("src/pages/Pricing.tsx");

  mustInclude("index.html", indexHtml, /<title>BotBound \| Put Your Bot on the Line<\/title>/, "static metadata must use the BotBound hero");
  mustInclude("index.html", indexHtml, /AI employees for calls, texts, and email\./, "static metadata must carry the compact multi-channel promise");
  mustInclude("src/lib/page-meta.tsx", pageMeta, /DEFAULT_TITLE = "BotBound \| Put Your Bot on the Line"/, "runtime metadata must use the BotBound hero");
  mustInclude("src/lib/page-meta.tsx", pageMeta, /DEFAULT_DESCRIPTION = "AI employees for calls, texts, and email\."/, "runtime metadata must carry the compact promise");
  mustInclude("public/site.webmanifest", manifest, /"name"\s*:\s*"BotBound \| Put Your Bot on the Line"/, "install metadata must use BotBound");
  mustExclude("public/site.webmanifest", manifest, /included numbers/i, "install metadata must not imply every tier includes a production number");

  mustInclude("src/lib/bot-product.ts", botProduct, /name:\s*"BotBound"/, "shared model must expose the canonical brand");
  mustInclude("src/lib/bot-product.ts", botProduct, /slogan:\s*"PUT YOUR BOT ON THE LINE"/, "shared model must preserve the approved BotBound hero");
  mustInclude("src/lib/bot-product.ts", botProduct, /supportingLine:\s*"CALL · TEXT · EMAIL"/, "shared model must keep customer channels explicit in canonical order");
  for (const productType of ["Phone Bot", "Conversation Bot", "Human Bot"]) mustInclude("src/lib/bot-product.ts", botProduct, new RegExp(`name:\\s*"${productType}"`), `shared model must expose ${productType}`);
  mustInclude("src/lib/bot-product.ts", botProduct, /name:\s*"Create Your Own"/, "shared model must expose custom-role setup");
  mustInclude("src/lib/bot-product.ts", botProduct, /title:\s*"YOUR BOT\. ALREADY MOVING\."/, "shared model must preserve the operating promise");
  for (const channel of ["Call", "Text", "Email"]) mustInclude("src/lib/bot-product.ts", botProduct, new RegExp(`label:\\s*"${channel}"`), `shared model must expose ${channel.toLowerCase()}`);
  mustInclude("src/lib/bot-product.ts", botProduct, /key:\s*"voice"\s+as\s+const/, "technical voice identity must remain stable");
  mustExclude("src/lib/bot-product.ts", botProduct, /guaranteed profit|profit guarantee/i, "product must never promise guaranteed profit");

  mustInclude("src/components/marketing/WireAgentLanding.tsx", landing, /<AuthAccessPanel embedded initialMode="signin"\s*\/>/, "landing must embed account access");
  mustInclude("src/components/marketing/WireAgentLanding.tsx", landing, /<span>PUT YOUR BOT<\/span>[\s\S]*<span>ON THE LINE<\/span>/, "landing must render the approved two-line hero");
  mustInclude("src/components/marketing/WireAgentLanding.tsx", landing, /const HERO_CHANNEL_ORDER = \["voice", "text", "email"\] as const;/, "landing must preserve Call, Text, Email order");
  mustInclude("src/components/marketing/WireAgentLanding.tsx", landing, /FEATURED_TEMPLATE_KEYS[\s\S]*BOT_ROLE_TEMPLATES\.find/, "landing must curate shared role starters");
  mustInclude("src/components/marketing/WireAgentLanding.tsx", landing, /template\.moves\.map/, "role cards must expose playbook moves");
  mustExclude("src/components/marketing/WireAgentLanding.tsx", landing, /template\.category|Business and personal templates|ONE WORKSPACE\. EVERY BOT/i, "landing must not revive retired taxonomy");
  mustInclude("src/pages/LandingPage.tsx", landingPage, /BOT_MARKETING_VOICE/, "landing metadata must use shared product voice");

  mustInclude("src/lib/plan-catalog.ts", planCatalog, /FOUNDER_CATALOG_VERSION/, "catalog must stay versioned");
  mustInclude("src/lib/plan-catalog.ts", planCatalog, /included_phone_numbers/, "plan catalog must back included-number claims");
  for (const tier of ["Free Builder", "Starter Plus"]) mustInclude("src/pages/Pricing.tsx", pricingPage, new RegExp(tier.replace(" ", "\\s+")), `pricing must preserve ${tier}`);
  mustInclude("src/pages/Pricing.tsx", pricingPage, /Runtime\s+Balance/, "pricing must explain Runtime Balance");
  mustExclude("src/pages/Pricing.tsx", pricingPage, /unlimited (?:calls|messages|usage)|silent(?:ly)? add(?:ed)? overage/i, "pricing must not imply uncontrolled usage");

  for (const [file, source] of [["index.html", indexHtml], ["src/lib/page-meta.tsx", pageMeta], ["public/site.webmanifest", manifest], ["src/lib/bot-product.ts", botProduct], ["src/components/marketing/WireAgentLanding.tsx", landing], ["src/pages/LandingPage.tsx", landingPage]]) {
    if (source.includes("—")) failures.push(`${file}: em dash found on a core buying surface`);
    const lower = source.toLowerCase();
    const found = RETIRED_PRODUCT_TERMS.filter((term) => lower.includes(term.toLowerCase()));
    if (found.length) failures.push(`${file}: retired product language present: ${[...new Set(found)].join(", ")}`);
  }
}
