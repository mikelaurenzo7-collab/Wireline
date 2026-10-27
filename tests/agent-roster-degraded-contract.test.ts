import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { agentLineStatus, agentReadinessLabel } from "../src/lib/agent-readiness";

const SRC = resolve(process.cwd(), "src");
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function rosterEmptyStateSurfaces(): string[] {
  const emptyBranch = /\b\w*[Aa]gents\.length === 0\b|!\w*agents\.length\b/;
  return tsxFiles(SRC)
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("/studio?create=1") && emptyBranch.test(source);
    })
    .map((file) => relative(process.cwd(), file).replaceAll("\\", "/"))
    .sort();
}

describe("Bot roster: empty versus unreachable", () => {
  it("covers the surfaces that make a claim about the roster", () => {
    const surfaces = rosterEmptyStateSurfaces();
    // Keep the discovery broad enough that this contract cannot pass vacuously,
    // while allowing the 2026 workspace consolidation to remove duplicate
    // roster surfaces without forcing a phantom replacement.
    expect(surfaces.length).toBeGreaterThanOrEqual(4);
    expect(surfaces).toContain("src/components/StudioWorkspaceV2.tsx");
    expect(surfaces).toContain("src/components/OutboundDialDialog.tsx");
    expect(surfaces).toContain("src/components/insights/shared.tsx");
    expect(surfaces).toContain("src/pages/KnowledgePage.tsx");
  });

  it("never presents an unreachable roster as an empty one", () => {
    const consulted =
      /\b\w*[Dd]egraded\s*(?:&&|\?)|&&\s*!?\w*[Dd]egraded\b|!\w*[Dd]egraded\b|\(\s*\w*[Dd]egraded\b/;
    const missing = rosterEmptyStateSurfaces().filter((file) => !consulted.test(read(file)));
    expect(missing).toEqual([]);
  });

  it("keeps one recovery component rather than a copy per surface", () => {
    const shared = read("src/components/WorkspaceRecovery.tsx");
    expect(shared).toContain("We could not load your agent roster");
    expect(shared).toContain("Retry Workspace");

    const redefinitions = tsxFiles(SRC)
      .map((file) => relative(process.cwd(), file).replaceAll("\\", "/"))
      .filter(
        (file) =>
          file !== "src/components/WorkspaceRecovery.tsx" &&
          /function WorkspaceRecovery\b/.test(read(file)),
      );
    expect(redefinitions).toEqual([]);
  });

  it("checks degraded before falling through to first run", () => {
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const recoveryGuard = studio.indexOf("if (agents.length === 0 && degraded)");
    const emptyGuard = studio.indexOf("if (agents.length === 0)");
    expect(recoveryGuard).toBeGreaterThan(-1);
    expect(emptyGuard).toBeGreaterThan(-1);
    expect(recoveryGuard).toBeLessThan(emptyGuard);
    expect(studio.slice(recoveryGuard, emptyGuard)).toContain("WorkspaceRecovery");
    expect(studio.slice(emptyGuard)).toContain("StudioEmptyState");

    const dial = read("src/components/OutboundDialDialog.tsx");
    const dialGuard = dial.indexOf("agents.length === 0 && (degraded || phoneLookupDegraded)");
    const dialEmptyState = dial.indexOf("agents.length === 0 ? (");
    expect(dialGuard).toBeGreaterThan(-1);
    expect(dialEmptyState).toBeGreaterThan(-1);
    expect(dialGuard).toBeLessThan(dialEmptyState);

    expect(existsSync("src/pages/OverviewPage.tsx")).toBe(false);
    expect(read("src/routes/AppRoutes.tsx")).toContain(
      'path="/overview" element={<ToStudioRedirect />}',
    );
  });

  it("still offers the unified create path when the roster is genuinely empty", () => {
    expect(read("src/components/StudioWorkspaceV2.tsx")).toContain("return <StudioEmptyState />");
    const phoneSetup = read("src/components/PhoneSetupPanel.tsx");
    const degradedBranch = phoneSetup.indexOf(") : agentsDegraded ? (");
    const createBranch = phoneSetup.indexOf('<Link to="/studio?create=1">Create Bot</Link>');
    expect(degradedBranch).toBeGreaterThan(-1);
    expect(createBranch).toBeGreaterThan(-1);
    expect(degradedBranch).toBeLessThan(createBranch);
    expect(read("src/components/OutboundDialDialog.tsx")).toContain(
      "Create a Bot",
    );
    expect(existsSync("src/components/overview/FirstRunWorkspace.tsx")).toBe(false);
    expect(read("src/components/StudioWorkspaceV2.tsx")).toContain('to="/studio?create=1"');
    expect(read("src/components/StudioWorkspaceV2.tsx")).not.toContain("posture=");
  });
});

describe("Bot line readiness: attached, absent, or unknown", () => {
  it("separates a missing line from an unanswerable question", () => {
    const withLine = { phone_number: "+15555550123" };
    const withoutLine = { phone_number: null };

    expect(agentLineStatus(withLine, false)).toBe("live");
    expect(agentLineStatus(withoutLine, false)).toBe("needs-setup");
    expect(agentLineStatus(withoutLine, true)).toBe("unavailable");
    expect(agentLineStatus(undefined, true)).toBe("unavailable");
    expect(agentLineStatus(withLine, true)).toBe("live");

    expect(agentReadinessLabel(withLine, false)).toBe("Live");
    expect(agentReadinessLabel(withoutLine, false)).toBe("No phone number");
    expect(agentReadinessLabel(withoutLine, true)).not.toBe("No phone number");
  });

  it("keeps the visible readiness surface on the shared helper", () => {
    expect(existsSync("src/components/overview/OverviewRail.tsx")).toBe(false);
    const chrome = read("src/components/studio/StudioContextChrome.tsx");
    expect(chrome).toContain("agentReadinessLabel(");
    expect(chrome).not.toMatch(/phone_number\s*\?\s*"Live"\s*:\s*"No phone number"/);
    expect(read("src/components/WorkspaceShell.tsx")).not.toContain("Needs setup");
  });

  it("says on screen when the line lookup is what failed", () => {
    const history = read("src/components/PhoneCallHistoryPanel.tsx");
    const chrome = read("src/components/studio/StudioContextChrome.tsx");
    expect(history).toContain('title="Line Status Unavailable"');
    expect(chrome).toContain("agentReadinessLabel(activeAgent, phoneLookupDegraded)");

    const dial = read("src/components/OutboundDialDialog.tsx");
    expect(dial).toContain("(degraded || phoneLookupDegraded)");
  });
});
