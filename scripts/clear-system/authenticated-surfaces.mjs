import { assertStudioCanvasContract } from "../lib/studio-canvas-contract.mjs";

/**
 * Authenticated product surfaces: routing, shell geometry, responsive
 * navigation, account entry, Studio, Knowledge, settings, and companion chrome.
 */
export function checkAuthenticatedSurfaces({ read, mustInclude, mustExclude }) {
  const appRoutes = read("src/routes/AppRoutes.tsx");
  const workspaceShell = read("src/components/WorkspaceShell.tsx");
  const responsiveCss = read("src/styles/responsive.css");
  const safeAreaOwnership = read("src/styles/safe-area-ownership.css");
  const navigation = read("src/constants/navigation.ts");
  const authPortal = read("src/components/AuthPortal.tsx");
  const authAccessPanel = read("src/components/auth/AuthAccessPanel.tsx");
  const authRedirect = read("src/lib/auth-redirect.ts");
  const onboardingFlow = read("src/pages/OnboardingFlow.tsx");
  const settingsPage = read("src/pages/SettingsPage.tsx");
  const accountRoutes = read("src/routes/account-routes.ts");
  const boOnboarding = read("src/components/onboarding/BoOnboarding.tsx");
  const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
  const studioWorkroom = read("src/components/StudioWorkroom.tsx");
  const trainingPage = read("src/pages/KnowledgePage.tsx");
  const phonePage = read("src/pages/PhonePage.tsx");
  const knowledgeBase = read("src/components/KnowledgeBaseClaude.tsx");
  const productCopy = read("src/lib/product-copy.ts");
  const designVision = read("src/lib/wireline-design-vision.ts");
  const wirelineDesignSystem = read("src/lib/wireline-design-system.ts");
  const mcpWidgetStyles = read("src/lib/wireline-mcp-widget-styles.ts");
  const chatgptAccountWidget = read("src/lib/chatgpt-mcp-account.ts");
  const signalOrbFrame = read("src/components/ui/SignalOrbFrame.tsx");
  const computerPage = read("src/pages/ComputerPage.tsx");
  const browserTools = read("src/components/computer/BrowserSessionTools.tsx");

  mustInclude(
    "src/routes/AppRoutes.tsx",
    appRoutes,
    /path="\/studio" element=\{<AgentStudioHome/,
    "Studio must remain the first-class authenticated agent route",
  );
  mustInclude(
    "src/routes/AppRoutes.tsx",
    appRoutes,
    /path="\/overview" element=\{<ToStudioRedirect\s*\/>/,
    "the retired overview route must redirect into Studio",
  );
  mustInclude(
    "src/routes/AppRoutes.tsx",
    appRoutes,
    /to="\/phone" searchParams=\{\{ tab: "logs" \}\}/,
    "legacy call-log routes must redirect to Phone logs",
  );
  mustInclude(
    "src/routes/AppRoutes.tsx",
    appRoutes,
    /path="\/settings\/billing"/,
    "billing must remain a first-class settings route",
  );

  assertStudioCanvasContract(
    {
      shell: workspaceShell,
      canvas: studioWorkspace,
      workroom: studioWorkroom,
      designVision,
    },
    { mustInclude, mustExclude },
  );

  mustInclude(
    "src/pages/ComputerPage.tsx",
    computerPage,
    /task\.browserCapabilities\?\.tabs[\s\S]*kind: "close_tab"/,
    "session tab management must follow the current browser capabilities",
  );
  mustInclude(
    "src/components/computer/BrowserSessionTools.tsx",
    browserTools,
    /const disabled = !ownerControl \|\| ownerBusy/,
    "session tools must require owner control and serialize owner input",
  );
  mustExclude(
    "src/components/computer/BrowserSessionTools.tsx",
    browserTools,
    /(?:localStorage|sessionStorage)\.setItem/,
    "browser credentials and cookies must never be saved to local drafts",
  );

  mustInclude(
    "src/components/WorkspaceShell.tsx",
    workspaceShell,
    /MOBILE_PRIMARY_NAV/,
    "workspace shell must use centralized navigation constants",
  );
  mustExclude(
    "src/components/WorkspaceShell.tsx",
    workspaceShell,
    /MobileBrowserUtilities|function isNativeAppShell/,
    "workspace shell must not mount a second mobile utility control beside More",
  );
  mustInclude(
    "src/components/WorkspaceShell.tsx",
    workspaceShell,
    /<MobileNavMoreSheet/,
    "mobile More must remain the single secondary-navigation owner",
  );
  mustInclude(
    "src/styles/safe-area-ownership.css",
    safeAreaOwnership,
    /\.wl-workspace-shell \{[\s\S]*padding-bottom:\s*env\(safe-area-inset-bottom/,
    "workspace shell must own the device home-indicator inset",
  );
  mustInclude(
    "src/styles/safe-area-ownership.css",
    safeAreaOwnership,
    /@media \(max-width: 1023px\)[\s\S]*\.wl-workspace-shell \.wl-workspace-content \{[^}]*padding-bottom:\s*calc\(\s*var\(--wl-workspace-dock-height, 5\.25rem\) \+ var\(--wl-workspace-dock-gap, 1rem\) -\s*env\(safe-area-inset-bottom, 0px\)\s*\);/,
    "workspace scrollers must clear the measured dock without repeating the device inset",
  );
  mustInclude(
    "src/components/WorkspaceShell.tsx",
    workspaceShell,
    /useChromeHeight\(":root", "--wl-workspace-dock-height"\)/,
    "the mobile dock must own its measured clearance",
  );
  mustExclude(
    "src/styles/responsive.css",
    responsiveCss,
    /padding-bottom:\s*calc\(5\.25rem \+ env\(safe-area-inset-bottom\)\)/,
    "responsive.css must not restack dock clearance on the main column",
  );
  mustInclude(
    "src/constants/navigation.ts",
    navigation,
    /href:\s*"\/connections",\s*label:\s*"Connections"/,
    "Connections must be the customer-facing wiring surface label in navigation",
  );
  mustExclude(
    "src/components/WorkspaceShell.tsx",
    workspaceShell,
    /wl-workspace-shell--studio|studioParams|isStudioOperationsRoute/,
    "shell must not switch visual systems by Studio route state",
  );
  mustInclude(
    "src/components/onboarding/BoOnboarding.tsx",
    boOnboarding,
    /only_if_none: true/,
    "first run must meet the account's one Bot, created once, not a create form",
  );
  // One Bot, called Bo: its first conversation introduces it by name and
  // offers nothing to pick. Starter chips went the way of the template gallery.
  mustInclude(
    "src/components/onboarding/BoOnboarding.tsx",
    boOnboarding,
    /aria-label=\{`Conversation with \$\{botName\}`\}/,
    "first run must be a conversation with the Bot",
  );
  mustInclude(
    "src/components/onboarding/BoOnboarding.tsx",
    boOnboarding,
    /COPY\.intro\(botName\)/,
    "first run must say what the Bot is called",
  );
  mustExclude(
    "src/components/onboarding/BoOnboarding.tsx",
    boOnboarding,
    /STARTER_KEYS|templateForKey|Starting briefs/,
    "first run must not bring back a template picker",
  );
  mustInclude(
    "src/components/onboarding/BoOnboarding.tsx",
    boOnboarding,
    /\/studio\?agent=/,
    "first run must hand into the real Studio canvas",
  );
  mustExclude(
    "src/components/onboarding/BoOnboarding.tsx",
    boOnboarding,
    /setPosture|rolesForPosture|posture === "business"/,
    "first run must not ask customers to choose a personal or business workspace",
  );

  mustInclude(
    "src/components/AuthPortal.tsx",
    authPortal,
    /<AuthAccessPanel initialMode=\{isSignupRoute \? "signup" : "signin"\}\s*\/>/,
    "dedicated auth routes must use the same access panel as the landing entrance",
  );
  mustInclude(
    "src/components/auth/AuthAccessPanel.tsx",
    authAccessPanel,
    /sanitizeSignupIntent\(signupIntent\)/,
    "account entry must preserve and sanitize the selected signup intent",
  );
  mustInclude(
    "src/components/auth/AuthAccessPanel.tsx",
    authAccessPanel,
    /preferredPlanId: effectiveIntent\.preferredPlanId,[\s\S]*preferredBillingInterval: effectiveIntent\.preferredBillingInterval/,
    "account entry must submit the selected plan and billing interval together",
  );
  mustExclude(
    "src/components/auth/AuthAccessPanel.tsx",
    authAccessPanel,
    /defaultFreeIntent|function signupPlanLabel\(/,
    "account entry must not invent a retired free plan or duplicate pricing labels",
  );
  mustInclude(
    "src/components/auth/AuthAccessPanel.tsx",
    authAccessPanel,
    /<WirelineLockup/,
    "shared account entry must use the canonical WIRELINE lockup",
  );
  mustExclude(
    "src/components/auth/AuthAccessPanel.tsx",
    authAccessPanel,
    /WorkspaceSelector|Building2|title:\s*"Personal"|title:\s*"Business"/,
    "account entry must not ask visitors to classify themselves as Personal or Business",
  );
  mustExclude(
    "src/components/AuthPortal.tsx",
    authPortal,
    /AuthBrandPanel|WorkspaceSelector|WirelineMark|wl-auth-brand-badge">W/,
    "route chrome must not revive the retired split brand panel, audience selector, or boxed W",
  );

  mustInclude(
    "src/lib/auth-redirect.ts",
    authRedirect,
    /export function firstBotSetupHref\(template\?: string\): string \{[\s\S]*?return "\/studio";/,
    "fresh signups must route directly into the Workspace, where they meet their Bot",
  );
  mustExclude(
    "src/lib/auth-redirect.ts",
    authRedirect,
    /create=1|posture=/,
    "fresh signup routing must not open a create dialog or posture-specific workspaces",
  );
  mustInclude(
    "src/pages/OnboardingFlow.tsx",
    onboardingFlow,
    /navigate\(`\/studio\$\{search\}`, \{ replace: true \}\)/,
    "legacy onboarding must hand directly into the Workspace",
  );
  mustExclude(
    "src/pages/OnboardingFlow.tsx",
    onboardingFlow,
    /Link your phone|Verify your number|Name your agent/,
    "the retired fake onboarding wizard must stay removed",
  );

  mustExclude(
    "src/components/StudioWorkspaceV2.tsx",
    studioWorkspace,
    /StudioAssistantWorkspace/,
    "old Studio assistant rail must not be active",
  );
  mustExclude(
    "src/components/StudioWorkspaceV2.tsx",
    studioWorkspace,
    /useAccount|posture=/,
    "Studio must not branch the customer workspace by personal or business posture",
  );
  mustExclude(
    "src/components/StudioWorkroom.tsx",
    studioWorkroom,
    /PanelRightOpen|Working context|Detailed view/,
    "Workroom must not reintroduce a competing context rail",
  );

  mustInclude(
    "src/pages/KnowledgePage.tsx",
    trainingPage,
    /KnowledgeBaseClaude/,
    "Knowledge must mount the real Knowledge Base",
  );
  mustInclude(
    "src/pages/KnowledgePage.tsx",
    trainingPage,
    /rawRequestedTab === "reports"[\s\S]*<Navigate to=\{`\/phone\?\$\{params\.toString\(\)\}`\} replace/,
    "legacy Knowledge report links must preserve their Bot scope when moving to Calls",
  );
  mustInclude(
    "src/pages/PhonePage.tsx",
    phonePage,
    /primaryTab === "settings" && !scopeBlocked[\s\S]*<ReportingPreferences[\s\S]*<RecentCallArtifactRequests key=\{activeAgentId\} agentId=\{activeAgentId \|\| null\}/,
    "Calls Settings must own reporting preferences and Bot-scoped call files",
  );
  mustInclude(
    "src/components/KnowledgeBaseClaude.tsx",
    knowledgeBase,
    /\/api\/agent-config\/\$\{encodeURIComponent\(operation\.requestedAgentId\)\}/,
    "Knowledge Base must bind to the real agent-config record",
  );
  mustInclude(
    "src/components/KnowledgeBaseClaude.tsx",
    knowledgeBase,
    /activeAgentIdRef\.current === requestedAgentId[\s\S]*agentScopeRevisionRef\.current === scopeRevision/,
    "Knowledge Base must fence async completions to the active Bot scope",
  );
  mustInclude(
    "src/components/KnowledgeBaseClaude.tsx",
    knowledgeBase,
    /onDrop=\{onDrop\}[\s\S]*<h2\b[^>]*>\s*Add Documents\s*<\/h2>/,
    "Knowledge Base must retain the accessible ingestion drop zone",
  );

  mustInclude(
    "src/pages/SettingsPage.tsx",
    settingsPage,
    /Delete account|Account deletion/i,
    "settings must expose account deletion",
  );
  mustInclude(
    "src/routes/account-routes.ts",
    accountRoutes,
    /\/api\/account\/delete/,
    "the account deletion route must exist",
  );

  mustInclude(
    "src/lib/product-copy.ts",
    productCopy,
    /WORKSPACE_VOICE/,
    "workspace voice must live in shared product copy",
  );
  mustInclude(
    "src/lib/product-copy.ts",
    productCopy,
    /Treat workspace architecture as product proof, never as a marketing headline\./,
    "shared product copy may document architecture internally even though marketing does not lead with it",
  );
  mustInclude(
    "src/lib/wireline-design-vision.ts",
    designVision,
    /WIRELINE_DESIGN_VISION/,
    "the design vision manifest must exist",
  );
  mustInclude(
    "src/lib/wireline-design-system.ts",
    wirelineDesignSystem,
    /WL_VISION/,
    "the design-system module must re-export the vision manifest",
  );
  mustInclude(
    "src/lib/wireline-mcp-widget-styles.ts",
    mcpWidgetStyles,
    /canvas: "#0A0A0E"/,
    "MCP widgets must use the WIRELINE obsidian canvas",
  );
  mustInclude(
    "src/lib/wireline-mcp-widget-styles.ts",
    mcpWidgetStyles,
    /action: "#A78BFA"/,
    "MCP widgets must use the Letterpress action token",
  );
  mustInclude(
    "src/lib/chatgpt-mcp-account.ts",
    chatgptAccountWidget,
    /buildWirelineMcpWidgetCss/,
    "ChatGPT account widget must use shared chrome",
  );
  mustInclude(
    "src/components/ui/SignalOrbFrame.tsx",
    signalOrbFrame,
    /SignalFrameRail/,
    "loading and empty states must use the minimal signal frame",
  );

  for (const file of [
    "src/components/onboarding/BoOnboarding.tsx",
    "src/components/AuthPortal.tsx",
    "src/components/auth/AuthAccessPanel.tsx",
    "src/components/layout/AppShell.tsx",
    "src/pages/SettingsPage.tsx",
    "src/pages/BillingSettings.tsx",
    "src/components/StudioWorkroom.tsx",
  ]) {
    mustExclude(file, read(file), /Â|â|�/, "authenticated surfaces must not expose mojibake");
  }
}
