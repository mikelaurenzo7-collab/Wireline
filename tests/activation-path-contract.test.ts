import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("activation path contract", () => {
  it("routes fresh signups into studio create flow", () => {
    const authRedirect = read("src/lib/auth-redirect.ts");
    expect(authRedirect).toContain("/studio?create=1");
  });

  it("documents ops activation checklist", () => {
    const doc = read("docs/OPS_CREDENTIALS_CHECKLIST_2026-07-07.md");
    expect(doc).toContain("FEDERAL_DNC");
    expect(doc).toContain("SENTRY_DSN");
  });

  it("mounts activation checklist on overview", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    expect(overview).toContain("ActivationChecklist");
  });

  it("aligns activation checklist with fleet setup progress (4 steps, live call gate)", () => {
    const checklist = read("src/components/ActivationChecklist.tsx");
    const progress = read("src/lib/fleet-setup-progress.ts");
    expect(progress).toContain("FLEET_SETUP_STEP_COUNT = 4");
    expect(checklist).toContain('id: "live"');
    expect(checklist).not.toContain('id: "test"');
    expect(checklist).toContain("does not count toward activation");
  });

  it("surfaces per-agent launch readiness across active setup flows", () => {
    const card = read("src/components/AgentLaunchReadinessCard.tsx");
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const workroom = read("src/components/StudioWorkroom.tsx");
    const canvas = read("src/components/StudioAgentCanvas.tsx");
    const knowledge = read("src/pages/KnowledgePage.tsx");
    const connections = read("src/pages/ConnectionsPage.tsx");
    const health = read("src/lib/launch-readiness.ts");

    expect(card).toContain("buildAgentLaunchReadiness");
    expect(card).toContain("Name, role, purpose");
    expect(card).toContain("Training material");
    expect(card).toContain("Escalation / handoff");
    expect(card).toContain("Outbound consent posture");
    expect(card).toContain("Phone / channel wiring");
    expect(card).toContain("Usage entitlement");
    expect(card).toContain("Test call / simulation");
    expect(card).toContain("/settings/billing");
    expect(health).toContain("USER_FACING_AGENT_LAUNCH_CHECKS");
    expect(health).toContain("user_facing_agent_checks");
    expect(card).toContain("tab=simulator");
    expect(studio).toContain("agentPhoneNumber={active.phone_number}");
    expect(workroom).toContain("AgentLaunchReadinessCard");
    expect(canvas).toContain("AgentLaunchReadinessCard");
    expect(knowledge).toContain("AgentLaunchReadinessCard");
    expect(connections).toContain("AgentLaunchReadinessCard");
  });
});
