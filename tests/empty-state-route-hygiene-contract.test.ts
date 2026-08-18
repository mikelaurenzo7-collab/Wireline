import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("empty-state route hygiene", () => {
  it("routes Bot creation, phone setup, SMS, and attribution to their live owners", () => {
    const ops = read("src/lib/wireline-ops-design.ts");
    const overview = read("src/pages/OverviewPage.tsx");
    const firstRun = read("src/components/overview/FirstRunWorkspace.tsx");
    const shell = read("src/components/WorkspaceShell.tsx");
    const readiness = read("src/lib/agent-readiness.ts");
    const routes = read("src/routes/AppRoutes.tsx");
    const sms = read("src/components/SmsThreads.tsx");

    expect(ops).not.toContain("/settings?tab=carrier");
    expect(ops).toContain('to: "/settings/phone"');
    expect(ops).not.toMatch(/to: "\/agents"/);
    expect(ops).toContain("directorAssistHref");
    expect(ops).toContain("`/studio?agent=");
    expect(ops).toContain("&command=");
    expect(ops).not.toContain("&prompt=");

    expect(overview).toContain("<FirstRunWorkspace />");
    expect(firstRun).toContain('to="/studio?create=1"');
    expect(firstRun).toContain('to="/templates"');
    expect(firstRun).toContain("Create Your Own");
    expect(firstRun).toContain("Browse Templates");
    expect(firstRun).not.toContain("posture=");

    expect(shell).toContain("agentReadinessLabel(");
    expect(readiness).toContain('"Live"');
    expect(readiness).toContain('"Needs setup"');
    expect(shell).not.toMatch(/phone_number \? "Active" : "Training"/);

    expect(routes).toContain("AgentsToStudioRedirect");
    expect(routes).toContain("`/studio${location.search}${location.hash}`");

    expect(sms).toContain('<Link to="/settings/phone">Review SMS setup</Link>');
    expect(sms).not.toContain('<a href="/settings/phone">Review SMS setup</a>');

    expect(existsSync("src/components/AgentPresenceLivePreview.tsx")).toBe(false);
  });
});
