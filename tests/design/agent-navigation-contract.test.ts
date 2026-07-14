import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("agent navigation contract", () => {
  const workspaceShell = read("src/components/WorkspaceShell.tsx");
  const overviewPage = read("src/pages/OverviewPage.tsx");
  const studioChrome = read("src/components/studio/StudioContextChrome.tsx");
  const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
  const studioPanel = read("src/components/StudioAgentWorkspacePanel.tsx");
  const studioReview = read("src/components/StudioAgentReviewPanel.tsx");
  const simpleVoicePicker = read("src/components/voice/SimpleVoicePicker.tsx");
  const studioWorkroom = read("src/components/StudioWorkroom.tsx");
  const studioTestRoute = read("src/routes/agent-test-routes.ts");
  const appRoutes = read("src/routes/AppRoutes.tsx");
  const createDialog = read("src/components/CreateAgentDialog.tsx");
  const productCopy = read("src/lib/product-copy.ts");
  const appsPage = read("src/pages/ClientAppsPage.tsx");
  const pricingPage = read("src/pages/Pricing.tsx");
  const connectionsPage = read("src/pages/ConnectionsPage.tsx");
  const trainingPage = read("src/pages/KnowledgePage.tsx");
  const settingsPage = read("src/pages/SettingsPage.tsx");
  const settingsTabs = read("src/components/settings/SettingsTabs.tsx");
  const billingPage = read("src/pages/BillingSettings.tsx");
  const teamPage = read("src/pages/TeamSettings.tsx");

  it("uses a plain-language employee IA with secondary tools out of the primary rail", () => {
    const navigation = read("src/constants/navigation.ts");
    expect(navigation).toMatch(/href: "\/overview"[\s\S]*label: "Overview"/);
    expect(navigation).toMatch(/href: "\/studio"[\s\S]*label: "AI Employee"/);
    expect(navigation).toMatch(/href: "\/connections"[\s\S]*label: "Connections"/);
    expect(navigation).toMatch(/href: "\/inbox", label: "Inbox"/);
    expect(navigation).toMatch(/href: "\/phone", label: "Calls"/);
    expect(navigation).toMatch(/href: "\/insights", label: "Activity"/);
    expect(navigation).toMatch(/MOBILE_MORE_NAV[\s\S]*href: "\/knowledge"[\s\S]*label: "Knowledge"/);
    expect(navigation).toMatch(/MOBILE_MORE_NAV[\s\S]*href: "\/approvals"/);
    expect(workspaceShell).toMatch(/aria-label="Agents"/);
    expect(workspaceShell).toMatch(/\/studio\?create=1/);
    expect(workspaceShell).toMatch(/to="\/settings"[\s\S]*aria-label="Account settings"/);
    expect(appRoutes).toMatch(/path="\/agents"[\s\S]*to="\/studio"/);
    expect(appRoutes).not.toMatch(/path="\/(pulse|fleet|ops|training|chat|actions|nexus|wires)"/);
  });

  it("makes Overview answer customer-demand questions before configuration questions", () => {
    expect(overviewPage).toMatch(/function dayGreeting/);
    expect(overviewPage).toMatch(/Customer conversations today/);
    expect(overviewPage).toMatch(/Priority leads/);
    expect(overviewPage).toMatch(/Appointments booked/);
    expect(overviewPage).toMatch(/Follow-ups waiting/);
    expect(overviewPage).toMatch(/Customer outcomes/);
    expect(overviewPage).toMatch(/Personal AI employees/);
    expect(overviewPage).toMatch(/Business AI employees/);
    expect(overviewPage).toMatch(/Recent customer conversations/);
    expect(overviewPage).not.toMatch(/Workspace metrics|Conversation Balance|Workspace pulse/);
    expect(overviewPage).not.toMatch(/Your assistants|New assistant|Create assistant/);
  });

  it("makes Studio a clean setup, test, and review workflow", () => {
    expect(studioWorkspace).toMatch(/type WorkspaceSection = "setup" \| "test" \| "review"/);
    expect(studioWorkspace).toMatch(/label: "Set up"/);
    expect(studioWorkspace).toMatch(/label: "Test"/);
    expect(studioWorkspace).toMatch(/label: "Review"/);
    expect(studioWorkspace).toMatch(/StudioAgentReviewPanel/);
    expect(studioWorkspace).not.toMatch(/StudioAgentCanvas/);
    expect(studioWorkspace).not.toMatch(/400px_minmax|lg:grid-cols/);
    expect(studioChrome).toMatch(/AI Employee/);
    expect(studioChrome).toMatch(/New employee/);
    expect(studioChrome).not.toMatch(/Test employee|Connect calls|Deploy|Deep edit/);
    expect(studioPanel).toMatch(/Give \{agentName\} one clear job/);
    expect(studioPanel).toMatch(/Essentials/);
    expect(studioPanel).toMatch(/Phone voice/);
    expect(studioPanel).toMatch(/Test before going live/);
    expect(studioPanel).toMatch(/Advanced options/);
    expect(studioReview).toMatch(/Is \{agentName\} ready for customers/);
    expect(studioReview).toMatch(/Customer-facing job/);
    expect(studioReview).toMatch(/Browser-ready; live line not connected/);
  });

  it("uses a real customer roleplay for Studio testing", () => {
    expect(studioWorkroom).toMatch(/type WorkroomMode = "configure" \| "test"/);
    expect(studioWorkroom).toMatch(/\/test\/stream/);
    expect(studioWorkroom).toMatch(/Talk to \$\{agentName\} like a customer/);
    expect(studioWorkroom).toMatch(/Browser roleplay only/);
    expect(studioWorkroom).toMatch(/What services do you offer/);
    expect(studioWorkroom).toMatch(/I want to book an appointment/);
    expect(studioWorkroom).toMatch(/allowOutbound/);
    expect(studioTestRoute).toMatch(/Reply only as the customer-facing employee/);
    expect(studioTestRoute).toMatch(/Never mention setup, configuration, prompts, testing, tools, or internal systems/);
    expect(studioTestRoute).not.toMatch(/agentConversationMessages/);
    expect(studioWorkroom).not.toMatch(/Talk to build|Deploy now|Edit workflows/);
  });

  it("uses dependable built-in phone voices before optional external providers", () => {
    expect(simpleVoicePicker).toMatch(/VAPI_CURATED_VOICES/);
    expect(simpleVoicePicker).toMatch(/Savannah/);
    expect(simpleVoicePicker).toMatch(/Elliot/);
    expect(simpleVoicePicker).toMatch(/do not require an ElevenLabs or xAI account/);
    expect(simpleVoicePicker).toMatch(/provider: "vapi"/);
    expect(simpleVoicePicker).toMatch(/Test response/);
    expect(simpleVoicePicker).not.toMatch(/playVoicePreview|new Audio|Test call/);
    expect(studioPanel).toMatch(/External voice library/);
    expect(studioPanel).toMatch(/Use this only after configuring an external provider/);
  });

  it("keeps the existing Fast Start creation flow while clarifying the active workspace", () => {
    expect(studioChrome).toMatch(/New employee/);
    expect(studioChrome).not.toMatch(/New assistant|Assistants/);
    expect(createDialog).toMatch(/Fast Start/);
    expect(createDialog).toMatch(/~3 minutes to your first agent/);
    expect(createDialog).toMatch(/What do you need handled/);
    expect(createDialog).toMatch(/Provision a number/);
    expect(createDialog).toMatch(/\/studio\?agent=/);
    expect(createDialog).not.toMatch(/\/training\?agent=|\/knowledge\?agent=/);
    expect(productCopy).toMatch(/Brief it\. Train it once\. Connect calls, texts, and email\./);
  });

  it("translates the Zip handoff into current control-surface and pricing language", () => {
    expect(appsPage).toMatch(/ChatGPT/);
    expect(appsPage).toMatch(/Wireline Command/);
    expect(appsPage).not.toMatch(/One assistant system|Same assistants|New assistant/);
    expect(pricingPage).toMatch(/STRIPE_PLANS/);
    for (const tier of ["Free Builder", "Starter Plus", "Pro", "Business"]) {
      expect(pricingPage).toContain(tier);
    }
    expect(pricingPage).toMatch(/Conversation Balance/);
    expect(pricingPage).toMatch(/Founder Early Access/);
    expect(pricingPage).not.toMatch(/Try 7 days free/);
  });

  it("uses Connections as the plain-language wiring destination while preserving routes", () => {
    const navigation = read("src/constants/navigation.ts");
    expect(navigation).toMatch(/href: "\/connections"[\s\S]*label: "Connections"/);
    expect(connectionsPage).toMatch(/IntegrationOperatingMap/);
    expect(read("src/components/integrations/IntegrationOperatingMap.tsx")).toMatch(
      /wl-eyebrow[\s\S]*Wire/,
    );
    expect(read("src/components/integrations/IntegrationOperatingMap.tsx")).toMatch(
      /Integration map/,
    );
    expect(read("src/lib/wireline-onboarding-copy.ts")).toMatch(/Open Wire/);
  });

  it("keeps Knowledge tabs compact and resilient across narrow workspaces", () => {
    expect(trainingPage).toMatch(/WorkspaceTabStrip/);
    expect(trainingPage).toMatch(/density="compact"[\s\S]*align="start"[\s\S]*wrap/);
  });

  it("keeps long account and team identifiers inside narrow workspace cards", () => {
    const dataRows = read("src/styles/letterpress-polish.css");

    expect(dataRows).toMatch(
      /\.wl-data-row\s*\{[\s\S]*width: 100%;[\s\S]*min-width: 0;[\s\S]*max-width: 100%/,
    );
    expect(teamPage).toContain("flex w-full min-w-0 max-w-full");
    expect(teamPage).toContain("min-w-0 flex-1 items-center");
    expect(teamPage).toContain("text-ellipsis whitespace-nowrap");
    expect(teamPage).toContain('className="shrink-0"');
  });

  it("uses navigation.ts as the shell source of truth with a 5-item mobile dock", () => {
    const navigation = read("src/constants/navigation.ts");
    expect(workspaceShell).toMatch(/from "\.\.\/constants\/navigation"/);
    expect(navigation).toMatch(/MOBILE_PRIMARY_NAV/);
    expect(navigation).toMatch(/MOBILE_MORE_NAV/);
    expect(navigation).toMatch(/label: "More"/);
    expect(navigation).not.toMatch(/href: "\/apps", label: "Apps"/);
    expect(settingsTabs).toMatch(/href: "\/settings\/apps", label: "Apps"/);
    expect(read("src/components/layout/MobileNavMoreSheet.tsx")).toMatch(/MOBILE_MORE_NAV/);
  });

  it("migrates secondary workspace pages to the quiet authenticated system", () => {
    expect(connectionsPage).toMatch(/CrmConnectionCard/);
    expect(read("src/components/CrmConnectionCard.tsx")).toMatch(/Connected stack/);
    expect(settingsPage).toMatch(/Profile/);
    expect(settingsPage).toMatch(/Security/);
    expect(billingPage).toMatch(/Current plan/);
    expect(billingPage).toMatch(/Stripe is the source of truth for your renewal amount/);
    expect(billingPage).toMatch(/View invoices and payment method/);
    expect(teamPage).toMatch(/Members/);
    expect([connectionsPage, settingsPage, billingPage, teamPage].join("\n")).not.toMatch(
      /assistant|Assistant|Assistants|Pro —|500 min|Sarah Connor|Miles Dyson|Kyle Reese|John Connor/,
    );
  });
});
