import { readdirSync, readFileSync } from "node:fs";
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
    expect(surfaces.length).toBeGreaterThanOrEqual(5);
    expect(surfaces).toContain("src/components/StudioWorkspaceV2.tsx");
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
    expect(shared).toContain("Retry workspace");

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
    const recovery = studio.indexOf("agents.length === 0 && degraded");
    const emptyState = studio.indexOf("return <StudioEmptyState");
    expect(recovery).toBeGreaterThan(-1);
    expect(recovery).toBeLessThan(emptyState);

    const dial = read("src/components/OutboundDialDialog.tsx");
    const dialGuard = dial.indexOf("voiceAgents.length === 0 && (degraded || phoneLookupDegraded)");
    expect(dialGuard).toBeGreaterThan(-1);
    expect(dialGuard).toBeLessThan(dial.indexOf("No voice agents with a phone line yet"));

    const overview = read("src/pages/OverviewPage.tsx");
    expect(overview).toContain("degraded && !hasBots");
    expect(overview).toContain("<WorkspaceRecovery onRetry={refresh} />");
  });

  it("still offers the unified create path when the roster is genuinely empty", () => {
    expect(read("src/components/StudioWorkspaceV2.tsx")).toContain("return <StudioEmptyState />");
    expect(read("src/components/PhoneSetupPanel.tsx")).toContain(
      "agents.length === 0 && !agentsDegraded",
    );
    expect(read("src/components/OutboundDialDialog.tsx")).toContain(
      "Create and activate one in Studio",
    );
    const overview = read("src/pages/OverviewPage.tsx");
    const firstRun = read("src/components/overview/FirstRunWorkspace.tsx");
    expect(overview).toContain("<FirstRunWorkspace />");
    expect(firstRun).toContain("Create Your Own");
    expect(firstRun).toContain('to="/studio?create=1"');
    expect(`${overview}\n${firstRun}`).not.toContain("posture=");
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
    expect(agentReadinessLabel(withoutLine, false)).toBe("Needs setup");
    expect(agentReadinessLabel(withoutLine, true)).not.toBe("Needs setup");
  });

  it("keeps both visible roster surfaces on the shared helper", () => {
    for (const file of [
      "src/components/overview/OverviewRail.tsx",
      "src/components/WorkspaceShell.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("agentReadinessLabel(");
      expect(source).not.toMatch(/phone_number\s*\?\s*"Live"\s*:\s*"Needs setup"/);
    }
  });

  it("says on screen when the line lookup is what failed", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    const rail = read("src/components/overview/OverviewRail.tsx");
    expect(overview).toContain("phoneLookupDegraded ? (");
    expect(overview).toContain("Line Status Unavailable");
    expect(rail).toContain("agentReadinessLabel(bot, phoneLookupDegraded)");

    const dial = read("src/components/OutboundDialDialog.tsx");
    expect(dial).toContain("(degraded || phoneLookupDegraded)");
  });
});
