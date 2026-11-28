import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

/**
 * Guards the async execution spine: voice webhooks → job queue → worker → action engine
 * → tool dispatch → Studio canvas orchestration. Source-scan only — no live vendor calls.
 */
describe("orchestration spine contract", () => {
  it("keeps job worker wired to action engine and cadence processing", () => {
    const worker = read("src/lib/job-worker-base.ts");
    const queue = read("src/lib/job-queue-base.ts");

    expect(worker).toContain('from "./action-engine"');
    expect(worker).toContain("executeAction");
    expect(queue).toContain('"execute_action"');
    expect(queue).toContain('"cadence_tick"');
    expect(queue).toContain('"vapi_webhook"');
    expect(queue).toContain('"v2a_action_extraction"');
  });

  it("routes live tool calls through agent dispatch handlers", () => {
    const dispatch = read("src/lib/agent-tool-dispatch.ts");
    expect(dispatch).toContain("dispatchAgentToolCall");
    expect(read("src/lib/bot-tools/workflow.ts")).toContain("export");
    expect(read("src/server/register-api-routes.ts")).toContain('app.use("/api/jobs"');
  });

  it("composes Studio as the orchestrator across workspace surfaces", () => {
    const contract = read("src/lib/studio-canvas-contract.ts");
    const studioHome = read("src/pages/AgentStudioHome.tsx");
    const canvas = read("src/components/StudioWorkspaceV2.tsx");

    expect(contract).toContain("canvas-orchestrator");
    expect(studioHome).toContain("StudioWorkspaceV2");
    expect(canvas).toContain("StudioAgentWorkspacePanel");
    expect(canvas).toContain("StudioWorkroom");
    expect(canvas).toContain("StudioAgentReviewPanel");
  });

  it("preserves the activation handoff from Bo's creation through Bo's onboarding", () => {
    const studioHome = read("src/pages/AgentStudioHome.tsx");
    const bo = read("src/components/onboarding/BoOnboarding.tsx");
    const state = read("src/lib/bo-onboarding.ts");

    expect(bo).toContain('writeBoOnboarding(userId, { agentId: id, step: "about" });');
    expect(state).toContain('"wireline:bo-onboarding:v1:"');
    expect(studioHome).toContain("readBoOnboarding(user?.id)");
    expect(bo).toContain("useChannelEntitlements()");
    expect(bo).toContain('access.includes("voice")');
  });

  it("exposes mobile and extension handoff entrypoints", () => {
    expect(read("src/routes/mobile-routes.ts")).toContain("/api/mobile");
    expect(read("src/pages/BrowserHandoffBridge.tsx")).toContain("/studio/handoff");
    expect(read("apps/browser-extension/README.md")).toMatch(/BotBound Command/i);
  });
});
