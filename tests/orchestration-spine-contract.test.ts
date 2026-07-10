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
    expect(read("src/routes/vapi/tool-handlers-workflow.ts")).toContain("export");
    expect(read("src/server/register-api-routes.ts")).toContain('app.use("/api/jobs"');
  });

  it("composes Studio as the canvas orchestrator across workspace surfaces", () => {
    const contract = read("src/lib/studio-canvas-contract.ts");
    const studioHome = read("src/pages/AgentStudioHomeClaude.tsx");

    expect(contract).toContain("canvas-orchestrator");
    expect(studioHome).toContain("StudioWorkspaceV2");
    expect(read("src/components/StudioWorkspaceV2.tsx")).toContain("StudioAgentCanvas");
    expect(read("src/components/StudioWorkspaceV2.tsx")).toContain("StudioAgentWorkspacePanel");
  });

  it("preserves activation handoff from Fast Start through post-create wizard", () => {
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const flow = read("src/lib/wireline-create-flow.ts");

    expect(createDialog).toContain("stashPostCreateWizard");
    expect(flow).toContain("wireline:post-create-wizard");
    expect(wizard).toContain("channels");
  });

  it("exposes mobile and extension handoff entrypoints", () => {
    expect(read("src/routes/mobile-routes.ts")).toContain("/api/mobile");
    expect(read("src/pages/BrowserHandoffBridge.tsx")).toContain("/studio/handoff");
    expect(read("apps/browser-extension/README.md")).toMatch(/Wireline Command/i);
  });
});
