import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("empty-state route hygiene", () => {
  it("routes Bot creation, phone setup, SMS, and attribution to their live owners", () => {
    const ops = read("src/lib/wireline-ops-design.ts");
    const shell = read("src/components/WorkspaceShell.tsx");
    const studioChrome = read("src/components/studio/StudioContextChrome.tsx");
    const readiness = read("src/lib/agent-readiness.ts");
    const routes = read("src/routes/AppRoutes.tsx");
    const sms = read("src/components/SmsThreads.tsx");

    expect(ops).not.toContain("/settings?tab=carrier");
    expect(ops).toContain('to: "/phone?tab=lines"');
    expect(ops).not.toContain('to: "/overview');
    expect(ops).not.toMatch(/to: "\/agents"/);
    expect(ops).toContain("directorAssistHref");
    expect(ops).toContain("`/studio?agent=");
    expect(ops).toContain("&command=");
    expect(ops).not.toContain("&prompt=");

    expect(shell).toContain('data-wireline-bot-selected="true"');
    expect(shell).toContain("Current Bot");
    expect(shell).not.toContain("agentReadinessLabel(");
    expect(studioChrome).toContain("agentReadinessLabel(activeAgent, phoneLookupDegraded)");
    expect(studioChrome).toContain("agentLineStatus(activeAgent, phoneLookupDegraded)");
    expect(readiness).toContain('"Live"');
    expect(readiness).toContain('"Status unavailable"');
    expect(readiness).toContain('"No phone number"');
    expect(studioChrome).not.toMatch(/phone_number\s*\?\s*"Live"\s*:\s*"No phone number"/);

    expect(routes).toContain("function ToStudioRedirect()");
    expect(routes).toContain('path="/agents" element={<ToStudioRedirect />}');
    expect(routes).toContain("`/studio${location.search}${location.hash}`");

    expect(sms).toContain('aria-label="Text inbox"');
    expect(sms).toMatch(
      /const endpoint = agentId\s*\? `\/api\/sms\/threads\?agent_id=\$\{encodeURIComponent\(agentId\)\}`/,
    );
    expect(sms).toContain('title={agentId ? "No texts for this Bot" : "No texts yet"}');
    expect(sms).not.toMatch(/href="\/settings\/phone"/);

    const insightsEmpty = read("src/components/insights/shared.tsx");
    expect(insightsEmpty).toContain(
      '{ label: "Connect Phone", to: "/phone?tab=lines", primary: true }',
    );
    expect(insightsEmpty).toContain('{ label: "Call History", to: "/phone" }');
    expect(insightsEmpty).not.toContain('to: "/studio?section=test"');

    expect(existsSync("src/components/AgentPresenceLivePreview.tsx")).toBe(false);
  });
});
