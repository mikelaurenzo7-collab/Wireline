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
  const studioCanvas = read("src/components/StudioAgentCanvas.tsx");
  const studioWorkroom = read("src/components/StudioWorkroom.tsx");
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

  it("keeps agent-first IA with Studio as the primary build destination", () => {
    const navigation = read("src/constants/navigation.ts");
    expect(workspaceShell).not.toMatch(/label:\s*"Assistants"/);
    expect(workspaceShell).not.toMatch(/label:\s*"Agent Studio"/);
    expect(navigation).toMatch(/href: "\/overview"[\s\S]*label: "Overview"/);
    expect(navigation).toMatch(/href: "\/studio", label: "Studio"/);
    expect(navigation).toMatch(/href: "\/knowledge"[\s\S]*label: "Training"/);
    expect(navigation).toMatch(/href: "\/connections", label: "Wire"/);
    expect(workspaceShell).toMatch(/aria-label="Agents"/);
    expect(workspaceShell).toMatch(/\/studio\?create=1/);
    expect(workspaceShell).toMatch(/to="\/settings"[\s\S]*aria-label="Account settings"/);
    expect(workspaceShell).not.toMatch(/Current agent/);
    expect(appRoutes).toMatch(/path="\/agents"[\s\S]*to="\/studio"/);
    expect(appRoutes).not.toMatch(/path="\/(pulse|fleet|ops|training|chat|actions|nexus|wires)"/);
  });

  it("uses the screenshot-inspired overview as the personal and business roster", () => {
    expect(overviewPage).toMatch(/function dayGreeting/);
    expect(overviewPage).toMatch(/Good evening/);
    expect(overviewPage).toMatch(/Workspace metrics/);
    expect(overviewPage).toMatch(/Personal agents/);
    expect(overviewPage).toMatch(/Business agents/);
    expect(overviewPage).toMatch(/Wire your first agent|Open /);
    expect(overviewPage).toMatch(/posture=/);
    expect(overviewPage).toMatch(/Recent calls/);
    expect(overviewPage).not.toMatch(/Quick actions/);
    expect(overviewPage).not.toMatch(/Your assistants|New assistant|Create assistant/);
  });

  it("keeps Studio visually aligned with the ZIP screenshot", () => {
    expect(studioWorkspace).toMatch(/400px_minmax/);
    expect(studioChrome).toMatch(/Studio/);
    expect(studioChrome).toMatch(/Run test call/);
    expect(studioChrome).not.toMatch(/agentSubtitle|Talk to build\. Canvas to tune\./);
    expect(studioWorkroom).toMatch(/Wireline AI/);
    expect(studioWorkroom).toMatch(/Ask me anything about/);
    expect(studioWorkroom).toMatch(/Change voice/);
    expect(studioWorkroom).toMatch(/Edit workflows/);
    expect(studioWorkroom).toMatch(/Adjust greeting/);
    expect(studioWorkroom).toMatch(/Deploy now/);
    expect(studioCanvas).toMatch(/Identity/);
    expect(studioCanvas).not.toMatch(/line-clamp-4/);
    expect(studioCanvas).toMatch(/Voice/);
    expect(studioCanvas).toMatch(/Workflows & Capabilities/);
    expect(studioCanvas).toMatch(/Knowledge Base/);
    expect(studioCanvas).toMatch(/Situations/);
    expect(studioCanvas).toMatch(/Business Profile|Line Profile/);
    expect(studioCanvas).toMatch(/Escalation & Guardrails/);
    expect(studioCanvas).toMatch(/Setup health/);
  });

  it("uses agent language and Fast Start across studio entry points", () => {
    expect(studioChrome).toMatch(/New agent/);
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

  it("keeps Wire as the customer-facing wiring surface while preserving routes", () => {
    const navigation = read("src/constants/navigation.ts");
    expect(navigation).toMatch(/href: "\/connections", label: "Wire"/);
    expect(connectionsPage).toMatch(/IntegrationOperatingMap/);
    expect(read("src/components/integrations/IntegrationOperatingMap.tsx")).toMatch(
      /wl-eyebrow[\s\S]*Wire/,
    );
    expect(read("src/components/integrations/IntegrationOperatingMap.tsx")).toMatch(
      /Integration map/,
    );
    expect(navigation).toMatch(/label: "Wire"[\s\S]*href: "\/connections"/);
    expect(read("src/lib/wireline-onboarding-copy.ts")).toMatch(/Open Wire/);
  });

  it("keeps Training tabs compact and resilient across narrow workspaces", () => {
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

  it("migrates secondary workspace pages to the new quiet screenshot system", () => {
    // Connections is a thin page that mounts the live integrations card.
    expect(connectionsPage).toMatch(/CrmConnectionCard/);
    expect(read("src/components/CrmConnectionCard.tsx")).toMatch(/Connected stack/);
    expect(settingsPage).toMatch(/Profile/);
    expect(settingsPage).toMatch(/Security/);
    expect(billingPage).toMatch(/Current plan/);
    // Billing intentionally defers renewal amount and invoices to Stripe
    // (the customer portal) rather than computing/caching a price locally.
    expect(billingPage).toMatch(/Stripe is the source of truth for your renewal amount/);
    expect(billingPage).toMatch(/View invoices and payment method/);
    expect(teamPage).toMatch(/Members/);
    expect([connectionsPage, settingsPage, billingPage, teamPage].join("\n")).not.toMatch(
      /assistant|Assistant|Assistants|Pro —|500 min|Sarah Connor|Miles Dyson|Kyle Reese|John Connor/,
    );
  });
});
