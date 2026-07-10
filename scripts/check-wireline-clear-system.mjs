import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const retiredProductTerms = [
  "Ametrine Precision",
  "Browser Companion",
  "personal AI call assistant",
  "AI phone employees that turn calls into sales.",
];
const oldPalette = /#5D3FD3|#451EBB|#F8F9FF|#EFF4FF|#E5EEFF|#0B1C30|rgba\(93,\s*63,\s*211/i;

function pathFor(relativePath) {
  return resolve(root, relativePath);
}

function read(relativePath) {
  const path = pathFor(relativePath);
  if (!existsSync(path)) {
    failures.push(`${relativePath}: missing`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function mustInclude(file, source, pattern, message) {
  if (!pattern.test(source)) failures.push(`${file}: ${message}`);
}

function mustExclude(file, source, pattern, message) {
  if (pattern.test(source)) failures.push(`${file}: ${message}`);
}

function mustBeDeleted(relativePath, message) {
  if (existsSync(pathFor(relativePath))) failures.push(`${relativePath}: ${message}`);
}

function assertNoRetiredTerms(file, source) {
  const lower = source.toLowerCase();
  const found = retiredProductTerms.filter((term) => lower.includes(term.toLowerCase()));
  if (found.length) failures.push(`${file}: retired product language present: ${found.join(", ")}`);
}

const packageJson = read("package.json");
const indexHtml = read("index.html");
const tokenSource = read("design-tokens/wireline.tokens.json");
const designSystemCss = read("src/styles/design-system.css");
const claritySystemCss = read("src/styles/clarity-system.css");
const foundationCss = read("src/styles/foundation.css");
const appRoutes = read("src/routes/AppRoutes.tsx");
const workspaceShell = read("src/components/WorkspaceShell.tsx");
const marketingPageFrame = read("src/components/layout/MarketingPageFrame.tsx");
const landingPage = read("src/pages/LandingPage.tsx");
const wireAgentLanding = read("src/components/marketing/WireAgentLanding.tsx");
const pricingPage = read("src/pages/Pricing.tsx");
const featuresPage = read("src/pages/Features.tsx");
const pageMeta = read("src/lib/page-meta.tsx");
const productCopy = read("src/lib/product-copy.ts");
const planCatalog = read("src/lib/plan-catalog.ts");
const billingSettings = read("src/pages/BillingSettings.tsx");
const extensionPanel = read("apps/browser-extension/panel/index.html");
const docsReadme = read("docs/README.md");
const rootReadme = read("README.md");
const wedgeDoc = read("docs/OUTBOUND_CALL_AGENT_WEDGE_2026-07-07.md");
const manifest = read("public/site.webmanifest");
const ogImage = read("public/og-image.svg");
const webTokens = read("src/styles/tokens.generated.css");
const browserTokens = read("apps/browser-extension/panel/tokens.generated.css");
const androidTokens = read(
  "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
);
const iosTokens = read("ios/Wireline/Theme/WirelineDesignTokens.generated.swift");

mustInclude(
  "package.json",
  packageJson,
  /"design:check"\s*:\s*"node scripts\/check-wireline-clear-system\.mjs(?:\s*&&\s*node scripts\/check-command-palette-contract\.mjs)?"/,
  "design:check must run this file",
);

mustInclude(
  "design-tokens/wireline.tokens.json",
  tokenSource,
  /"\$description"\s*:\s*"Wireline dark design tokens/,
  "token source must describe the Wireline dark system",
);
mustInclude(
  "design-tokens/wireline.tokens.json",
  tokenSource,
  /"default"\s*:\s*\{\s*"\$type"\s*:\s*"color",\s*"\$value"\s*:\s*"#A78BFA"\s*\}/,
  "token source primary action must be the Aurora electric violet #A78BFA",
);
for (const [file, source] of [
  ["design-tokens/wireline.tokens.json", tokenSource],
  ["src/styles/tokens.generated.css", webTokens],
  ["apps/browser-extension/panel/tokens.generated.css", browserTokens],
  ["android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt", androidTokens],
  ["ios/Wireline/Theme/WirelineDesignTokens.generated.swift", iosTokens],
]) {
  mustExclude(file, source, oldPalette, "must not contain the retired purple/blue palette");
}

mustInclude(
  "src/styles/foundation.css",
  foundationCss,
  /color-scheme:\s*dark/,
  "the product is dark-only; the root color-scheme must be dark",
);
mustInclude(
  "src/styles/foundation.css",
  foundationCss,
  /overflow:\s*hidden/,
  "outer viewport must stay locked",
);
mustInclude(
  "src/styles/design-system.css",
  designSystemCss,
  /Wireline — Letterpress design system/,
  "name the current Letterpress system",
);
mustInclude(
  "src/styles/clarity-system.css",
  claritySystemCss,
  /\.marketing-surface :is\(\.wl-public-rail, \.wl-marketing-center\) \{\s*text-align:\s*center;/,
  "marketing pages must center public rails by design-system rule",
);
mustInclude(
  "src/styles/clarity-system.css",
  claritySystemCss,
  /\.marketing-surface \.wl-marketing-actions,[\s\S]*\.marketing-hero__actions[\s\S]*justify-content:\s*center;/,
  "marketing actions must center by default",
);
mustInclude(
  "src/components/layout/MarketingPageFrame.tsx",
  marketingPageFrame,
  /scroll \? "grow" : "min-h-0 flex-1"/,
  "scroll marketing pages must grow with content before the footer renders",
);

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
mustInclude(
  "README.md",
  rootReadme,
  /Profit agents/,
  "README must describe profit agents",
);
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

mustInclude(
  "src/pages/Features.tsx",
  featuresPage,
  /Build → Train → Launch → Improve/,
  "features page must preserve the current launch loop",
);
mustInclude(
  "src/routes/AppRoutes.tsx",
  appRoutes,
  /path="\/studio"/,
  "Studio must remain a mounted authenticated surface",
);
mustInclude(
  "src/routes/AppRoutes.tsx",
  appRoutes,
  /to="\/phone\?tab=logs"/,
  "legacy call-log routes must redirect to Phone logs",
);
mustInclude(
  "src/components/WorkspaceShell.tsx",
  workspaceShell,
  /MOBILE_PRIMARY_NAV/,
  "workspace shell must use centralized navigation constants",
);
mustInclude(
  "apps/browser-extension/panel/index.html",
  extensionPanel,
  /Command your AI profit agent from any page/,
  "browser command must use profit-agent copy",
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
  assertNoRetiredTerms(file, source);
}

mustBeDeleted("src/components/ExperimentalConsole.tsx", "experimental console should not be revived");
mustBeDeleted("src/components/LegacySidebar.tsx", "legacy sidebar should not be revived");

if (failures.length) {
  console.error(`Wireline Clear System check failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Wireline Clear System check passed");
}
