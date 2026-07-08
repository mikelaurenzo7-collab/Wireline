import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertStudioCanvasContract } from "./lib/studio-canvas-contract.mjs";

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
const indexHtml = read("index.html");
const appRoot = read("src/App.tsx");
const appRoutes = read("src/routes/AppRoutes.tsx");
const tokenSource = read("design-tokens/wireline.tokens.json");
const foundationCss = read("src/styles/foundation.css");
const designSystemCss = read("src/styles/design-system.css");
const claritySystemCss = read("src/styles/clarity-system.css");
const studioOperationsCss = read("src/styles/studio-operations.css");
const workspaceShell = read("src/components/WorkspaceShell.tsx");
const marketingPageFrame = read("src/components/layout/MarketingPageFrame.tsx");
const mobileBrowserUtilities = read("src/components/MobileBrowserUtilities.tsx");
const letterpressPolish = read("src/styles/letterpress-polish.css");
const indexCss = read("src/index.css");
const designVisionSource = read("src/lib/wireline-design-vision.ts");
const agentsPage = read("src/pages/AgentsPage.tsx");
const overviewPage = read("src/pages/OverviewPage.tsx");
// ActionsPage retired with the outbound dialer; Wire/Connections lives under
// /connections now and is exercised by other contracts below.
const pricingPage = read("src/pages/Pricing.tsx");
const featuresPage = read("src/pages/Features.tsx");
const aboutPage = read("src/pages/About.tsx");
const comparePage = read("src/pages/Compare.tsx");
const blogPage = read("src/pages/Blog.tsx");
const showcasePage = read("src/pages/Showcase.tsx");
const solutionsPage = read("src/pages/SolutionsPage.tsx");
const verticalLandingPage = read("src/pages/VerticalLanding.tsx");
const landingPage = read("src/pages/LandingPage.tsx");
const developersPage = read("src/pages/Developers.tsx");
const authPortal = read("src/components/AuthPortal.tsx");
const authRedirect = read("src/lib/auth-redirect.ts");
const onboardingFlow = read("src/pages/OnboardingFlow.tsx");
const settingsPage = read("src/pages/SettingsPage.tsx");
const billingSettingsPage = read("src/pages/BillingSettings.tsx");
const accountRoutes = read("src/routes/account-routes.ts");
const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
const studioAgentCanvas = read("src/components/StudioAgentCanvas.tsx");
const studioAgentWorkspacePanel = read("src/components/StudioAgentWorkspacePanel.tsx");
const studioOverview = read("src/components/StudioOverview.tsx");
const createDialog = read("src/components/CreateAgentDialog.tsx");
const studioWorkroom = read("src/components/StudioWorkroom.tsx");
const agentStudioHome = read("src/pages/AgentStudioHomeClaude.tsx");
// Legacy Training IA (AgentTraining / AgentMemoryPanel / AgentAssetUpload /
// KnowledgeWorkspace) was retired with the Claude Design Knowledge tab.
// The new Knowledge surface is built into KnowledgeBaseClaude.tsx.
const agentConfigPanel = read("src/components/fleet-settings/AgentConfigPanel.tsx");
const trainingPage = read("src/pages/KnowledgePage.tsx");
const knowledgeBase = read("src/components/KnowledgeBaseClaude.tsx");
const assistantComposer = read("src/components/AssistantComposer.tsx");
const browserCallWidget = read("src/components/marketing/BrowserCallWidget.tsx");
const trustSignals = read("src/components/marketing/TrustSignals.tsx");
const precisionLanding = read("src/components/marketing/PrecisionLanding.tsx");
const signalOrbFrame = read("src/components/ui/SignalOrbFrame.tsx");
const wirelineKnowledge = read("src/data/wireline-knowledge.ts");
const pageMeta = read("src/lib/page-meta.tsx");
const wirelineOpsDesign = read("src/lib/wireline-ops-design.ts");
const verticalWedges = read("src/data/vertical-wedges.ts");
const founderSeed = read("src/lib/founder-fleet-seed.ts");
const wirelinePersonas = read("src/lib/wireline-agent-personas.ts");
const stripeBillingCard = read("src/components/StripeBillingCard.tsx");
const conversationBalanceCard = read("src/components/ConversationBalanceCard.tsx");
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
const productCopy = read("src/lib/product-copy.ts");
const designVision = read("src/lib/wireline-design-vision.ts");
const studioAgentPreference = read("src/lib/studio-agent-preference.ts");
const studioActiveAgentHook = read("src/hooks/useStudioActiveAgentId.ts");
const authContext = read("src/contexts/AuthContext.tsx");
const wirelineDesignSystem = read("src/lib/wireline-design-system.ts");
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
  /"\$description"\s*:\s*"Wireline dark design tokens/,
  "token source must describe the Wireline dark system",
);
mustInclude(
  "design-tokens/wireline.tokens.json",
  tokenSource,
  /"default"\s*:\s*\{\s*"\$type"\s*:\s*"color",\s*"\$value"\s*:\s*"#A78BFA"\s*\}/,
  "token source primary action must be the Aurora electric violet #A78BFA",
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
mustExclude(
  "src/styles/clarity-system.css",
  claritySystemCss,
  /left-aligned reading rail/,
  "clarity system must not describe the retired left-aligned marketing rail",
);
mustInclude(
  "src/components/layout/MarketingPageFrame.tsx",
  marketingPageFrame,
  /scroll \? "grow" : "min-h-0 flex-1"/,
  "scroll marketing pages must grow with content before the footer renders",
);
mustExclude(
  "src/components/layout/MarketingPageFrame.tsx",
  marketingPageFrame,
  /"relative z-10 min-h-0 flex-1"/,
  "scroll marketing pages must not constrain content under the footer",
);
mustInclude(
  "src/styles/tokens.generated.css",
  webTokens,
  /--wireline-color-action-primary-default:\s*#A78BFA/,
  "web tokens must carry the Aurora violet token",
);
mustInclude(
  "apps/browser-extension/panel/tokens.generated.css",
  browserTokens,
  /--wireline-color-action-primary-default:\s*#A78BFA/,
  "browser tokens must carry the Aurora violet token",
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
  /"color\.action\.primary\.default": "#A78BFA"/,
  "TS tokens must carry the Aurora violet token",
);
mustInclude(
  "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
  androidTokens,
  /colorActionPrimaryDefault = Color\(0xFFA78BFA\)/,
  "Android tokens must carry the Aurora violet token",
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
  /Wire your agent\./,
  "Android sign-in must use the Letterpress landing promise",
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
  /colorActionPrimaryDefault = Color\(hex: 0xA78BFA\)/,
  "iOS tokens must carry the Aurora violet token",
);
mustInclude(
  "ios/WirelineShared/WirelineWidgetSnapshot.swift",
  iosWidget,
  /public static let accent = "A78BFA"/,
  "iOS widget snapshot must carry the Aurora violet token",
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
const mcpWidgetStyles = read("src/lib/wireline-mcp-widget-styles.ts");
mustInclude(
  "src/lib/wireline-mcp-widget-styles.ts",
  mcpWidgetStyles,
  /canvas: "#0A0A0E"/,
  "MCP widget styles must use the Wireline dark canvas",
);
mustInclude(
  "src/lib/wireline-mcp-widget-styles.ts",
  mcpWidgetStyles,
  /action: "#A78BFA"/,
  "MCP widget styles must use the Wireline dark action chrome",
);
mustInclude(
  "src/lib/chatgpt-mcp.ts",
  chatgptWidget,
  /buildWirelineMcpWidgetCss/,
  "ChatGPT public widget must use shared Letterpress chrome",
);
mustInclude(
  "src/lib/chatgpt-mcp-account.ts",
  chatgptAccountWidget,
  /buildWirelineMcpWidgetCss/,
  "ChatGPT account widget must use shared Letterpress chrome",
);
mustInclude(
  "public/static-legal.css",
  legalCss,
  /--wireline-color-action-primary-default: #A78BFA/,
  "static legal pages must use the Wireline dark tokens",
);
mustInclude(
  "public/site.webmanifest",
  manifest,
  /"theme_color": "#0A0A0E"/,
  "manifest must use the dark theme color",
);
mustInclude(
  "public/site.webmanifest",
  manifest,
  /"background_color": "#0A0A0E"/,
  "manifest must use the dark canvas background",
);
mustInclude(
  "public/site.webmanifest",
  manifest,
  /"name": "Wireline - Wire your agent"/,
  "manifest name must match the current landing promise",
);
mustExclude(
  "public/site.webmanifest",
  manifest,
  /Agents that answer|Agents for calls, texts, and follow-up|finally answering for you/i,
  "manifest must not use retired answer-only positioning",
);
mustInclude(
  "public/wireline-icon.svg",
  publicIcon,
  /fill="#6D28D9"/,
  "public app icon must use the Aurora violet brand mark",
);
mustInclude(
  "public/favicon.svg",
  favicon,
  /fill="#6D28D9"/,
  "favicon must use the Aurora violet brand mark",
);
mustInclude("public/og-image.svg", ogImage, /fill="#0A0A0E"/, "OG image must use the dark canvas");
mustInclude(
  "public/og-image.svg",
  ogImage,
  /WIRE YOUR[\s\S]*AGENT[\s\S]*Personal · sales · support · call centers/,
  "OG image must match the Letterpress landing promise",
);
mustExclude(
  "public/og-image.svg",
  ogImage,
  /ANSWERING NOW|picks up right now/i,
  "OG image must not use answer-only live-work copy",
);
mustInclude(
  "apps/browser-extension/assets/icon.svg",
  extensionIcon,
  /fill="#6D28D9"/,
  "browser extension icon must use the Aurora violet brand mark",
);
mustInclude(
  "android/app/src/main/res/drawable/ic_launcher_background.xml",
  androidLauncherBg,
  /android:fillColor="#6D28D9"/,
  "Android launcher background must use the Aurora violet brand mark",
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
assertStudioCanvasContract(
  {
    shell: workspaceShell,
    canvas: studioWorkspace,
    spatialCanvas: studioAgentCanvas,
    workroom: studioWorkroom,
    workspacePanel: studioAgentWorkspacePanel,
    studioHome: agentStudioHome,
    agentPreference: studioAgentPreference,
    activeAgentHook: studioActiveAgentHook,
    authContext,
    designVision,
    overviewPage,
    studioOverview,
  },
  { mustInclude, mustExclude },
);
mustInclude(
  "src/components/WorkspaceShell.tsx",
  workspaceShell,
  /Studio/,
  "rail must expose Studio icon",
);
mustInclude(
  "src/components/StudioAgentWorkspacePanel.tsx",
  studioAgentWorkspacePanel,
  /Workspace for|Memory/,
  "per-agent workspace holds memory and grouped sections",
);
// ActionsPage retired — Wire surface is /connections.
mustInclude("src/pages/Pricing.tsx", pricingPage, /Personal/, "pricing must position Personal");
mustInclude("src/pages/Pricing.tsx", pricingPage, /Team/, "pricing must position Team");
mustInclude("src/pages/Pricing.tsx", pricingPage, /Business/, "pricing must position Business");
mustInclude("src/pages/Pricing.tsx", pricingPage, /Enterprise/, "pricing must position Enterprise");
mustInclude(
  "src/pages/Pricing.tsx",
  pricingPage,
  /Conversation Balance/,
  "pricing must explain Conversation Balance",
);
mustInclude(
  "src/pages/Pricing.tsx",
  pricingPage,
  /STRIPE_PLANS/,
  "pricing must stay tied to the Stripe plan catalog",
);
for (const [file, source] of [
  ["src/pages/Features.tsx", featuresPage],
  ["src/pages/Pricing.tsx", pricingPage],
  ["src/pages/About.tsx", aboutPage],
  ["src/pages/Compare.tsx", comparePage],
  ["src/pages/Blog.tsx", blogPage],
  ["src/pages/Showcase.tsx", showcasePage],
  ["src/pages/SolutionsPage.tsx", solutionsPage],
  ["src/pages/VerticalLanding.tsx", verticalLandingPage],
]) {
  mustInclude(
    file,
    source,
    /text-center|wl-marketing-center/,
    "public marketing page must explicitly center hero or section copy",
  );
}
mustExclude(
  "src/pages/SolutionsPage.tsx",
  solutionsPage,
  /HeroCallPreview|Sarah/,
  "use-cases page must not render the retired Sarah call preview",
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
  /Delete account|Account deletion/,
  "settings must expose account deletion",
);
mustInclude(
  "src/pages/BillingSettings.tsx",
  billingSettingsPage,
  /Conversation Balance/,
  "billing must expose conversation balance controls",
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
mustInclude(
  "src/components/marketing/PrecisionLanding.tsx",
  precisionLanding,
  /MARKETING_VOICE\.headline/,
  "landing hero must frame agents across inbound and outbound conversations",
);
mustInclude(
  "src/components/marketing/PrecisionLanding.tsx",
  precisionLanding,
  /MARKETING_VOICE\.subline/,
  "landing hero must keep the short punchy subhero",
);
mustInclude(
  "src/lib/product-copy.ts",
  productCopy,
  /MARKETING_VOICE/,
  "marketing hero copy must live in product-copy module",
);
mustInclude(
  "src/components/marketing/PrecisionLanding.tsx",
  precisionLanding,
  /MARKETING_VOICE/,
  "landing must consume shared marketing voice constants",
);
mustInclude(
  "src/components/marketing/PrecisionLanding.tsx",
  precisionLanding,
  /STRIPE_PLANS/,
  "landing pricing must stay tied to the Stripe plan catalog",
);
mustInclude(
  "src/components/marketing/PrecisionLanding.tsx",
  precisionLanding,
  /Conversation Balance/,
  "landing pricing must explain Conversation Balance",
);
const signatureCss = read("src/styles/wireline-signature.css");
mustInclude(
  "src/styles/wireline-signature.css",
  signatureCss,
  /--wireline-color-action-secondary-default/,
  "the Wire signature must run on the silver token",
);
mustInclude(
  "src/styles/wireline-signature.css",
  signatureCss,
  /prefers-reduced-motion: reduce/,
  "the Wire pulse must respect reduced motion",
);
mustInclude(
  "src/components/marketing/PrecisionLanding.tsx",
  precisionLanding,
  /wl-eyebrow--wired/,
  "landing section eyebrows must carry the Wire",
);
mustInclude(
  "public/og-image.svg",
  ogImage,
  /C7CCD6/,
  "OG image must carry the silver wire signature",
);
mustInclude(
  "src/styles/wireline-signature.css",
  signatureCss,
  /\.wl-wire-step--settled/,
  "the setup steps must run silver-to-violet on the wire (Connect → Deploy)",
);
mustInclude(
  "src/components/marketing/PrecisionLanding.tsx",
  precisionLanding,
  /wl-wire-step__node/,
  "landing setup steps must be nodes on the wire",
);
mustInclude(
  "src/components/marketing/PrecisionLanding.tsx",
  precisionLanding,
  /wl-featured-wire/,
  "dark ink panels (recommended plan, closing CTA) must carry the wire",
);
mustInclude(
  "src/styles/wireline-signature.css",
  signatureCss,
  /\.wl-featured-wire--live::after[\s\S]*?animation: wl-wire-pulse/,
  "the closing CTA wire must carry the live traveling signal",
);
mustInclude(
  "src/styles/wireline-signature.css",
  signatureCss,
  /\.wl-mark-signal\s*\{\s*fill: var\(--wireline-color-action-secondary-default\)/,
  "the mark's central node must carry the silver signal on public surfaces",
);
mustExclude(
  "src/components/marketing/PrecisionLanding.tsx",
  precisionLanding,
  /Start 7-day trial|Start your 7-day trial|Try 7 days free|7-day free trial|7-day trial|No gimmick free plan|name:\s*"Starter"|name:\s*"Pro"|Everything in Starter|Everything in Pro|\$79/,
  "landing pricing must not revive retired trial or Starter/Pro catalog copy",
);
mustInclude(
  "src/styles/design-system.css",
  designSystemCss,
  /\.wl-composer-dock/,
  "design system must expose shared composer dock utility",
);
mustInclude(
  "src/styles/design-system.css",
  designSystemCss,
  /\.wl-panel-elevated/,
  "design system must expose elevated panel primitive",
);
mustInclude(
  "src/styles/design-system.css",
  designSystemCss,
  /\.wl-chip-suggestion/,
  "design system must expose composer suggestion chips",
);
mustInclude(
  "src/styles/foundation.css",
  foundationCss,
  /--wl-text-tertiary:\s*var\(--wireline-color-text-tertiary\)/,
  "foundation must map tertiary text to generated token",
);
mustInclude(
  "design-tokens/wireline.tokens.json",
  tokenSource,
  /"tertiary"/,
  "token source must define tertiary text role",
);
mustInclude(
  "src/lib/wireline-design-vision.ts",
  designVision,
  /WIRELINE_DESIGN_VISION/,
  "design vision manifest must exist",
);
mustInclude(
  "src/lib/wireline-design-system.ts",
  wirelineDesignSystem,
  /WL_VISION/,
  "design system module must re-export vision manifest",
);
mustInclude(
  "src/lib/product-copy.ts",
  productCopy,
  /WORKSPACE_VOICE/,
  "workspace voice must live in product-copy module",
);
mustInclude(
  "apps/browser-extension/panel/index.html",
  extensionPanel,
  /Command your agent from any page\. Wireline calls, answers, follows up, and logs the outcome while you stay focused\./,
  "extension hero must match shared marketing voice",
);
mustInclude(
  "src/lib/wireline-mcp-widget-styles.ts",
  read("src/lib/wireline-mcp-widget-styles.ts"),
  /tertiary/,
  "MCP widget styles must expose tertiary hint color",
);
mustInclude(
  "index.html",
  indexHtml,
  /Wireline — Wire your agent\./,
  "static metadata title must match the current landing promise",
);
mustInclude(
  "src/pages/LandingPage.tsx",
  landingPage,
  /Wireline \| Wire your agent/,
  "runtime landing metadata title must match the current landing promise",
);
mustInclude(
  "src/lib/page-meta.tsx",
  pageMeta,
  /Wireline - Wire your agent/,
  "default metadata title must match the current landing promise",
);
mustExclude(
  "src/components/marketing/PrecisionLanding.tsx",
  precisionLanding,
  /Agents that answer calls, texts, and follow-up|Your best front desk|Create a short agent brief|Train it on your sources|Run live work from Studio/i,
  "landing hero subcopy must stay short and enticing",
);
for (const [file, source] of [
  ["index.html", indexHtml],
  ["src/pages/LandingPage.tsx", landingPage],
  ["src/lib/page-meta.tsx", pageMeta],
  ["public/og-image.svg", ogImage],
]) {
  mustExclude(
    file,
    source,
    /Agents for calls, texts, and follow-up/i,
    "public title surfaces must use the current landing promise",
  );
}
mustInclude(
  "src/components/ui/SignalOrbFrame.tsx",
  signalOrbFrame,
  /SignalFrameRail/,
  "active loading and empty states must use the minimal signal frame",
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
mustExclude(
  "src/components/StripeBillingCard.tsx",
  stripeBillingCard,
  /Build and test for free/,
  "billing screen must not revive retired Build-first billing copy",
);
mustExclude(
  "src/components/ConversationBalanceCard.tsx",
  conversationBalanceCard,
  /Build and test for free/,
  "Conversation Balance card must not revive retired Build-first activation copy",
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
  ["src/components/KnowledgeBaseClaude.tsx", knowledgeBase],
  ["src/components/AssistantComposer.tsx", assistantComposer],
  ["src/components/marketing/BrowserCallWidget.tsx", browserCallWidget],
  ["src/components/marketing/TrustSignals.tsx", trustSignals],
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
  /MOBILE_PRIMARY_NAV|\/studio/,
  "shell must expose Studio via the canonical navigation module",
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
  /!nativeAppShell \?\s*<MobileBrowserUtilities/,
  "MobileBrowserUtilities must be gated by native app shell detection",
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
  /path="\/studio" element=\{<AgentStudioHome/,
  "Studio canvas must be the first-class authenticated route for agents and workspaces",
);
mustInclude(
  "src/routes/AppRoutes.tsx",
  appRoutes,
  /Navigate to="\/(overview|agents|call-logs|connections|knowledge)" replace/,
  "legacy routes redirect cleanly into the restored Claude Design IA",
);
mustInclude(
  "src/components/CreateAgentDialog.tsx",
  createDialog,
  /Fast Start|~3 minutes/,
  "create flow must use the Fast Start prompt (Claude Design)",
);
mustInclude(
  "src/components/CreateAgentDialog.tsx",
  createDialog,
  /\/studio\?agent=/,
  "create flow must hand cleanly into Studio canvas",
);
mustInclude(
  "src/components/AuthPortal.tsx",
  authPortal,
  /preferredPlanId:\s*nextMode === "business" \? "business" : "personal"/,
  "signup workspace choice must persist as preferred plan intent",
);
mustInclude(
  "src/lib/auth-redirect.ts",
  authRedirect,
  /workspaceMode === "business" \? "\/studio\?create=1&posture=business" : "\/studio\?create=1"/,
  "fresh signups must route directly into the real create dialog",
);
mustInclude(
  "src/pages/OnboardingFlow.tsx",
  onboardingFlow,
  /Opening your first agent/,
  "legacy onboarding route must hand directly into the create flow",
);
mustInclude(
  "src/pages/OnboardingFlow.tsx",
  onboardingFlow,
  /Continue now/,
  "onboarding handoff must offer a manual continue fallback",
);
mustExclude(
  "src/pages/OnboardingFlow.tsx",
  onboardingFlow,
  /Link your phone|Verify your number|Name your agent/,
  "legacy fake onboarding wizard must stay removed",
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
  "src/components/StudioWorkroom.tsx",
  studioWorkroom,
  /Direct the work\./,
  "Studio workroom must frame itself as the run surface",
);
// Tailored for clean vision: short positioning of channels/outcomes instead of verbose long phrase (polish removed verbose for minimalism)
mustInclude(
  "src/components/StudioWorkroom.tsx",
  studioWorkroom,
  /Recent outcomes \(ledger\)|Intelligence from outcomes|proposals/,
  "Studio workroom must expose outcome ledger and intelligence for extreme usefulness and flywheel MOAT",
);
mustExclude(
  "src/components/StudioWorkroom.tsx",
  studioWorkroom,
  /Train by talking\.|what to learn or do|PanelRightOpen|Working context|Detailed view/,
  "Studio workroom must stay clean/minimal: no right rail, no training-first copy",
);
// Claude Design Training (Knowledge / Voice / Flows / Simulator) — four tabs
// mounted directly in KnowledgePage; Knowledge tab is the spatial Claude
// Design surface bound to /api/agent-config.
mustInclude(
  "src/pages/KnowledgePage.tsx",
  trainingPage,
  /KnowledgeBaseClaude/,
  "Training Knowledge tab must mount the Claude Design Knowledge Base surface",
);
mustInclude(
  "src/pages/KnowledgePage.tsx",
  trainingPage,
  /id: "knowledge"[\s\S]*id: "voice"[\s\S]*id: "flows"[\s\S]*id: "simulator"/,
  "Training must expose Knowledge, Voice, Flows, and Simulator tabs",
);
mustInclude(
  "src/pages/KnowledgePage.tsx",
  trainingPage,
  /function FlowsTab[\s\S]*?\/studio\?agent=/,
  "Training Flows tab must hand off to the live Studio conversation editor",
);
mustInclude(
  "src/pages/KnowledgePage.tsx",
  trainingPage,
  /function SimulatorTab[\s\S]*?\/studio\?agent=[\s\S]*?\/phone\?tab=logs/,
  "Training Simulator tab must hand off to Studio test calls and Phone Call History",
);
mustExclude(
  "src/pages/KnowledgePage.tsx",
  trainingPage,
  /Greet & Disarm|Test response quality/,
  "fake Flow Composer stages and scenario library must stay retired",
);
mustInclude(
  "src/components/KnowledgeBaseClaude.tsx",
  knowledgeBase,
  /\/api\/agent-config\/\$\{encodeURIComponent\(agentId\)\}/,
  "Knowledge Base must bind to the honest agent-config record",
);
mustInclude(
  "src/components/KnowledgeBaseClaude.tsx",
  knowledgeBase,
  /\/api\/agent-config\/\$\{encodeURIComponent\(agentId\)\}\/assets/,
  "document intake must use asset ingestion API",
);
mustInclude(
  "src/components/KnowledgeBaseClaude.tsx",
  knowledgeBase,
  /Ingested knowledge/,
  "Knowledge surface must present the honest ingested-knowledge list",
);
mustInclude(
  "src/components/KnowledgeBaseClaude.tsx",
  knowledgeBase,
  /Drop files here or click to upload/,
  "Knowledge surface must own the Claude Design drop zone",
);
for (const [file, source] of [
  ["src/components/CreateAgentDialog.tsx", createDialog],
  ["src/components/StudioOverview.tsx", studioOverview],
  ["src/components/AuthPortal.tsx", authPortal],
  ["src/components/layout/AppShell.tsx", read("src/components/layout/AppShell.tsx")],
  ["src/pages/OverviewPage.tsx", overviewPage],
  ["src/pages/SettingsPage.tsx", settingsPage],
  ["src/pages/BillingSettings.tsx", billingSettingsPage],
  ["src/components/ConversationBalanceCard.tsx", conversationBalanceCard],
  ["src/components/StudioWorkroom.tsx", studioWorkroom],
]) {
  mustExclude(file, source, /Â|â|�/, "authenticated surfaces must not expose mojibake");
}
mustBeDeleted(
  "src/components/marketing/HeroCallPreview.tsx",
  "retired Sarah call preview must stay deleted",
);
mustBeDeleted(
  "docs/superpowers/plans/2026-06-24-visual-action-public-pages.md",
  "stale visual-action plan that references the retired call preview must stay deleted",
);
mustBeDeleted(
  "docs/superpowers/specs/2026-06-24-visual-action-public-pages.md",
  "stale visual-action spec that references the retired call preview must stay deleted",
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
  "src/components/migration/ZipLanding.tsx",
  "standalone redesign landing artifact used the wrong dark/blue palette and must stay deleted",
);
mustBeDeleted(
  "src/styles/zip-platform-tokens.css",
  "standalone redesign token shim must not override Wireline Letterpress",
);
mustBeDeleted(
  "src/styles/zip-landing.css",
  "standalone redesign landing CSS must not reintroduce the wrong palette",
);
mustBeDeleted(
  "src/styles/zip-landing-sections.css",
  "standalone redesign landing section CSS must not reintroduce the wrong palette",
);
mustBeDeleted(
  "src/styles/source-migration.css",
  "temporary source-migration styling must not remain after the Letterpress migration",
);
mustBeDeleted("src/lib/wireline-signal-design.ts", "retired signal class bridge must stay deleted");
mustBeDeleted(
  "scripts/sync-stripe-secrets-to-vercel.mjs",
  "retired Stripe secret sync helper must stay deleted",
);
mustBeDeleted("scripts/og-image.svg", "retired logo-only OG source must stay deleted");
mustBeDeleted(
  "scripts/check-active-surface-drift.mjs",
  "retired Ametrine surface contract must stay deleted",
);
mustBeDeleted(
  "src/routes/director-routes.ts",
  "unmounted Director API (superseded by Studio Workroom's agent-workspace routes) must stay deleted",
);
mustBeDeleted(
  "src/components/director",
  "unmounted Director chat UI (superseded by StudioWorkroom) must stay deleted",
);
mustBeDeleted(
  "src/components/layout/DirectorLayout.tsx",
  "unmounted Director layout must stay deleted",
);
mustInclude(
  "src/index.css",
  indexCss,
  /@import\s+"\.\/styles\/letterpress-polish\.css"/,
  "index.css must import the Letterpress polish layer",
);
mustInclude(
  "src/styles/letterpress-polish.css",
  letterpressPolish,
  /\.wl-paper\s*\{[\s\S]*var\(--wireline-elevation-inset\)/,
  "letterpress polish must define the paper surface primitive with inset shadow",
);
mustInclude(
  "src/styles/letterpress-polish.css",
  letterpressPolish,
  /\.wl-focus-ring:focus-visible\s*\{[\s\S]*var\(--wireline-color-focus-default\)/,
  "letterpress polish must define the on-brand focus ring primitive",
);
mustInclude(
  "src/styles/letterpress-polish.css",
  letterpressPolish,
  /\.wl-metric-tile[\s\S]*var\(--wireline-font-family-display\)/,
  "letterpress polish must define the metric tile primitive in display type",
);
mustInclude(
  "src/styles/letterpress-polish.css",
  letterpressPolish,
  /\.wl-empty[\s\S]*var\(--wireline-color-surface-subtle\)/,
  "letterpress polish must define the empty state primitive",
);
mustInclude(
  "src/styles/letterpress-polish.css",
  letterpressPolish,
  /\.wl-eyebrow::before[\s\S]*var\(--wireline-color-action-secondary-default\)/,
  "letterpress polish must use the silver wire as the eyebrow rule",
);
mustInclude(
  "src/lib/wireline-design-vision.ts",
  designVisionSource,
  /"wl-paper"[\s\S]*"wl-metric-tile"[\s\S]*"wl-empty"/,
  "design vision manifest must list the new polish primitives",
);
mustExclude(
  "src/styles/letterpress-polish.css",
  letterpressPolish,
  /#5D3FD3|#451EBB|#F8F9FF|#EFF4FF|#E5EEFF|#0B1C30/i,
  "letterpress polish must not reintroduce the retired purple/blue palette",
);

if (failures.length) {
  console.error(`Wireline Clear System check failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Wireline Clear System check passed");
}
