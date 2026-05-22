import { describe, expect, it } from "vitest";
import {
  validatePlaybookCoverage,
  getAllIntegrationPlaybooks,
  getIntegrationPlaybook,
  EMAIL_INBOUND_TASKS,
} from "./integration-playbooks";
import { AGENT_TOOL_CATALOG } from "./agent-capabilities";

describe("integration-playbooks", () => {
  it("covers every catalog tool that declares an integration", () => {
    const gaps = validatePlaybookCoverage();
    expect(gaps).toEqual([]);
  });

  it("defines a playbook for each ToolIntegration key in the catalog", () => {
    const integrations = new Set(AGENT_TOOL_CATALOG.map((t) => t.integration).filter(Boolean));
    for (const key of integrations) {
      expect(getIntegrationPlaybook(key!)).toBeDefined();
    }
  });

  it("has at least one caller-moment task per integration", () => {
    for (const pb of getAllIntegrationPlaybooks()) {
      expect(pb.tasks.length).toBeGreaterThan(0);
      for (const task of pb.tasks) {
        expect(task.callerMoment.length).toBeGreaterThan(0);
        expect(task.agentAction.length).toBeGreaterThan(0);
        expect(task.tools.length).toBeGreaterThan(0);
      }
    }
  });

  it("documents inbound email tasks for the hub", () => {
    expect(EMAIL_INBOUND_TASKS.length).toBeGreaterThanOrEqual(2);
  });
});
