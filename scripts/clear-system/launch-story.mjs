/**
 * Launch story. WIRELINE is a Phone Bot product customers can enter immediately.
 * Public marketing leads with desire and proof; implementation architecture stays
 * subordinate to the customer promise. Technical voice identifiers remain valid.
 */
const RETIRED_PRODUCT_TERMS = [
  "Ametrine Precision",
  "Browser Companion",
  "AI profit agent",
  "AI profit agents",
  "Voice agents that get the work done",
  "7-day free trial",
];

export function checkLaunchStory({ read, mustInclude, mustExclude, failures }) {
  const indexHtml = read("index.html");
  const pageMeta = read("src/lib/page-meta.tsx");
  const manifest = read("public/site.webmanifest");
  const botProduct = read("src/lib/bot-product.ts");
  const wireAgentLanding = read("src/components/marketing/WireAgentLanding.tsx");
  const landingPage = read("src/pages/LandingPage.tsx");
  const planCatalog = read("src/lib/plan-catalog.ts");
  const pricingPage = read("src/pages/Pricing.tsx");

  mustInclude(
    "index.html",
    indexHtml,
    /<title>WIRELINE \| WIRE YOUR PHONE BOT<\/title>/,
    "static metadata must use the Phone Bot hero",
  );
  mustInclude(
    "index.html",
    indexHtml,
    /Phone Bot[^<]*calls, text, and email/i,
    "static metadata must make the three customer channels clear",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /DEFAULT_TITLE = "WIRELINE \| WIRE YOUR PHONE BOT"/,
    "runtime metadata must use the Phone Bot hero",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /Phone Bot[^"`]*calls, text, and email/i,
    "runtime metadata must make the three customer channels clear",
  );
  mustInclude(
    "public/site.webmanifest",
    manifest,
    /"name"\s*:\s*"WIRELINE \| WIRE YOUR PHONE BOT"/,
    "install metadata must use the canonical Phone Bot promise",
  );
  mustExclude(
    "public/site.webmanifest",
    manifest,
    /included numbers/,
    "install metadata must not imply every tier includes a production number",
  );

  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /slogan:\s*"WIRE YOUR PHONE BOT"/,
    "shared Bot product model must preserve the approved hero",
  );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /supportingLine:\s*"CALL · TEXT · EMAIL"/,
    "shared Bot product model must keep every customer channel explicit",
  );
  for (const productType of ["Phone Bot", "Conversation Bot", "Human Bot"]) {
    mustInclude(
      "src/lib/bot-product.ts",
      botProduct,
      new RegExp(`name:\\s*"${productType}"`),
      `shared Bot product model must expose ${productType} as a configurable starting point`,
    );
  }
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /name:\s*"Create Your Own"/,
    "shared Bot product model must expose a custom-role starting point",
  );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /title:\s*"YOUR BOT\. ALREADY MOVING\."/,
    "shared product model must preserve a desire-led operating promise",
  );
  for (const channel of ["Call", "Text", "Email"]) {
    mustInclude(
      "src/lib/bot-product.ts",
      botProduct,
      new RegExp(`label:\\s*"${channel}"`),
      `shared Bot product model must expose ${channel.toLowerCase()} as a customer channel`,
    );
  }
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /key:\s*"voice"\s+as\s+const/,
    "technical voice channel identity must remain stable behind Phone language",
  );
  mustExclude(
    "src/lib/bot-product.ts",
    botProduct,
    /guaranteed profit|profit guarantee/i,
    "shared product model must never promise guaranteed profit",
  );

  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /<AuthAccessPanel embedded initialMode="signin"\s*\/>/,
    "landing must embed the real account-access panel",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /<span>WIRE YOUR<\/span>[\s\S]*<span>PHONE BOT<\/span>/,
    "landing must render the approved two-line hero",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /FEATURED_TEMPLATE_KEYS[\s\S]*BOT_ROLE_TEMPLATES\.find/,
    "landing must curate starters from the shared role-template catalog",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /template\.moves\.map/,
    "landing role cards must expose role-specific playbooks",
  );
  mustExclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /template\.category|Business and personal templates|ONE WORKSPACE\. EVERY BOT/i,
    "landing must not revive retired audience taxonomy or architecture-first marketing",
  );
  mustInclude(
    "src/pages/LandingPage.tsx",
    landingPage,
    /MARKETING_VOICE|BOT_MARKETING_VOICE/,
    "landing metadata must preserve shared product voice",
  );

  mustInclude(
    "src/lib/plan-catalog.ts",
    planCatalog,
    /FOUNDER_CATALOG_VERSION/,
    "the application catalog must stay versioned",
  );
  mustInclude(
    "src/lib/plan-catalog.ts",
    planCatalog,
    /included_phone_numbers/,
    "the plan catalog must back included number claims",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /Free Builder/,
    "pricing must preserve the free build tier",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /Starter Plus/,
    "pricing must preserve the Founder tier names",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /Runtime\s+Balance/,
    "pricing must explain prepaid Runtime Balance",
  );
  mustExclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /unlimited (?:calls|messages|usage)|silent(?:ly)? add(?:ed)? overage/i,
    "pricing must not imply uncontrolled or silent variable usage",
  );

  const coreBuyingSurfaces = [
    ["index.html", indexHtml],
    ["src/lib/page-meta.tsx", pageMeta],
    ["public/site.webmanifest", manifest],
    ["src/lib/bot-product.ts", botProduct],
    ["src/components/marketing/WireAgentLanding.tsx", wireAgentLanding],
    ["src/pages/LandingPage.tsx", landingPage],
  ];

  for (const [file, source] of coreBuyingSurfaces) {
    if (source.includes("—")) {
      failures.push(`${file}: em dash found on a core buying surface`);
    }
    const lower = source.toLowerCase();
    const found = RETIRED_PRODUCT_TERMS.filter((term) => lower.includes(term.toLowerCase()));
    if (found.length) {
      failures.push(`${file}: retired product language present: ${[...new Set(found)].join(", ")}`);
    }
  }
}
