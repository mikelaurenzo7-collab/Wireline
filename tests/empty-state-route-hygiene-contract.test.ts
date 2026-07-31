import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("empty-state route hygiene", () => {
  it("routes phone/SMS/attribution empty CTAs to live settings paths", () => {
    const ops = read("src/lib/wireline-ops-design.ts");
    const overview = read("src/pages/OverviewPage.tsx");
    const shell = read("src/components/WorkspaceShell.tsx");
    const readiness = read("src/lib/agent-readiness.ts");
    const routes = read("src/routes/AppRoutes.tsx");
    const sms = read("src/components/SmsThreads.tsx");
    const livePreview = read("src/components/AgentPresenceLivePreview.tsx");

    expect(ops).not.toContain("/settings?tab=carrier");
    expect(ops).toContain('to: "/settings/phone"');
    expect(ops).not.toMatch(/to: "\/agents"/);
    expect(ops).toContain("directorAssistHref");
    expect(ops).toContain("`/studio?agent=");
    expect(ops).toContain("&command=");
    expect(ops).not.toContain("&prompt=");

    expect(overview).toContain('primaryHref: "/settings/phone"');
    expect(overview).toContain('primaryLabel: "Connect phone"');

    // The sidebar still labels line readiness, but the wording moved to the
    // shared helper when a third state ("unavailable") was added — OverviewPage
    // had its own copy of the same two-state string and they had to agree.
    expect(shell).toContain("agentReadinessLabel(");
    expect(readiness).toContain('"Live"');
    expect(readiness).toContain('"Needs setup"');
    expect(shell).not.toMatch(/phone_number \? "Active" : "Training"/);

    expect(routes).toContain("AgentsToStudioRedirect");
    expect(routes).toContain("`/studio${location.search}${location.hash}`");

    expect(sms).toContain('<Link to="/settings/phone">Review SMS setup</Link>');
    expect(sms).not.toContain('<a href="/settings/phone">Review SMS setup</a>');

    expect(livePreview).toContain('to="/settings/billing"');
    expect(livePreview).not.toContain('href="/settings/billing"');
  });
});
