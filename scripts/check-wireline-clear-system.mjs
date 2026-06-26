import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
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

const packageJson = read("package.json");
const appRoutes = read("src/routes/AppRoutes.tsx");
const tokenSource = read("design-tokens/wireline.tokens.json");
const foundationCss = read("src/styles/foundation.css");
const designSystemCss = read("src/styles/design-system.css");
const studioOperationsCss = read("src/styles/studio-operations.css");
const workspaceShell = read("src/components/WorkspaceShell.tsx");
const mobileBrowserUtilities = read("src/components/MobileBrowserUtilities.tsx");
const agentsPage = read("src/pages/AgentsPage.tsx");
const overviewPage = read("src/pages/OverviewPage.tsx");
const actionsPage = read("src/pages/ActionsPage.tsx");
const pricingPage = read("src/pages/Pricing.tsx");
const developersPage = read("src/pages/Developers.tsx");
const settingsPage = read("src/pages/SettingsPage.tsx");
const accountRoutes = read("src/routes/account-routes.ts");
const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
const studioOverview = read("src/components/StudioOverview.tsx");
const createDialog = read("src/components/CreateAgentDialog.tsx");
const studioWorkroom = read("src/components/StudioWorkroom.tsx");
const assetUpload = read("src/components/AgentAssetUpload.tsx");
const agentConfigPanel = read("src/components/fleet-settings/AgentConfigPanel.tsx");
const trainingPage = read("src/pages/KnowledgePage.tsx");
const knowledgeWorkspace = read("src/components/KnowledgeWorkspace.tsx");
const assistantComposer = read("src/components/AssistantComposer.tsx");
const browserCallWidget = read("src/components/marketing/BrowserCallWidget.tsx");
const trustSignals = read("src/components/marketing/TrustSignals.tsx");
const zipLanding = read("src/components/migration/ZipLanding.tsx");
const precisionLanding = read("src/components/marketing/PrecisionLanding.tsx");
const signalOrbFrame = read("src/components/ui/SignalOrbFrame.tsx");
const wirelineKnowledge = read("src/data/wireline-knowledge.ts");
const wirelineOpsDesign = read("src/lib/wireline-ops-design.ts");
const verticalWedges = read("src/data/vertical-wedges.ts");
const founderSeed = read("src/lib/founder-fleet-seed.ts");
const wirelinePersonas = read("src/lib/wireline-agent-personas.ts");
const stripeBillingCard = read("src/components/StripeBillingCard.tsx");
const trialGateModal = read("src/components/TrialGateModal.tsx");
const dbSchema = read("src/db/schema.ts");
const creditWallet = read("src/lib/credit-wallet.ts");
const billingRoutes = read("src/routes/billing-routes.ts");
const balanceMigration = read("drizzle/migrations/0074_harden_conversation_balance_ledger.sql");
const prodVisualQa = read("scripts/capture-prod-visual-qa.mjs");
const webTokens = read("src/styles/tokens.generated.css");
const browserTokens = read("apps/browser-extension/panel/tokens.generated.css");
const extensionManifest = read("apps/browser-extension/manifest.base.json");
const extensionWorker = read("apps/browser-extension/background/service-worker.js");
const extensionPanel = read("apps/browser-extension/panel/index.html");
const extensionPanelJs = read("apps/browser-extension/panel/panel.js");
const extensionCommandCss = read("apps/browser-extension/panel/command.css");
const extensionBuild = read("apps/browser-extension/scripts/build.mjs");
const extensionReadme = read("apps/browser-extension/README.md");
const docsReadme = read("docs/README.md");
const tokenConstants = read("src/constants/generated-design-tokens.ts");
const androidTokens = read(
  "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
);
const androidApp = read("android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt");
const androidSetup = read("android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt");
const iosTokens = read("ios/Wireline/Theme/WirelineDesignTokens.generated.swift");
const iosWidget = read("ios/WirelineShared/WirelineWidgetSnapshot.swift");
const iosRootTabs = read("ios/Wireline/Views/RootTabView.swift");
const iosWorkspace = read("ios/Wireline/Views/WorkspaceView.swift");
const iosAgentLibrary = read("ios/Wireline/Views/AssistantLibraryView.swift");
const iosTrainingWire = read("ios/Wireline/Views/AssistantSetupViews.swift");
const iosCarPlay = read("ios/Wireline/CarPlay/CarPlaySceneDelegate.swift");
const iosInfo = read("ios/Wireline/Info.plist");
const iosWidgetInfo = read("ios/WirelineWidgets/Info.plist");
const iosAssistantWidget = read("ios/WirelineWidgets/AssistantWidget.swift");
const androidAssistantWidget = read(
  "android/app/src/main/java/com/wireline/app/widget/AssistantWidgetProvider.kt",
);
const chatgptWidget = read("src/lib/chatgpt-mcp.ts");
const chatgptAccountWidget = read("src/lib/chatgpt-mcp-account.ts");
const legalCss = read("public/static-legal.css");
const manifest = read("public/site.webmanifest");
const publicIcon = read("public/wireline-icon.svg");
const favicon = read("public/favicon.svg");
const ogImage = read("public/og-image.svg");
const extensionIcon = read("apps/browser-extension/assets/icon.svg");
const androidLauncherBg = read("android/app/src/main/res/drawable/ic_launcher_background.xml");

mustInclude(
  "package.json",
  packageJson,
  /"design:check"\s*:\s*"node scripts\/check-wireline-clear-system\.mjs"/,
  "design:check must run this file",
);
mustExclude(
  "package.json",
  packageJson,
  /stripe:sync-secrets|sync-stripe-secrets-to-vercel/,
  "package scripts must not expose the retired Stripe secret sync helper",
);
mustInclude(
  "design-tokens/wireline.tokens.json",
  tokenSource,
  /"\$description"\s*:\s*"Wireline Mono design tokens/,
  "token source must describe Wireline Mono",
);
mustInclude(
  "design-tokens/wireline.tokens.json",
  tokenSource,
  /"default"\s*:\s*\{\s*"\$type"\s*:\s*"color",\s*"\$value"\s*:\s*"#111111"\s*\}/,
  "token source primary action must be #111111",
);
mustExclude(
  "design-tokens/wireline.tokens.json",
  tokenSource,
  oldPalette,
  "token source must not contain old purple/blue palette",
);
mustInclude(
  "src/styles/foundation.css",
  foundationCss,
  /color-scheme:\s*light/,
  "use one light scheme until a complete theme setting exists",
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
  /Wireline Clear System \/ Wireline Mono/,
  "name the current monochrome system",
);
mustInclude(
  "src/styles/tokens.generated.css",
  webTokens,
  /--wireline-color-action-primary-default:\s*#111111/,
  "web tokens must use Wireline Mono",
);
mustInclude(
  "apps/browser-extension/panel/tokens.generated.css",
  browserTokens,
  /--wireline-color-action-primary-default:\s*#111111/,
  "browser tokens must use Wireline Mono",
);
mustInclude(
  "apps/browser-extension/manifest.base.json",
  extensionManifest,
  /"name": "Wireline Command"/,
  "browser extension must be positioned as Wireline Command",
);
mustInclude(
  "apps/browser-extension/background/service-worker.js",
  extensionWorker,
  /action === "call"/,
  "extension must support call commands from browser context",
);
mustInclude(
  "apps/browser-extension/background/service-worker.js",
  extensionWorker,
  /action === "text"/,
  "extension must support text commands from browser context",
);
mustInclude(
  "apps/browser-extension/scripts/build.mjs",
  extensionBuild,
  /hostPermissions\.length/,
  "extension policy must keep persistent host permissions out",
);
mustInclude(
  "apps/browser-extension/panel/index.html",
  extensionPanel,
  /Call[\s\S]*Text[\s\S]*Follow-up[\s\S]*Agent task/,
  "extension panel must expose quick command actions",
);
mustInclude(
  "apps/browser-extension/panel/index.html",
  extensionPanel,
  /Agents[\s\S]*(Wire|Integrations)[\s\S]*Usage[\s\S]*Studio/,
  "extension panel must expose Agents, Wire or Integrations, Usage, and Studio jumps",
);
mustInclude(
  "apps/browser-extension/panel/panel.js",
  extensionPanelJs,
  /actionPrompts[\s\S]*call[\s\S]*text[\s\S]*followup/,
  "extension panel must wire quick commands",
);
mustInclude(
  "apps/browser-extension/panel/panel.js",
  extensionPanelJs,
  /open-studio/,
  "extension panel must wire the Studio jump",
);
mustInclude(
  "apps/browser-extension/panel/command.css",
  extensionCommandCss,
  /\.quick-actions/,
  "extension quick actions must have dedicated styling",
);
mustInclude(
  "apps/browser-extension/README.md",
  extensionReadme,
  /# Wireline Command/,
  "extension docs must use Wireline Command naming",
);
mustInclude(
  "docs/README.md",
  docsReadme,
  /Create -> Train -> Run/,
  "docs index must describe the Create -> Train -> Run model",
);
mustInclude(
  "src/constants/generated-design-tokens.ts",
  tokenConstants,
  /"color\.action\.primary\.default": "#111111"/,
  "TS tokens must use Wireline Mono",
);
mustInclude(
  "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
  androidTokens,
  /colorActionPrimaryDefault = Color\(0xFF111111\)/,
  "Android tokens must use Wireline Mono",
);
mustInclude(
  "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
  androidApp,
  /object Assistants : Screen\("assistants", "Agents"\)/,
  "Android app tab model must use Agents",
);
mustInclude(
  "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
  androidApp,
  /object Knowledge : Screen\("knowledge", "Train"\)/,
  "Android app tab model must use Train",
);
mustInclude(
  "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
  androidApp,
  /object Actions : Screen\("actions", "Wire"\)/,
  "Android app tab model must use Wire",
);
mustInclude(
  "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
  androidApp,
  /Agents for calls,\s*texts,\s*and\s*follow-up/,
  "Android sign-in must use agent-forward product copy",
);
mustInclude(
  "android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt",
  androidSetup,
  /title = \{ Text\("Training"/,
  "Android setup page must be Training",
);
mustInclude(
  "android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt",
  androidSetup,
  /title = \{ Text\("Wire"/,
  "Android actions page must be Wire",
);
mustInclude(
  "android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt",
  androidSetup,
  /WAYS YOUR AGENT CAN HELP/,
  "Android Wire screen must use agent language",
);
mustInclude(
  "ios/Wireline/Theme/WirelineDesignTokens.generated.swift",
  iosTokens,
  /colorActionPrimaryDefault = Color\(hex: 0x111111\)/,
  "iOS tokens must use Wireline Mono",
);
mustInclude(
  "ios/WirelineShared/WirelineWidgetSnapshot.swift",
  iosWidget,
  /public static let accent = "111111"/,
  "iOS widget snapshot must use Wireline Mono",
);
mustInclude(
  "ios/Wireline/Views/RootTabView.swift",
  iosRootTabs,
  /Label\("Agents", systemImage: "person\.2"\)/,
  "iOS tab bar must use Agents",
);
mustInclude(
  "ios/Wireline/Views/RootTabView.swift",
  iosRootTabs,
  /Label\("Train", systemImage: "book\.closed"\)/,
  "iOS tab bar must use Train",
);
mustInclude(
  "ios/Wireline/Views/RootTabView.swift",
  iosRootTabs,
  /Label\("Wire", systemImage: "bolt"\)/,
  "iOS tab bar must use Wire",
);
mustInclude(
  "ios/Wireline/Views/WorkspaceView.swift",
  iosWorkspace,
  /Metric\(title: "Agents"/,
  "iOS workspace must show Agents metric",
);
mustInclude(
  "ios/Wireline/Views/AssistantLibraryView.swift",
  iosAgentLibrary,
  /navigationTitle\("Agents"\)/,
  "iOS agent library title must be Agents",
);
mustInclude(
  "ios/Wireline/Views/AssistantSetupViews.swift",
  iosTrainingWire,
  /navigationTitle\("Training"\)/,
  "iOS setup page must be Training",
);
mustInclude(
  "ios/Wireline/Views/AssistantSetupViews.swift",
  iosTrainingWire,
  /navigationTitle\("Wire"\)/,
  "iOS actions page must be Wire",
);
mustInclude(
  "ios/Wireline/CarPlay/CarPlaySceneDelegate.swift",
  iosCarPlay,
  /titleVariants: \["Agents", "Choose a line"\]/,
  "CarPlay must expose agent lines as Agents",
);
mustInclude(
  "ios/Wireline/CarPlay/CarPlaySceneDelegate.swift",
  iosCarPlay,
  /CPListTemplate\(title: "Agents"/,
  "CarPlay agent list title must be Agents",
);
mustInclude(
  "src/lib/chatgpt-mcp.ts",
  chatgptWidget,
  /button\.primary \{ background: #111111; color: white; border-color: #111111; \}/,
  "ChatGPT public widget must use monochrome chrome",
);
mustInclude(
  "src/lib/chatgpt-mcp-account.ts",
  chatgptAccountWidget,
  /button\.primary \{ background: #111111; color: white; border-color: #111111; \}/,
  "ChatGPT account widget must use monochrome chrome",
);
mustInclude(
  "public/static-legal.css",
  legalCss,
  /--wireline-color-action-primary-default: #111111/,
  "static legal pages must use Wireline Mono tokens",
);
mustInclude(
  "public/site.webmanifest",
  manifest,
  /"theme_color": "#111111"/,
  "manifest must use monochrome theme color",
);
mustInclude(
  "public/site.webmanifest",
  manifest,
  /"background_color": "#F7F7F4"/,
  "manifest must use warm monochrome background",
);
mustInclude(
  "public/wireline-icon.svg",
  publicIcon,
  /fill="#111111"/,
  "public app icon must be monochrome",
);
mustInclude("public/favicon.svg", favicon, /fill="#111111"/, "favicon must be monochrome");
mustInclude(
  "public/og-image.svg",
  ogImage,
  /fill="#F7F7F4"/,
  "OG image must use monochrome canvas",
);
mustInclude(
  "apps/browser-extension/assets/icon.svg",
  extensionIcon,
  /fill="#111111"/,
  "browser extension icon must be monochrome",
);
mustInclude(
  "android/app/src/main/res/drawable/ic_launcher_background.xml",
  androidLauncherBg,
  /android:fillColor="#111111"/,
  "Android launcher background must be monochrome",
);
mustInclude(
  "src/components/MobileBrowserUtilities.tsx",
  mobileBrowserUtilities,
  /Billing[\s\S]*Usage \+ balance/,
  "mobile browser must expose billing and usage controls",
);
mustInclude(
  "src/components/MobileBrowserUtilities.tsx",
  mobileBrowserUtilities,
  /Integrations[\s\S]*Connected tools/,
  "mobile browser must expose integrations",
);
mustInclude(
  "src/components/WorkspaceShell.tsx",
  workspaceShell,
  /!nativeAppShell \? <MobileBrowserUtilities \/>/,
  "mobile browser utility control must mount outside native shells",
);
mustInclude(
  "src/pages/AgentsPage.tsx",
  agentsPage,
  /Configure number/,
  "agent roster must expose line/number configuration",
);
mustInclude("src/pages/AgentsPage.tsx", agentsPage, /Usage/, "agent roster must link to usage");
mustInclude(
  "src/pages/OverviewPage.tsx",
  overviewPage,
  /Training/,
  "overview shortcuts must use Training naming",
);
mustInclude(
  "src/pages/OverviewPage.tsx",
  overviewPage,
  /Wire/,
  "overview shortcuts must use Wire naming",
);
mustInclude("src/pages/ActionsPage.tsx", actionsPage, /Wire/, "Wire route must use current naming");
mustInclude(
  "src/pages/Pricing.tsx",
  pricingPage,
  /Conversation Balance/,
  "pricing must position Conversation Balance",
);
mustInclude(
  "src/pages/Pricing.tsx",
  pricingPage,
  /Wireline Team/,
  "pricing must position Wireline Team",
);
mustInclude(
  "src/pages/Pricing.tsx",
  pricingPage,
  /Wireline Business/,
  "pricing must position Wireline Business",
);
mustInclude(
  "src/pages/Pricing.tsx",
  pricingPage,
  /Wireline Enterprise/,
  "pricing must position Wireline Enterprise",
);
mustInclude(
  "src/pages/Developers.tsx",
  developersPage,
  /Programmatic agents/,
  "developer surface must position agents, not assistants",
);
mustExclude(
  "src/pages/Developers.tsx",
  developersPage,
  /\bassistant(s)?\b/i,
  "developer surface must use agent language",
);
mustInclude(
  "src/pages/SettingsPage.tsx",
  settingsPage,
  /Account deletion/,
  "settings must expose account deletion",
);
mustInclude(
  "src/routes/account-routes.ts",
  accountRoutes,
  /\/api\/account\/delete/,
  "account deletion route must exist",
);
mustExclude(
  "src/components/AssistantComposer.tsx",
  assistantComposer,
  /Ask your assistant/i,
  "shared composer must use agent copy",
);
mustExclude(
  "src/components/marketing/TrustSignals.tsx",
  trustSignals,
  /demo assistants/i,
  "trust strip must use agent language",
);
mustExclude(
  "src/components/migration/ZipLanding.tsx",
  zipLanding,
  /personal assistant|operating system for assistants/i,
  "Zip landing must use current agent language",
);
mustInclude(
  "src/components/marketing/PrecisionLanding.tsx",
  precisionLanding,
  /Agents for every conversation\./,
  "landing hero must frame agents across inbound and outbound conversations",
);
mustInclude(
  "src/components/marketing/PrecisionLanding.tsx",
  precisionLanding,
  /Calls, texts, follow-up\. Handled\./,
  "landing hero must keep the short punchy subhero",
);
mustExclude(
  "src/components/marketing/PrecisionLanding.tsx",
  precisionLanding,
  /Agents that answer calls, texts, and follow-up|Your best front desk|Create a short agent brief|Train it on your sources|Run live work from Studio/i,
  "landing hero subcopy must stay short and enticing",
);
mustInclude(
  "src/components/ui/SignalOrbFrame.tsx",
  signalOrbFrame,
  /SignalFrameRail/,
  "active loading and empty states must use the minimal monochrome signal frame",
);
mustExclude(
  "src/components/ui/SignalOrbFrame.tsx",
  signalOrbFrame,
  /AssistantConstellation|wireline-signal-design|wl-Assistants-constellation/,
  "signal frame must not revive retired assistant constellation chrome",
);
mustExclude(
  "src/components/fleet-settings/AgentConfigPanel.tsx",
  agentConfigPanel,
  /wl-Assistants-config-drawer/,
  "agent config drawer class hooks must use current agent naming",
);
mustExclude(
  "src/lib/wireline-ops-design.ts",
  wirelineOpsDesign,
  /wl-Assistants-agent|wl-help-assistant-card/,
  "ops design class hooks must use current agent naming",
);
mustInclude(
  "src/data/wireline-knowledge.ts",
  wirelineKnowledge,
  /Conversation Balance/,
  "shared product knowledge must include Conversation Balance",
);
mustInclude(
  "src/data/wireline-knowledge.ts",
  wirelineKnowledge,
  /Wireline Personal[\s\S]*Wireline Team[\s\S]*Wireline Business[\s\S]*Wireline Enterprise/,
  "shared product knowledge must match the launch catalog",
);
mustExclude(
  "src/data/wireline-knowledge.ts",
  wirelineKnowledge,
  /Legacy Wireline|Wireline Plus|one Assistants|Assistants analytics/,
  "shared product knowledge must purge legacy catalog and assistant copy",
);
mustExclude(
  "src/data/vertical-wedges.ts",
  verticalWedges,
  /Start 14-day free trial|14-day free trial|Free trial|Everyday tier|\$7\/mo|\$9\/mo|Account Holder|personal AI voice assistant/i,
  "vertical wedges must not revive retired trial or pricing copy",
);
mustExclude(
  "src/lib/founder-fleet-seed.ts",
  founderSeed,
  /Wireline plans start at \$7|Everyday|Account Holders|Assistants strategy|founder-Assistants-seed/i,
  "founder seed must not insert retired pricing or assistant strategy copy",
);
mustExclude(
  "src/lib/wireline-agent-personas.ts",
  wirelinePersonas,
  /Everyday:|Plus:\s+\$|Studio:\s+\$|Account Holder:|first working assistant|my assistant/i,
  "demo-line personas must quote current agent and pricing language",
);
mustInclude(
  "src/components/StripeBillingCard.tsx",
  stripeBillingCard,
  /CONVERSATION_BALANCE_COPY/,
  "billing screen must expose Conversation Balance activation",
);
mustInclude(
  "src/components/TrialGateModal.tsx",
  trialGateModal,
  /\/api\/conversation-balance\/checkout/,
  "trial gate must offer Personal Conversation Balance activation",
);
mustInclude(
  "src/db/schema.ts",
  dbSchema,
  /entryKind:\s*text\("entry_kind"/,
  "Conversation Balance ledger must store entry kind",
);
mustInclude(
  "src/db/schema.ts",
  dbSchema,
  /idempotencyKey:\s*text\("idempotency_key"/,
  "Conversation Balance ledger must store provider-neutral idempotency keys",
);
mustInclude(
  "src/db/schema.ts",
  dbSchema,
  /providerEventId:\s*text\("provider_event_id"/,
  "Conversation Balance ledger must store provider event ids",
);
mustInclude(
  "src/db/schema.ts",
  dbSchema,
  /customerReason:\s*text\("customer_reason"/,
  "Conversation Balance ledger must store customer-visible reasons",
);
mustInclude(
  "src/db/schema.ts",
  dbSchema,
  /metadata:\s*jsonb\("metadata"\)/,
  "Conversation Balance ledger must store sanitized metadata",
);
mustInclude(
  "src/lib/credit-wallet.ts",
  creditWallet,
  /entryKind\?:\s*"top_up" \| "burn" \| "refund" \| "adjustment" \| "grant" \| "reversal"/,
  "credit wallet references must classify ledger movement kinds",
);
mustInclude(
  "src/lib/credit-wallet.ts",
  creditWallet,
  /idempotencyKey:\s*ref\?\.idempotencyKey/,
  "credit wallet must write idempotency keys",
);
mustInclude(
  "src/lib/credit-wallet.ts",
  creditWallet,
  /customerReason:\s*"Voice overage covered by Conversation Balance"/,
  "voice burns must have a customer-visible Conversation Balance reason",
);
mustInclude(
  "src/routes/billing-routes.ts",
  billingRoutes,
  /entryKind:\s*"top_up"[\s\S]*customerReason:\s*"Conversation Balance top-up"/,
  "Stripe top-up webhook must write durable Conversation Balance metadata",
);
mustInclude(
  "src/routes/billing-routes.ts",
  billingRoutes,
  /entryKind:\s*"refund"[\s\S]*customerReason:\s*"Conversation Balance refund"/,
  "Stripe refund webhook must write durable Conversation Balance metadata",
);
mustInclude(
  "src/routes/billing-routes.ts",
  billingRoutes,
  /entryKind:\s*"reversal"[\s\S]*customerReason:\s*"Conversation Balance dispute reversal"/,
  "Stripe dispute webhook must write durable Conversation Balance metadata",
);
mustInclude(
  "drizzle/migrations/0074_harden_conversation_balance_ledger.sql",
  balanceMigration,
  /CREATE UNIQUE INDEX IF NOT EXISTS wireline_credit_ledger_idempotency_key/,
  "ledger migration must enforce idempotent Conversation Balance entries",
);
mustInclude(
  "drizzle/migrations/0074_harden_conversation_balance_ledger.sql",
  balanceMigration,
  /metadata JSONB NOT NULL DEFAULT '\{\}'::jsonb/,
  "ledger migration must add sanitized metadata storage",
);
mustExclude(
  "scripts/capture-prod-visual-qa.mjs",
  prodVisualQa,
  /create-assistant|knowledge-base|Create assistant|Knowledge Base|standard business subscription starts at \$49/i,
  "production visual QA harness must use Create Agent and Training language",
);
mustExclude(
  "ios/Wireline/Info.plist",
  iosInfo,
  /Wireline Assistant|assistants/i,
  "iOS visible permission copy must use Wireline and agents",
);
mustExclude(
  "ios/WirelineWidgets/Info.plist",
  iosWidgetInfo,
  /Wireline Assistant/i,
  "iOS widget display name must be Wireline",
);
mustExclude(
  "ios/WirelineWidgets/AssistantWidget.swift",
  iosAssistantWidget,
  /Assistant Coverage|Text\("Assistant"\)|Wireline Precision/i,
  "iOS widget visible copy must use agent language",
);
mustExclude(
  "android/app/src/main/java/com/wireline/app/widget/AssistantWidgetProvider.kt",
  androidAssistantWidget,
  /Wireline Assistants/,
  "Android widget visible copy must use agent language",
);
for (const [file, source] of [
  ["src/styles/tokens.generated.css", webTokens],
  ["apps/browser-extension/panel/tokens.generated.css", browserTokens],
  ["apps/browser-extension/manifest.base.json", extensionManifest],
  ["apps/browser-extension/background/service-worker.js", extensionWorker],
  ["apps/browser-extension/panel/index.html", extensionPanel],
  ["apps/browser-extension/panel/panel.js", extensionPanelJs],
  ["apps/browser-extension/panel/command.css", extensionCommandCss],
  ["src/constants/generated-design-tokens.ts", tokenConstants],
  ["android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt", androidTokens],
  ["android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt", androidApp],
  ["android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt", androidSetup],
  ["ios/Wireline/Theme/WirelineDesignTokens.generated.swift", iosTokens],
  ["ios/WirelineShared/WirelineWidgetSnapshot.swift", iosWidget],
  ["ios/Wireline/Views/RootTabView.swift", iosRootTabs],
  ["ios/Wireline/Views/WorkspaceView.swift", iosWorkspace],
  ["ios/Wireline/Views/AssistantLibraryView.swift", iosAgentLibrary],
  ["ios/Wireline/Views/AssistantSetupViews.swift", iosTrainingWire],
  ["ios/Wireline/CarPlay/CarPlaySceneDelegate.swift", iosCarPlay],
  ["src/components/MobileBrowserUtilities.tsx", mobileBrowserUtilities],
  ["src/pages/AgentsPage.tsx", agentsPage],
  ["src/pages/SettingsPage.tsx", settingsPage],
  ["src/pages/Developers.tsx", developersPage],
  ["src/components/KnowledgeWorkspace.tsx", knowledgeWorkspace],
  ["src/components/AssistantComposer.tsx", assistantComposer],
  ["src/components/marketing/BrowserCallWidget.tsx", browserCallWidget],
  ["src/components/marketing/TrustSignals.tsx", trustSignals],
  ["src/components/migration/ZipLanding.tsx", zipLanding],
  ["src/data/wireline-knowledge.ts", wirelineKnowledge],
  ["src/lib/chatgpt-mcp.ts", chatgptWidget],
  ["src/lib/chatgpt-mcp-account.ts", chatgptAccountWidget],
  ["public/static-legal.css", legalCss],
  ["public/site.webmanifest", manifest],
  ["public/wireline-icon.svg", publicIcon],
  ["public/favicon.svg", favicon],
  ["public/og-image.svg", ogImage],
  ["apps/browser-extension/assets/icon.svg", extensionIcon],
  ["android/app/src/main/res/drawable/ic_launcher_background.xml", androidLauncherBg],
]) {
  mustExclude(
    file,
    source,
    oldPalette,
    "old purple/blue palette must not appear in active design surfaces",
  );
}
mustExclude(
  "src/styles/studio-operations.css",
  studioOperationsCss,
  /#0a0c12|#0d1017|#12151d|#191e2a|#f7f8fc|#91a8ff/i,
  "Studio must not define a separate dark theme",
);
mustExclude(
  "src/components/WorkspaceShell.tsx",
  workspaceShell,
  /wl-workspace-shell--studio|studioParams|isStudioOperationsRoute/,
  "shell must not switch theme by Studio route state",
);
mustInclude(
  "src/components/WorkspaceShell.tsx",
  workspaceShell,
  /label: "Train"/,
  "primary rail must include Training",
);
mustInclude(
  "src/components/WorkspaceShell.tsx",
  workspaceShell,
  /function isNativeAppShell/,
  "bottom dock must be gated by native app shell detection",
);
mustInclude(
  "src/components/WorkspaceShell.tsx",
  workspaceShell,
  /nativeAppShell \? <NativeDock/,
  "bottom dock must only render for native app shells",
);
mustInclude(
  "src/components/StudioOverview.tsx",
  studioOverview,
  /grid grid-cols-1 gap-2[\s\S]*sm:flex sm:overflow-x-auto/,
  "mobile Studio agent list must stack before desktop carousel behavior",
);
mustInclude(
  "src/routes/AppRoutes.tsx",
  appRoutes,
  /path="\/training" element=\{<KnowledgePage/,
  "Training must be first-class route",
);
mustInclude(
  "src/routes/AppRoutes.tsx",
  appRoutes,
  /path="\/knowledge" element=\{<Navigate to="\/training"/,
  "Knowledge must redirect to Training",
);
mustInclude(
  "src/components/CreateAgentDialog.tsx",
  createDialog,
  /Name, voice, personality, role/,
  "create flow must remain a short intake",
);
mustInclude(
  "src/components/CreateAgentDialog.tsx",
  createDialog,
  /navigate\(`\/training\?agent=/,
  "create flow must land in Training",
);
mustInclude(
  "src/components/StudioWorkspaceV2.tsx",
  studioWorkspace,
  /StudioWorkroom/,
  "Studio must use chat-first workroom",
);
mustExclude(
  "src/components/StudioWorkspaceV2.tsx",
  studioWorkspace,
  /StudioAssistantWorkspace/,
  "old Studio assistant rail must not be active",
);
mustExclude(
  "src/components/StudioWorkroom.tsx",
  studioWorkroom,
  /PanelRightOpen|Working context|Detailed view/,
  "Workroom must not have a right context rail",
);
mustInclude(
  "src/pages/KnowledgePage.tsx",
  trainingPage,
  /TrainingRail/,
  "Training must own heavy controls in a side rail",
);
mustInclude(
  "src/pages/KnowledgePage.tsx",
  trainingPage,
  /AgentAssetUpload/,
  "Training must own document ingestion",
);
mustInclude(
  "src/components/AgentAssetUpload.tsx",
  assetUpload,
  /\/api\/agent-config\/\$\{encodeURIComponent\(agentId\)\}\/assets/,
  "document intake must use asset ingestion API",
);
mustBeDeleted(
  "src/components/StudioAssistantWorkspace.tsx",
  "dead legacy Studio rail must stay deleted",
);
mustBeDeleted(
  "src/components/ui/NebulaPulse.tsx",
  "unused nebula visual primitive must stay deleted",
);
mustBeDeleted(
  "src/components/ui/AssistantConstellation.tsx",
  "unused assistant constellation visual primitive must stay deleted",
);
mustBeDeleted(
  "src/components/ui/ConstellationField.tsx",
  "unused constellation field visual primitive must stay deleted",
);
mustBeDeleted(
  "src/lib/wireline-signal-design.ts",
  "retired signal class bridge must stay deleted",
);
mustBeDeleted(
  "scripts/sync-stripe-secrets-to-vercel.mjs",
  "retired Stripe secret sync helper must stay deleted",
);
mustBeDeleted(
  "scripts/check-active-surface-drift.mjs",
  "retired Ametrine surface contract must stay deleted",
);

if (failures.length) {
  console.error(`Wireline Clear System check failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Wireline Clear System check passed");
}
