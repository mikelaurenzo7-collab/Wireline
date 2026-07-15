import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");

describe("verified visual QA simplifications", () => {
  it("keeps Studio's guided steps and core job readable on compact screens", () => {
    const workspace = read("src/components/StudioWorkspaceV2.tsx");
    const setup = read("src/components/StudioAgentWorkspacePanel.tsx");

    expect(workspace).toContain("hidden size-4 shrink-0 sm:block");
    expect(workspace).toContain("whitespace-nowrap text-xs font-semibold");
    expect(setup).toMatch(/<textarea\s+id="setup-job"/);
    expect(setup).toContain("rows={2}");
    expect(setup).toContain("maxLength={160}");
  });

  it("labels Fast Start's primary input and its shortcuts in visible language", () => {
    const source = read("src/components/CreateAgentDialog.tsx");
    expect(source).toContain("What should this employee do?");
    expect(source).toContain("Quick starts");
    expect(source).not.toContain('<span className="sr-only">AI employee brief</span>');
  });

  it("makes empty call history truthful for workspaces that already have an employee", () => {
    const source = read("src/components/PhoneCallHistoryPanel.tsx");
    expect(source).toContain("useAgents");
    expect(source).toContain("loading: agentsLoading");
    expect(source).toContain("agent.is_business_agent && agent.channel");
    expect(source).toContain("eligibleAgent ?");
    expect(source).toContain(': "/settings/phone"');
    expect(source).toContain('"Wire a number"');
    expect(source).toContain("&section=test");
    expect(source).toContain('to="/studio?create=1&posture=business">Create phone employee');
  });

  it("does not portray disconnected Salesforce delivery as enabled", () => {
    const source = read("src/pages/SalesforceIntegrationPage.tsx");
    expect(source).toContain("checked={callActivitySyncEnabled && isConnected}");
    expect(source).toContain("aria-busy={checkingConnection}");
    expect(source).toContain('? "Checking"');
  });

  it("bounds approval loading, exposes busy state, and offers recovery", () => {
    const source = read("src/components/ApprovalInbox.tsx");
    expect(source.match(/timeoutMs: 12_000/g)).toHaveLength(2);
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain("aria-busy={loading}");
    expect(source).toContain("Try again");
    expect(source).toContain("It is not being reported as clear.");
    expect(source.indexOf('if (bucket === "pending")')).toBeLessThan(
      source.indexOf("if (!triage) return []"),
    );
  });

  it("gives failed browser handoffs two useful recovery destinations", () => {
    const source = read("src/pages/BrowserHandoffBridge.tsx");
    expect(source).toContain('{ href: "/studio", label: "Return to Studio" }');
    expect(source).toContain(
      '{ href: "/connections", label: "Open Connections", variant: "secondary" }',
    );
  });

  it("collapses compact template filters into one labeled control", () => {
    const source = read("src/components/AgentTemplates.tsx");
    expect(source).toContain("<select");
    expect(source).toContain("Template category");
    expect(source).toContain('className="hidden gap-1.5 sm:flex sm:flex-wrap"');
  });

  it("gives each compact Insights tab group its own readable scroll lane", () => {
    const chrome = read("src/components/layout/AppChromeSubTabs.tsx");
    const tabs = read("src/components/layout/ClientSubTabs.tsx");
    expect(chrome).toContain("flex-col items-stretch");
    expect(chrome).toContain("sm:flex-row sm:flex-wrap sm:items-center");
    expect(chrome.match(/w-full min-w-0 justify-start overflow-x-auto/g)).toHaveLength(2);
    expect(tabs).toContain("min-w-max items-center");
    expect(tabs).toContain("scrollIntoView");
  });

  it("waits for any visible busy surface before taking release evidence", () => {
    const harness = read("scripts/capture-prod-visual-qa.mjs");
    expect(harness).toContain(
      `'[aria-busy="true"], [data-route-loading="true"], [aria-label="Loading workspace"]'`,
    );
  });

  it("keeps short-phone hero actions visible without changing taller or desktop layouts", () => {
    const responsive = read("src/styles/responsive.css");
    expect(responsive).toContain("@media (max-width: 639px) and (max-height: 700px)");
    expect(responsive).toContain(".marketing-hero:not(.wireline-home-hero)");
    expect(responsive).toContain("font-size: 2rem !important");
    expect(responsive).toContain("margin-top: 1.25rem !important");
    expect(responsive).toContain("@media (max-width: 380px)");
    expect(responsive).toContain("white-space: normal !important");
    const verticals = read("src/data/vertical-wedges.ts");
    expect(verticals).toContain('eyebrow: "For Real Estate"');
    expect(verticals).toContain('eyebrow: "For Restaurants"');
  });
});
