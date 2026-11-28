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
      // An empty roster sends the owner to meet Bo: the onboarding itself, or
      // an "Open Workspace" link from a surface that needs a Bot first.
      return (
        (source.includes("<BoOnboarding") || source.includes("Open Workspace")) &&
        emptyBranch.test(source)
      );
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
    expect(surfaces).toContain("src/pages/AgentStudioHome.tsx");
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
    // The Workspace never draws a create screen; AgentStudioHome shows Bo's
    // onboarding only for a loaded, reachable, empty roster.
    expect(studio.slice(emptyGuard, emptyGuard + 80)).toContain("<StudioLoadingState />");
    const home = read("src/pages/AgentStudioHome.tsx");
    expect(home).toContain("!loading &&\n    !degraded &&");

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

  it("sends a genuinely empty roster to meet Bo, never to a create dialog", () => {
    expect(read("src/pages/AgentStudioHome.tsx")).toContain("agents.length === 0 ||");
    const phoneSetup = read("src/components/PhoneSetupPanel.tsx");
    const degradedBranch = phoneSetup.indexOf(") : agentsDegraded ? (");
    const meetBranch = phoneSetup.indexOf('<Link to="/studio">Open Workspace</Link>');
    expect(degradedBranch).toBeGreaterThan(-1);
    expect(meetBranch).toBeGreaterThan(-1);
    expect(degradedBranch).toBeLessThan(meetBranch);
    expect(read("src/components/OutboundDialDialog.tsx")).toContain("Meet your Bot");
    expect(existsSync("src/components/overview/FirstRunWorkspace.tsx")).toBe(false);
    for (const path of ["src/components/StudioWorkspaceV2.tsx", "src/pages/AgentStudioHome.tsx"]) {
      expect(read(path)).not.toContain("create=1");
      expect(read(path)).not.toContain("posture=");
    }
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
