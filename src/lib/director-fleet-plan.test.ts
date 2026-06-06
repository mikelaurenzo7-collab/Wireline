import { describe, it, expect } from "vitest";
import { DirectorEmptyPlanError, normalizeDirectorFleetPlan } from "./director-fleet-plan";
import type { DirectorFleetAgent } from "./director-planner";

const FLEET: DirectorFleetAgent[] = [
  { id: "agent-1", name: "Ava", role: "sales" },
  { id: "agent-2", name: "Max", role: "scheduler" },
];

describe("normalizeDirectorFleetPlan — actions & integration jobs", () => {
  it("normalizes comms actions with agent_id fallback to first fleet agent", () => {
    const plan = normalizeDirectorFleetPlan(
      {
        reply: "I'll text them now — approve when ready.",
        actions: [
          {
            kind: "send_text_message",
            label: "Follow-up text",
            to: "+15551234567",
            body: "Hi — checking in on your quote.",
          },
          {
            kind: "make_call",
            label: "Call lead",
            agent_id: "agent-2",
            to: "+15559876543",
            context: "Confirm tomorrow's appointment",
          },
        ],
      },
      FLEET,
    );
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0].agentId).toBe("agent-1");
    expect(plan.actions[1].agentId).toBe("agent-2");
    expect(plan.actions[1].kind).toBe("make_call");
  });

  it("normalizes integration_jobs with query", () => {
    const plan = normalizeDirectorFleetPlan(
      {
        reply: "CRM lookup queued.",
        integration_jobs: [
          {
            tool: "crm_search_contacts",
            label: "Find contact",
            summary: "Look up HVAC lead in CRM",
            query: "Jordan Lee Austin HVAC",
          },
        ],
      },
      FLEET,
    );
    expect(plan.integrationJobs).toHaveLength(1);
    expect(plan.integrationJobs[0].tool).toBe("crm_search_contacts");
    expect(plan.integrationJobs[0].query).toContain("Jordan");
  });

  it("dedupes integration jobs by tool + query", () => {
    const plan = normalizeDirectorFleetPlan(
      {
        reply: "x",
        integration_jobs: [
          { tool: "crm_search_contacts", label: "A", summary: "one", query: "a" },
          { tool: "crm_search_contacts", label: "B", summary: "two", query: "b" },
          { tool: "crm_search_contacts", label: "C", summary: "one", query: "a" },
        ],
      },
      FLEET,
    );
    expect(plan.integrationJobs).toHaveLength(2);
    expect(plan.integrationJobs[0].step).toBe(1);
    expect(plan.integrationJobs[1].step).toBe(2);
  });

  it("throws on empty reply for deliverable intents", () => {
    expect(() =>
      normalizeDirectorFleetPlan(
        { reply: "" },
        FLEET,
        "Design a one-page website for a local HVAC company",
      ),
    ).toThrow(DirectorEmptyPlanError);
  });

  it("accepts gemini_ground web research integration jobs", () => {
    const plan = normalizeDirectorFleetPlan(
      {
        reply: "I'll run a competitor scan — approve when ready.",
        integration_jobs: [
          {
            tool: "gemini_ground",
            label: "Web search",
            summary: "Competitor scan",
            query: "top HVAC Austin pricing",
          },
        ],
      },
      FLEET,
    );
    expect(plan.integrationJobs).toHaveLength(1);
    expect(plan.integrationJobs[0].tool).toBe("gemini_ground");
    expect(plan.integrationJobs[0].query).toContain("HVAC");
  });
});
