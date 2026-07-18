/**
 * Launch story — Wire → Work → Win and the AI-employee operating model are
 * the active truth across metadata, install surfaces, shared copy, conversion,
 * and billing. Retired brand eras must not return to active product surfaces.
 */
const RETIRED_PRODUCT_TERMS = [
  "Ametrine Precision",
  "Browser Companion",
  "AI profit agent",
  "AI profit agents",
  "7-day free trial",
];

export function checkLaunchStory({ read, mustInclude, mustExclude, failures }) {
  const indexHtml = read("index.html");
  const pageMeta = read("src/lib/page-meta.tsx");
  const manifest = read("public/site.webmanifest");
  const productCopy = read("src/lib/product-copy.ts");
  const wireAgentLanding = read("src/components/marketing/WireAgentLanding.tsx");
  const landingPage = read("src/pages/LandingPage.tsx");
  const planCatalog = read("src/lib/plan-catalog.ts");
  const pricingPage = read("src/pages/Pricing.tsx");

  mustInclude(
    "index.html",
    indexHtml,
    /<title>Wireline — Your next AI employee calls, texts &amp; emails<\/title>/,
    "static metadata must state the current product promise",
  );
  mustInclude(
    "index.html",
    indexHtml,
    /One trained employee handles customer conversations across voice, SMS, and email/,
    "static metadata must state the current product category",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /DEFAULT_TITLE = "Wireline - Your next AI employee calls, texts & emails"/,
    "runtime metadata must state the current product promise",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /One trained employee handles customer conversations across voice, SMS, and email/,
    "runtime metadata must use the current product description",
  );
  mustInclude(
    "public/site.webmanifest",
    manifest,
    /"name"\s*:\s*"Wireline - Your next AI employee"/,
    "install metadata must use the canonical single-employee positioning",
  );
  mustInclude(
    "public/site.webmanifest",
    manifest,
    /One trained AI employee handles customer conversations across voice, SMS, and email/,
    "install metadata must explain the multichannel operating value",
  );
  mustExclude(
    "public/site.webmanifest",
    manifest,
    /included numbers/,
    "install metadata must not imply every tier includes a production number",
  );

  mustInclude(
    "src/lib/product-copy.ts",
    productCopy,
    /northStar:\s*"The best employee you've ever had, for next to nothing\."/,
    "shared copy must preserve the north-star promise",
  );
  mustInclude(
    "src/lib/product-copy.ts",
    productCopy,
    /productNoun:\s*"AI employee"/,
    "shared copy must define the canonical product noun",
  );
  mustInclude(
    "src/lib/product-copy.ts",
    productCopy,
    /brandSpine:\s*\["Wire", "Work", "Win"\]/,
    "shared copy must define the canonical brand spine",
  );
  mustInclude(
    "src/lib/product-copy.ts",
    productCopy,
    /AGENT_NUMBER_PROMISE/,
    "shared copy must expose the included-number promise",
  );
  mustInclude(
    "src/lib/product-copy.ts",
    productCopy,
    /includes a Wireline number at no extra line fee/,
    "the included-number promise must stay explicit",
  );
  mustExclude(
    "src/lib/product-copy.ts",
    productCopy,
    /guaranteed profit|profit guarantee/i,
    "shared copy must never promise guaranteed profit",
  );

  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /MARKETING_VOICE\.headline/,
    "landing must consume the shared brand spine",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /MARKETING_VOICE\.subline/,
    "landing must consume the shared product subline",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /\/signup\?plan=starter&mode=outbound/,
    "sales conversion must preserve Starter intent",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /Conversation Balance/,
    "landing economics must explain prepaid variable usage",
  );
  mustInclude(
    "src/pages/LandingPage.tsx",
    landingPage,
    /Wire → Work → Win|MARKETING_VOICE/,
    "landing metadata or composition must preserve the brand spine",
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
    "the plan catalog must back included-number claims",
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
    /Conversation Balance/,
    "pricing must explain prepaid Conversation Balance",
  );
  mustExclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /unlimited (?:calls|messages|usage)|silent(?:ly)? add(?:ed)? overage/i,
    "pricing must not imply uncontrolled or silent variable usage",
  );

  for (const [file, source] of [
    ["index.html", indexHtml],
    ["src/lib/page-meta.tsx", pageMeta],
    ["src/lib/product-copy.ts", productCopy],
    ["src/components/marketing/WireAgentLanding.tsx", wireAgentLanding],
    ["public/site.webmanifest", manifest],
  ]) {
    const lower = source.toLowerCase();
    const found = RETIRED_PRODUCT_TERMS.filter((term) => lower.includes(term.toLowerCase()));
    if (found.length) {
      failures.push(`${file}: retired product language present: ${[...new Set(found)].join(", ")}`);
    }
  }
}
