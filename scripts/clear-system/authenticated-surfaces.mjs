import { assertStudioCanvasContract } from "../lib/studio-canvas-contract.mjs";

/**
 * Authenticated product surfaces — routes, the Studio canvas contract, the
 * auth/create/onboarding flow, Training IA, workspace shell gating, ChatGPT
 * widget chrome, and mojibake hygiene.
 */
export function checkAuthenticatedSurfaces({ read, mustInclude, mustExclude }) {
  const appRoutes = read("src/routes/AppRoutes.tsx");
  const workspaceShell = read("src/components/WorkspaceShell.tsx");
  const mobileBrowserUtilities = read("src/components/MobileBrowserUtilities.tsx");
  const authPortal = read("src/components/AuthPortal.tsx");
  const authRedirect = read("src/lib/auth-redirect.ts");
  const onboardingFlow = read("src/pages/OnboardingFlow.tsx");
  const settingsPage = read("src/pages/SettingsPage.tsx");
  const accountRoutes = read("src/routes/account-routes.ts");
  const createDialog = read("src/components/CreateAgentDialog.tsx");
  const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
  const studioWorkroom = read("src/components/StudioWorkroom.tsx");
  const studioOverview = read("src/components/StudioOverview.tsx");
  const trainingPage = read("src/pages/KnowledgePage.tsx");
  const knowledgeBase = read("src/components/KnowledgeBaseClaude.tsx");
  const productCopy = read("src/lib/product-copy.ts");
  const designVision = read("src/lib/wireline-design-vision.ts");
  const wirelineDesignSystem = read("src/lib/wireline-design-system.ts");
  const mcpWidgetStyles = read("src/lib/wireline-mcp-widget-styles.ts");
  const chatgptWidget = read("src/lib/chatgpt-mcp.ts");
  const chatgptAccountWidget = read("src/lib/chatgpt-mcp-account.ts");
  const agentConfigPanel = read("src/components/fleet-settings/AgentConfigPanel.tsx");
  const wirelineOpsDesign = read("src/lib/wireline-ops-design.ts");
  const signalOrbFrame = read("src/components/ui/SignalOrbFrame.tsx");

  mustInclude(
    "src/routes/AppRoutes.tsx",
    appRoutes,
    /path="\/studio" element=\{<AgentStudioHome/,
    "Studio canvas must be the first-class authenticated route for agents and workspaces",
  );
  mustInclude(
    "src/routes/AppRoutes.tsx",
    appRoutes,
    /to="\/phone\?tab=logs"/,
    "legacy call-log routes must redirect to Phone logs",
  );

  assertStudioCanvasContract(
    {
      shell: workspaceShell,
      canvas: studioWorkspace,
      workroom: studioWorkroom,
      studioOverview,
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
    "bottom dock must be gated by native app shell detection",
  );
  mustInclude(
    "src/components/WorkspaceShell.tsx",
    workspaceShell,
    /!nativeAppShell \?\s*<MobileBrowserUtilities/,
    "MobileBrowserUtilities must be gated by native app shell detection",
  );
  mustExclude(
    "src/components/WorkspaceShell.tsx",
    workspaceShell,
    /wl-workspace-shell--studio|studioParams|isStudioOperationsRoute/,
    "shell must not switch theme by Studio route state",
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
    /\/connections[\s\S]*Connected tools|Connected tools[\s\S]*\/connections/,
    "mobile browser must expose Wire (connections)",
  );
  mustInclude(
    "src/components/StudioOverview.tsx",
    studioOverview,
    /grid grid-cols-1 gap-2[\s\S]*sm:flex sm:overflow-x-auto/,
    "mobile Studio agent list must stack before desktop carousel behavior",
  );

  mustInclude(
    "src/components/CreateAgentDialog.tsx",
    createDialog,
    /Fast Start|~3 minutes/,
    "create flow must use the Fast Start prompt",
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
    "src/components/AuthPortal.tsx",
    authPortal,
    /WirelineMark[\s\S]*Build[\s\S]*Launch[\s\S]*Improve/,
    "account entry must use the canonical mark and current product loop",
  );
  mustExclude(
    "src/components/AuthPortal.tsx",
    authPortal,
    /wl-auth-brand-badge">W</,
    "account entry must not revive the retired boxed W",
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
  mustInclude(
    "src/components/StudioWorkroom.tsx",
    studioWorkroom,
    /Recent outcomes \(ledger\)|Intelligence from outcomes|proposals/,
    "Studio workroom must expose the outcome ledger and intelligence",
  );
  mustExclude(
    "src/components/StudioWorkroom.tsx",
    studioWorkroom,
    /Train by talking\.|what to learn or do/,
    "Studio workroom must stay clean: no training-first copy",
  );

  mustInclude(
    "src/pages/KnowledgePage.tsx",
    trainingPage,
    /KnowledgeBaseClaude/,
    "Training Knowledge tab must mount the Knowledge Base surface",
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
    "document intake must use the asset ingestion API",
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
    "Knowledge surface must own the drop zone",
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
    "account deletion route must exist",
  );

  mustInclude(
    "src/lib/product-copy.ts",
    productCopy,
    /WORKSPACE_VOICE/,
    "workspace voice must live in product-copy module",
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
    "src/lib/wireline-mcp-widget-styles.ts",
    mcpWidgetStyles,
    /tertiary/,
    "MCP widget styles must expose tertiary hint color",
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

  for (const file of [
    "src/components/CreateAgentDialog.tsx",
    "src/components/StudioOverview.tsx",
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
