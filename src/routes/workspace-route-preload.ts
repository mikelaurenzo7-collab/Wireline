/** Route importers shared by the router and the persistent workspace navigation. */

export const loadAgentStudioHome = () => import("../pages/AgentStudioHome");
export const loadBrowserHandoffBridge = () => import("../pages/BrowserHandoffBridge");
export const loadLiveVideoStudioPage = () => import("../pages/LiveVideoStudioPage");
export const loadSettingsPage = () => import("../pages/SettingsPage");
export const loadAdminSettings = () => import("../components/AdminSettings");
export const loadOverviewPage = () => import("../pages/OverviewPage");
export const loadTemplatesPage = () => import("../pages/TemplatesPage");
export const loadKnowledgePage = () => import("../pages/KnowledgePage");
export const loadConnectionsPage = () => import("../pages/ConnectionsPage");
export const loadSalesforceIntegrationPage = () => import("../pages/SalesforceIntegrationPage");
export const loadPhonePage = () => import("../pages/PhonePage");
export const loadInsightsPage = () => import("../pages/InsightsPage");
export const loadEmailPage = () => import("../pages/EmailPage");
export const loadApprovalsPage = () => import("../pages/ApprovalsPage");
export const loadClientAppsPage = () => import("../pages/ClientAppsPage");
export const loadBrowserCommandInstallPage = () => import("../pages/BrowserCommandInstallPage");
export const loadBillingSettings = () => import("../pages/BillingSettings");
export const loadPhoneSettings = () => import("../pages/PhoneSettings");
export const loadTeamSettings = () => import("../pages/TeamSettings");
export const loadComplianceCenterPage = () => import("../pages/ComplianceCenterPage");
export const loadCustomizationSettings = () => import("../pages/CustomizationSettings");

/** Warm the next route chunk before navigation so the workspace stays on-screen. */
export function preloadWorkspaceRoute(pathname: string): void {
  if (pathname === "/overview") void loadOverviewPage();
  else if (pathname === "/studio/handoff") void loadBrowserHandoffBridge();
  else if (pathname === "/studio/live-video") void loadLiveVideoStudioPage();
  else if (pathname === "/studio" || pathname.startsWith("/studio/")) void loadAgentStudioHome();
  else if (pathname === "/templates") void loadTemplatesPage();
  else if (pathname === "/knowledge") void loadKnowledgePage();
  else if (pathname === "/connections/salesforce") void loadSalesforceIntegrationPage();
  else if (pathname === "/connections" || pathname.startsWith("/connections/")) {
    void loadConnectionsPage();
  }
  else if (pathname === "/phone") void loadPhonePage();
  else if (pathname === "/insights") void loadInsightsPage();
  else if (pathname === "/inbox") void loadEmailPage();
  else if (pathname === "/approvals") void loadApprovalsPage();
  else if (pathname === "/apps/command" || pathname === "/settings/apps/command") {
    void loadBrowserCommandInstallPage();
  }
  else if (pathname === "/apps" || pathname === "/settings/apps") void loadClientAppsPage();
  else if (pathname === "/settings/billing") void loadBillingSettings();
  else if (pathname === "/settings/phone") void loadPhoneSettings();
  else if (pathname === "/settings/team") void loadTeamSettings();
  else if (pathname === "/settings/compliance") void loadComplianceCenterPage();
  else if (pathname === "/settings/customization") void loadCustomizationSettings();
  else if (pathname === "/settings" || pathname.startsWith("/settings/")) void loadSettingsPage();
  else if (pathname === "/admin" || pathname.startsWith("/admin/")) void loadAdminSettings();
}
