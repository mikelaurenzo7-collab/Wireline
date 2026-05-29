import { describe, it, expect } from "vitest";
import {
  normalizeDirectorPlan,
  wantsDeepAnalysis,
  type DirectorFleetAgent,
} from "./director-planner";

const FLEET: DirectorFleetAgent[] = [
  { id: "agent-1", name: "Ava", role: "sales" },
  { id: "agent-2", name: "Max", role: "scheduler" },
];

describe("wantsDeepAnalysis — Opus escalation heuristic", () => {
  it("escalates on explicit deep-analysis requests", () => {
    expect(wantsDeepAnalysis("Audit my whole fleet please")).toBe(true);
    expect(wantsDeepAnalysis("Can you analyze everything and build a plan?")).toBe(true);
    expect(wantsDeepAnalysis("do a deep dive on last month")).toBe(true);
    expect(wantsDeepAnalysis("give me a full review")).toBe(true);
    expect(wantsDeepAnalysis("help me strategize for Q3")).toBe(true);
  });

  it("stays on Sonnet for ordinary turns", () => {
    expect(wantsDeepAnalysis("hi")).toBe(false);
    expect(wantsDeepAnalysis("what agent should I hire first?")).toBe(false);
    expect(wantsDeepAnalysis("turn on SMS for Ava")).toBe(false);
  });
});

describe("normalizeDirectorPlan — reply", () => {
  it("falls back to a default reply when missing/empty", () => {
    expect(normalizeDirectorPlan({}, FLEET, "sonnet").reply).toMatch(/business/i);
    expect(normalizeDirectorPlan({ reply: "   " }, FLEET, "sonnet").reply).toMatch(/business/i);
  });

  it("passes the model tier through", () => {
    expect(normalizeDirectorPlan({ reply: "hi" }, FLEET, "opus").model).toBe("opus");
    expect(normalizeDirectorPlan({ reply: "hi" }, FLEET, "sonnet").model).toBe("sonnet");
  });
});

describe("normalizeDirectorPlan — suggestions", () => {
  it("keeps allowlisted suggestion kinds and drops unknown ones", () => {
    const plan = normalizeDirectorPlan(
      {
        reply: "Here's what I'd do.",
        suggestions: [
          { kind: "create_agent", label: "Create agent" },
          { kind: "view_ops", label: "See live ops" },
          { kind: "teleport", label: "nope" },
        ],
      },
      FLEET,
      "sonnet",
    );
    expect(plan.suggestions.map((s) => s.kind)).toEqual(["create_agent", "view_ops"]);
  });

  it("only keeps open_agent_chat for agents the operator owns", () => {
    const plan = normalizeDirectorPlan(
      {
        reply: "Open Ava.",
        suggestions: [
          { kind: "open_agent_chat", label: "Open Ava", agentId: "agent-1" },
          { kind: "open_agent_chat", label: "Ghost", agentId: "does-not-exist" },
        ],
      },
      FLEET,
      "sonnet",
    );
    expect(plan.suggestions).toHaveLength(1);
    expect(plan.suggestions[0].agentId).toBe("agent-1");
  });

  it("drops suggestions without a label", () => {
    const plan = normalizeDirectorPlan(
      { reply: "x", suggestions: [{ kind: "view_ops" }] },
      FLEET,
      "sonnet",
    );
    expect(plan.suggestions).toHaveLength(0);
  });

  it("dedupes repeated suggestions and caps at 3", () => {
    const plan = normalizeDirectorPlan(
      {
        reply: "x",
        suggestions: [
          { kind: "view_ops", label: "Ops" },
          { kind: "view_ops", label: "Ops again" },
          { kind: "open_training", label: "Train" },
          { kind: "open_insights", label: "Insights" },
          { kind: "create_agent", label: "Create" },
        ],
      },
      FLEET,
      "sonnet",
    );
    expect(plan.suggestions.length).toBeLessThanOrEqual(3);
    // view_ops appears once despite two entries.
    expect(plan.suggestions.filter((s) => s.kind === "view_ops")).toHaveLength(1);
  });
});

describe("normalizeDirectorPlan — delegations", () => {
  it("keeps a valid delegation and resolves the agent name", () => {
    const plan = normalizeDirectorPlan(
      {
        reply: "On it",
        delegations: [
          {
            agent_id: "agent-1",
            channel: "call",
            label: "Call the lead",
            draft: "Call John at +1 555 010 0000 about his quote.",
          },
        ],
      },
      FLEET,
      "sonnet",
    );
    expect(plan.delegations).toHaveLength(1);
    expect(plan.delegations[0].agentName).toBe("Ava");
    expect(plan.delegations[0].channel).toBe("call");
  });

  it("drops delegations that target an agent the operator doesn't own", () => {
    const plan = normalizeDirectorPlan(
      {
        reply: "x",
        delegations: [{ agent_id: "ghost", channel: "email", label: "Email", draft: "hi" }],
      },
      FLEET,
      "sonnet",
    );
    expect(plan.delegations).toHaveLength(0);
  });

  it("drops delegations with an invalid channel or missing draft", () => {
    const plan = normalizeDirectorPlan(
      {
        reply: "x",
        delegations: [
          { agent_id: "agent-1", channel: "fax", label: "Fax", draft: "hi" },
          { agent_id: "agent-2", channel: "text", label: "Text", draft: "   " },
        ],
      },
      FLEET,
      "sonnet",
    );
    expect(plan.delegations).toHaveLength(0);
  });

  it("caps delegations at 3", () => {
    const plan = normalizeDirectorPlan(
      {
        reply: "x",
        delegations: Array.from({ length: 5 }, () => ({
          agent_id: "agent-1",
          channel: "email",
          label: "Email",
          draft: "Reach out to the customer.",
        })),
      },
      FLEET,
      "sonnet",
    );
    expect(plan.delegations.length).toBeLessThanOrEqual(3);
  });
});
