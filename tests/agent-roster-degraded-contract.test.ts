import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

/** Files that branch on an empty agent roster and offer a "create one" path. */
function rosterEmptyStateSurfaces(): string[] {
  const emptyBranch = /\b\w*[Aa]gents\.length === 0\b|!\w*agents\.length\b/;
  return tsxFiles(SRC)
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("/studio?create=1") && emptyBranch.test(source);
    })
    .map((file) => relative(process.cwd(), file))
    .sort();
}

describe("agent roster: empty versus unreachable", () => {
  it("covers the surfaces that make a claim about the roster", () => {
    // Guards the scan itself: if this list empties out because a pattern moved,
    // the invariant below would pass vacuously.
    const surfaces = rosterEmptyStateSurfaces();
    expect(surfaces.length).toBeGreaterThanOrEqual(5);
    expect(surfaces).toContain("src/components/StudioWorkspaceV2.tsx");
    expect(surfaces).toContain("src/pages/KnowledgePage.tsx");
  });

  it("never presents an unreachable roster as an empty one", () => {
    // `agents.length === 0` is the same value whether the workspace has no
    // agents or the request for them failed, and the two mean opposite things.
    // Acting on the wrong one costs real money: the offered next step is to
    // create an agent, which consumes billed capacity to duplicate one that
    // already exists. Any surface making that claim has to consult `degraded`.
    // Requires the flag to be used in a boolean position, not merely present:
    // destructuring it, or naming it in a comment, is not a check.
    const consulted =
      /\b\w*[Dd]egraded\s*(?:&&|\?)|&&\s*!?\w*[Dd]egraded\b|!\w*[Dd]egraded\b|\(\s*\w*[Dd]egraded\b/;
    const missing = rosterEmptyStateSurfaces().filter((file) => !consulted.test(read(file)));
    expect(missing).toEqual([]);
  });

  it("keeps one recovery component rather than a copy per surface", () => {
    const shared = read("src/components/WorkspaceRecovery.tsx");
    expect(shared).toContain("We could not load your agent roster");
    expect(shared).toContain("Retry workspace");

    // The component started out private to OverviewPage; three more surfaces
    // needed it, and duplicating the copy is how the wording drifts.
    const redefinitions = tsxFiles(SRC)
      .map((file) => relative(process.cwd(), file))
      .filter(
        (file) =>
          file !== "src/components/WorkspaceRecovery.tsx" &&
          /function WorkspaceRecovery\b/.test(read(file)),
      );
    expect(redefinitions).toEqual([]);
  });

  it("checks degraded before falling through to the first-run state", () => {
    // Order matters: the empty-state return is unconditional once reached, so a
    // degraded check placed after it never runs.
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const recovery = studio.indexOf("agents.length === 0 && degraded");
    const emptyState = studio.indexOf("return <StudioEmptyState");
    expect(recovery).toBeGreaterThan(-1);
    expect(recovery).toBeLessThan(emptyState);

    const dial = read("src/components/OutboundDialDialog.tsx");
    const dialGuard = dial.indexOf("voiceAgents.length === 0 && degraded");
    // Asserted present before it is ordered: a missing anchor is indexOf -1,
    // which compares "less than" everything and passes a deleted guard.
    expect(dialGuard).toBeGreaterThan(-1);
    expect(dialGuard).toBeLessThan(dial.indexOf("No voice agents with a phone line yet"));

    const knowledge = read("src/pages/KnowledgePage.tsx");
    expect(knowledge).toContain(
      "degraded ? <WorkspaceRecovery onRetry={refresh} /> : <EmptyKnowledge />",
    );
  });

  it("still offers the create path when the roster is genuinely empty", () => {
    // The fix must not swallow the first-run experience, which is the whole
    // point of these surfaces for a new workspace.
    expect(read("src/components/StudioWorkspaceV2.tsx")).toContain(
      "return <StudioEmptyState posture={accountType} />",
    );
    expect(read("src/components/PhoneSetupPanel.tsx")).toContain(
      "agents.length === 0 && !agentsDegraded",
    );
    expect(read("src/components/OutboundDialDialog.tsx")).toContain(
      "Create and activate one in Studio",
    );
  });
});
