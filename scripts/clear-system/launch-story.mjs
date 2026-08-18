/**
 * Launch story. One workspace, configurable Bots, and role templates are the
 * active truth across metadata, conversion, and billing. Retired brand eras
 * must not return to active product surfaces.
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
  const botProduct = read("src/lib/bot-product.ts");
  const wireAgentLanding = read("src/components/marketing/WireAgentLanding.tsx");
  const landingPage = read("src/pages/LandingPage.tsx");
  const planCatalog = read("src/lib/plan-catalog.ts");
  const pricingPage = read("src/pages/Pricing.tsx");

  mustInclude(
    "index.html",
    indexHtml,
    /<title>Wireline \| Voice agents that get the work done<\/title>/,
    "static metadata must state the current product promise",
  );
  mustInclude(
    "index.html",
    indexHtml,
    /Build one for your business or your life\. It can call, answer, text, email, book, and follow through while you stay in control\./,
    "static metadata must state the current product category and value",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /DEFAULT_TITLE = "Wireline \| Voice agents that get the work done"/,
    "runtime metadata must state the current product promise",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /Build one for your business or your life\. It can call, answer, text, email, book, and follow through while you stay in control\./,
    "runtime metadata must use the current product description",
  );
  mustInclude(
    "public/site.webmanifest",
    manifest,
    /"name"\s*:\s*"Wireline \| Voice Agents"/,
    "install metadata must use the canonical voice category",
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
    /headline:\s*"Build a Bot for Any Job"/,
    "shared Bot product model must preserve the configurable-job promise",
  );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /name:\s*"Create Your Own"/,
    "shared Bot product model must expose a custom-role starting point",
  );
  mustInclude(
    "src/lib/bot-product.ts",
    botProduct,
    /title:\s*"One Workspace\. Every Bot\."/,
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
