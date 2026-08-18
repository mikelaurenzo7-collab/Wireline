/**
 * Launch story. One workspace, voice-first configurable Bots, and role
 * templates are the active truth across metadata, conversion, and billing.
 * Retired brand eras must not return to active product surfaces.
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
    /<title>WIRELINE \| VOICE BOTS THAT GET THE WORK DONE<\/title>/,
    "static metadata must state the current product promise",
  );
  mustInclude(
    "index.html",
    indexHtml,
    /Build a voice-first Bot that answers and makes calls, carries conversations into text and email, books next steps, and follows through from one workspace\./,
    "static metadata must state the current product category and value",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /DEFAULT_TITLE = "WIRELINE \| VOICE BOTS THAT GET THE WORK DONE"/,
    "runtime metadata must state the current product promise",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /Build a voice-first Bot that answers and makes calls, carries conversations into text and email, books next steps, and follows through from one workspace\./,
    "runtime metadata must use the current product description",
  );
  mustInclude(
    "public/site.webmanifest",
    manifest,
    /"name"\s*:\s*"WIRELINE \| VOICE BOTS THAT GET THE WORK DONE"/,
    "install metadata must use the canonical voice-first Bot category",
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
    /slogan:\s*"BOTS THAT GET THE WORK DONE"/,
    "shared Bot product model must preserve the approved outcome promise",
  );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /supportingLine:\s*"VOICE-FIRST BOTS FOR CALLS, LIVE CONVERSATIONS, TEXT, AND EMAIL"/,
    "shared Bot product model must keep every core conversation channel explicit",
  );
  for (const productType of ["Voice Bot", "Conversation Bot", "Human Bot"]) {
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
    /title:\s*"ONE WORKSPACE\. EVERY BOT\."/,
    "shared Bot product model must preserve the one-workspace architecture",
  );
  for (const channel of ["Voice", "Text", "Email"]) {
    mustInclude(
      "src/lib/bot-product.ts",
      botProduct,
      new RegExp(`label:\\s*"${channel}"`),
      `shared Bot product model must expose ${channel.toLowerCase()} as a configurable channel`,
    );
  }
  mustExclude(
    "src/lib/bot-product.ts",
    botProduct,
    /guaranteed profit|profit guarantee/i,
    "shared product model must never promise guaranteed profit",
  );

  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /MARKETING_VOICE\.headline/,
    "landing must consume the shared Bot headline",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /BOT_ROLE_TEMPLATES\.map/,
    "landing must expose the shared role-template catalog",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /Runtime\s+Balance/,
    "landing economics must explain prepaid Runtime Balance",
  );
  mustInclude(
    "src/pages/LandingPage.tsx",
    landingPage,
    /MARKETING_VOICE|BOT_MARKETING_VOICE/,
    "landing metadata or composition must preserve shared product voice",
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
