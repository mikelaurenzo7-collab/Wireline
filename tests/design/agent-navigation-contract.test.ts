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
  const createDialog = read("src/components/CreateAgentDialog.tsx");
  const productCopy = read("src/lib/product-copy.ts");
  const appsPage = read("src/pages/ClientAppsPage.tsx");
  const pricingPage = read("src/pages/Pricing.tsx");
  const connectionsPage = read("src/pages/ConnectionsPage.tsx");
  const settingsPage = read("src/pages/SettingsPage.tsx");
  const billingPage = read("src/pages/BillingSettings.tsx");
  const teamPage = read("src/pages/TeamSettings.tsx");

  it("keeps the old Assistants rail out while exposing agents in Overview", () => {
    expect(workspaceShell).not.toMatch(/label:\s*"Assistants"/);
    expect(workspaceShell).not.toMatch(/label:\s*"Agent Studio"/);
    expect(workspaceShell).toMatch(/label:\s*"Overview"/);
    expect(workspaceShell).toMatch(/aria-label="Agents"/);
    expect(workspaceShell).toMatch(/\/studio\?create=1/);
  });

  it("uses the screenshot-inspired overview as the personal and business roster", () => {
    expect(overviewPage).toMatch(/Good morning/);
    expect(overviewPage).toMatch(/Personal and business agent roster/);
    expect(overviewPage).toMatch(/title="Personal"/);
    expect(overviewPage).toMatch(/title="Business"/);
    expect(overviewPage).toMatch(/Add \{kind\} agent/);
    expect(overviewPage).toMatch(/Recent calls/);
    expect(overviewPage).toMatch(/Quick actions/);
    expect(overviewPage).not.toMatch(/Your assistants|New assistant|Create assistant/);
  });

  it("uses agent language across studio entry points", () => {
    expect(studioChrome).toMatch(/New agent/);
    expect(studioChrome).not.toMatch(/New assistant|Assistant/);
    expect(createDialog).toMatch(/New agent\.|Create agent/);
    expect(createDialog).toMatch(/\/knowledge\?agent=/);
    expect(createDialog).not.toMatch(/\/training\?agent=/);
    expect(productCopy).toMatch(/Brief it\. Train it\. Put it on the line\./);
  });

  it("translates the Zip handoff into current control-surface and pricing language", () => {
    expect(appsPage).toMatch(/One agent system, wherever the conversation starts\./);
    expect(appsPage).toMatch(/Browser Companion/);
    expect(appsPage).not.toMatch(/One assistant system|Same assistants|New assistant/);
    expect(pricingPage).toMatch(/STRIPE_PLANS/);
    expect(pricingPage).toMatch(/Personal[\s\S]*Team[\s\S]*Business[\s\S]*Enterprise/);
    expect(pricingPage).toMatch(/Conversation Balance/);
    expect(pricingPage).toMatch(/Balance pays for live work\. Plans add the business layer\./);
    expect(pricingPage).not.toMatch(/Starter|Try 7 days free|\$79/);
  });

  it("migrates secondary workspace pages to the new quiet screenshot system", () => {
    expect(connectionsPage).toMatch(/Tools your agents can use when handling a call/);
    expect(connectionsPage).toMatch(/Available to connect/);
    expect(settingsPage).toMatch(/Profile/);
    expect(settingsPage).toMatch(/Security/);
    expect(billingPage).toMatch(/Current plan/);
    expect(billingPage).toMatch(/monthlyPrice/);
    expect(billingPage).toMatch(/invoiceTotal/);
    expect(teamPage).toMatch(/Members/);
    expect([connectionsPage, settingsPage, billingPage, teamPage].join("\n")).not.toMatch(/assistant|Assistant|Assistants|Pro —|500 min|Sarah Connor|Miles Dyson|Kyle Reese|John Connor/);
  });
});
