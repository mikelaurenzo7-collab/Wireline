import { assertStudioCanvasContract } from "../lib/studio-canvas-contract.mjs";

/**
 * Authenticated product surfaces — routing, shell geometry, responsive
 * navigation, account entry, Studio, Training, settings, and companion chrome.
 */
export function checkAuthenticatedSurfaces({ read, mustInclude, mustExclude }) {
  const appRoutes = read("src/routes/AppRoutes.tsx");
  const workspaceShell = read("src/components/WorkspaceShell.tsx");
  const responsiveCss = read("src/styles/responsive.css");
  const navigation = read("src/constants/navigation.ts");
  const mobileBrowserUtilities = read("src/components/MobileBrowserUtilities.tsx");
  const authPortal = read("src/components/AuthPortal.tsx");
  const authRedirect = read("src/lib/auth-redirect.ts");
  const onboardingFlow = read("src/pages/OnboardingFlow.tsx");
  const settingsPage = read("src/pages/SettingsPage.tsx");
  const accountRoutes = read("src/routes/account-routes.ts");
  const createDialog = read("src/components/CreateAgentDialog.tsx");
  const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
  const studioWorkroom = read("src/components/StudioWorkroom.tsx");
  const trainingPage = read("src/pages/KnowledgePage.tsx");
  const knowledgeBase = read("src/components/KnowledgeBaseClaude.tsx");
  const productCopy = read("src/lib/product-copy.ts");
  const designVision = read("src/lib/wireline-design-vision.ts");
  const wirelineDesignSystem = read("src/lib/wireline-design-system.ts");
  const mcpWidgetStyles = read("src/lib/wireline-mcp-widget-styles.ts");
  const chatgptWidget = read("src/lib/chatgpt-mcp.ts");
  const chatgptAccountWidget = read("src/lib/chatgpt-mcp-account.ts");
  const signalOrbFrame = read("src/components/ui/SignalOrbFrame.tsx");

  mustInclude(
    "src/routes/AppRoutes.tsx",
    appRoutes,
    /path="\/studio" element=\{<AgentStudioHome/,
    "Studio must remain the first-class authenticated agent route",
  );
  mustInclude(
    "src/routes/AppRoutes.tsx",
    appRoutes,
    /to="\/phone\?tab=logs"/,
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
    "src/components/WorkspaceShell.tsx",
    workspaceShell,
    /MOBILE_PRIMARY_NAV/,
    "workspace shell must use centralized navigation constants",
  );
  mustInclude(
    "src/components/WorkspaceShell.tsx",
    workspaceShell,
    /function isNativeAppShell/,
    "browser-only utilities must be gated for native shells",
  );
  mustInclude(
    "src/components/WorkspaceShell.tsx",
    workspaceShell,
    /!nativeAppShell \?\s*<MobileBrowserUtilities/,
    "MobileBrowserUtilities must be gated by native shell detection",
  );
  mustInclude(
    "src/styles/responsive.css",
    responsiveCss,
    /padding-bottom:\s*calc\(5\.25rem \+ env\(safe-area-inset-bottom\)\)/,
    "mobile workspace content must clear the fixed dock and device safe area",
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
    "src/components/MobileBrowserUtilities.tsx",
    mobileBrowserUtilities,
    /Billing[\s\S]*Usage \+ balance/,
    "mobile browser utilities must expose billing and usage controls",
  );
  mustInclude(
    "src/components/MobileBrowserUtilities.tsx",
    mobileBrowserUtilities,
    /\/connections[\s\S]*Connected tools|Connected tools[\s\S]*\/connections/,
    "mobile browser utilities must expose connected tools",
  );

  mustInclude(
    "src/components/CreateAgentDialog.tsx",
    createDialog,
    /Fast Start|~3 minutes/,
    "create flow must retain the fast-start promise",
  );
  mustInclude(
    "src/components/CreateAgentDialog.tsx",
    createDialog,
    /\/studio\?agent=/,
    "create flow must hand into the real Studio canvas",
  );
  mustInclude(
    "src/components/AuthPortal.tsx",
    authPortal,
    /current\?\.preferredPlanId[\s\S]*current\.preferredPlanId !== "personal"[\s\S]*:\s*"starter"/,
    "business workspace selection must preserve paid intent or default to Starter",
  );
  mustInclude(
    "src/components/AuthPortal.tsx",
    authPortal,
    /WirelineMark/,
    "account entry must use the canonical Wireline mark",
  );
  mustInclude(
    "src/components/AuthPortal.tsx",
    authPortal,
    /SIGNUP_PLAN_LABELS/,
    "account entry must display human plan labels",
  );
  mustExclude(
    "src/components/AuthPortal.tsx",
    authPortal,
    /AuthBrandPanel|wl-auth-brand-badge">W</,
    "account entry must not revive the retired split panel or boxed W",
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
    "legacy onboarding must hand directly into create",
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
    "src/components/StudioWorkroom.tsx",
    studioWorkroom,
    /PanelRightOpen|Working context|Detailed view/,
    "Workroom must not reintroduce a competing context rail",
  );

  mustInclude(
    "src/pages/KnowledgePage.tsx",
    trainingPage,
    /KnowledgeBaseClaude/,
    "Training Knowledge must mount the real Knowledge Base",
  );
  mustInclude(
    "src/pages/KnowledgePage.tsx",
    trainingPage,
    /id: "knowledge"[\s\S]*id: "reports"/,
    "Training must expose Business knowledge and Reports under the managed runtime",
  );
  mustInclude(
    "src/components/KnowledgeBaseClaude.tsx",
    knowledgeBase,
    /\/api\/agent-config\/\$\{encodeURIComponent\(agentId\)\}/,
    "Knowledge Base must bind to the real agent-config record",
  );
  mustInclude(
    "src/components/KnowledgeBaseClaude.tsx",
    knowledgeBase,
    /onDrop=\{onDrop\}[\s\S]*Add documents/,
    "Knowledge Base must retain the accessible ingestion drop zone",
  );

  mustInclude(
    "src/pages/SettingsPage.tsx",
    settingsPage,
    /Delete account|Account deletion/,
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
    "MCP widgets must use the Wireline dark canvas",
  );
  mustInclude(
    "src/lib/wireline-mcp-widget-styles.ts",
    mcpWidgetStyles,
    /action: "#A78BFA"/,
    "MCP widgets must use the Aurora action token",
  );
  mustInclude(
    "src/lib/chatgpt-mcp.ts",
    chatgptWidget,
    /buildWirelineMcpWidgetCss/,
    "ChatGPT public widget must use shared chrome",
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
    "src/components/CreateAgentDialog.tsx",
    "src/components/AuthPortal.tsx",
    "src/components/layout/AppShell.tsx",
    "src/pages/OverviewPage.tsx",
    "src/pages/SettingsPage.tsx",
    "src/pages/BillingSettings.tsx",
    "src/components/ConversationBalanceCard.tsx",
    "src/components/StudioWorkroom.tsx",
  ]) {
    mustExclude(file, read(file), /Â|â|�/, "authenticated surfaces must not expose mojibake");
  }
}
