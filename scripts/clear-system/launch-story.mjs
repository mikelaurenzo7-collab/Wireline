/**
 * Launch story — the profit-agent positioning and the included-number promise
 * are the active truth across static metadata, runtime metadata, manifest,
 * OG asset, shared copy, landing, catalog, billing render paths, and docs.
 * Retired positioning must not resurface on any of these surfaces.
 */
const RETIRED_PRODUCT_TERMS = [
  "Ametrine Precision",
  "Browser Companion",
  "personal AI call assistant",
  "AI phone employee",
  "AI phone employees",
];

export function checkLaunchStory({ read, mustInclude, mustExclude, failures }) {
  const indexHtml = read("index.html");
  const pageMeta = read("src/lib/page-meta.tsx");
  const manifest = read("public/site.webmanifest");
  const ogImage = read("public/og-image.svg");
  const productCopy = read("src/lib/product-copy.ts");
  const wireAgentLanding = read("src/components/marketing/WireAgentLanding.tsx");
  const landingPage = read("src/pages/LandingPage.tsx");
  const planCatalog = read("src/lib/plan-catalog.ts");
  const billingSettings = read("src/pages/BillingSettings.tsx");
  const pricingPage = read("src/pages/Pricing.tsx");
  const extensionPanel = read("apps/browser-extension/panel/index.html");
  const docsReadme = read("docs/README.md");
  const rootReadme = read("README.md");
  const wedgeDoc = read("docs/OUTBOUND_CALL_AGENT_WEDGE_2026-07-07.md");

  mustInclude(
    "index.html",
    indexHtml,
    /Wireline — AI profit agents that actually call\./,
    "static metadata must use the profit-agent positioning",
  );
  mustInclude(
    "index.html",
    indexHtml,
    /AI profit agents with included numbers.*book appointments, revive leads, promote offers/i,
    "static metadata must describe the profit-agent and included-number promise",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /DEFAULT_TITLE = "Wireline - AI profit agents that actually call"/,
    "runtime fallback title must use profit-agent positioning",
  );
  mustInclude(
    "src/lib/page-meta.tsx",
    pageMeta,
    /AI profit agents with included numbers/,
    "runtime fallback description must use the included-number promise",
  );
  mustInclude(
    "public/site.webmanifest",
    manifest,
    /"name"\s*:\s*"Wireline - AI profit agents"/,
    "install manifest must use profit-agent positioning",
  );
  mustInclude(
    "public/og-image.svg",
    ogImage,
    /AI PROFIT[\s\S]*AGENTS/,
    "OG image must use the profit-agent headline",
  );
  mustInclude(
    "public/og-image.svg",
    ogImage,
    /Book\. Revive\. Promote\. Follow up\. Log every result\./,
    "OG image must reinforce the profit-agent promise",
  );

  mustInclude(
    "src/lib/product-copy.ts",
    productCopy,
    /AI profit agents that actually call\./,
    "shared product copy must anchor the profit-agent headline",
  );
  mustInclude(
    "src/lib/product-copy.ts",
    productCopy,
    /PROFIT_AGENT_NUMBER_PROMISE/,
    "shared product copy must expose the number promise",
  );
  mustInclude(
    "src/lib/product-copy.ts",
    productCopy,
    /Every included Wireline agent comes with an included number/,
    "number promise must be explicit and reusable",
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
    /Your best salesperson, without the commission\./,
    "landing page must use the strongest profit wedge",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /Every included agent gets an included number/,
    "landing page must market the included-number promise",
  );
  mustInclude(
    "src/components/marketing/WireAgentLanding.tsx",
    wireAgentLanding,
    /List -> Pitch -> Call -> Profit/,
    "landing page must teach the profit-agent loop",
  );
  mustInclude(
    "src/pages/LandingPage.tsx",
    landingPage,
    /AI profit agents with included numbers/,
    "landing metadata must describe profit agents with included numbers",
  );

  mustInclude(
    "src/lib/plan-catalog.ts",
    planCatalog,
    /Every included agent includes one dedicated number/,
    "catalog contract must back the included-number claim",
  );
  mustInclude(
    "src/lib/plan-catalog.ts",
    planCatalog,
    /max_agents:\s*4,[\s\S]*included_phone_numbers:\s*4/,
    "Team must include one number per included agent",
  );
  mustInclude(
    "src/lib/plan-catalog.ts",
    planCatalog,
    /max_agents:\s*8,[\s\S]*included_phone_numbers:\s*8/,
    "Business must include one number per included agent",
  );
  mustInclude(
    "src/pages/BillingSettings.tsx",
    billingSettings,
    /plan\.included_phone_numbers/,
    "billing settings must render included-number capacity from the catalog",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /\$\{planById\.team\.included_phone_numbers\} phone lines included/,
    "pricing must render Team included numbers from the catalog",
  );
  mustInclude(
    "src/pages/Pricing.tsx",
    pricingPage,
    /\$\{planById\.business\.included_phone_numbers\} phone lines included/,
    "pricing must render Business included numbers from the catalog",
  );

  mustInclude(
    "apps/browser-extension/panel/index.html",
    extensionPanel,
    /Command your AI profit agent from any page/,
    "browser command must use profit-agent copy",
  );

  mustInclude(
    "docs/README.md",
    docsReadme,
    /AI profit agents/,
    "docs index must describe the current profit-agent wedge",
  );
  mustInclude(
    "docs/README.md",
    docsReadme,
    /one dedicated number/i,
    "docs index must describe the included-number promise",
  );
  mustInclude("README.md", rootReadme, /Profit agents/, "README must describe profit agents");
  mustInclude(
    "README.md",
    rootReadme,
    /Every included agent gets an included number/,
    "README must describe the included-number promise",
  );
  mustInclude(
    "docs/OUTBOUND_CALL_AGENT_WEDGE_2026-07-07.md",
    wedgeDoc,
    /AI Profit Agent Wedge/,
    "wedge doc must be recast around profit agents",
  );
  mustInclude(
    "docs/OUTBOUND_CALL_AGENT_WEDGE_2026-07-07.md",
    wedgeDoc,
    /Every included Wireline agent should include one dedicated number/,
    "wedge doc must pin the included-number promise",
  );

  for (const [file, source] of [
    ["index.html", indexHtml],
    ["src/lib/page-meta.tsx", pageMeta],
    ["src/lib/product-copy.ts", productCopy],
    ["src/components/marketing/WireAgentLanding.tsx", wireAgentLanding],
    ["public/site.webmanifest", manifest],
    ["public/og-image.svg", ogImage],
    ["README.md", rootReadme],
    ["docs/README.md", docsReadme],
  ]) {
    const lower = source.toLowerCase();
    const found = RETIRED_PRODUCT_TERMS.filter((term) => lower.includes(term.toLowerCase()));
    if (found.length) {
      failures.push(`${file}: retired product language present: ${[...new Set(found)].join(", ")}`);
    }
  }
}
