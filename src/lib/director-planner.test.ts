import { describe, it, expect } from "vitest";
import {
  resolveDirectorMaxTokens,
  wantsDeepAnalysis,
  wantsFleetAudit,
  wantsOpusModel,
} from "./director-deep-analysis";
import { normalizeDirectorPlan, type DirectorFleetAgent } from "./director-planner";

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
    expect(wantsOpusModel("help me strategize for Q3")).toBe(true);
  });

  it("stays on Sonnet for ordinary turns", () => {
    expect(wantsDeepAnalysis("hi")).toBe(false);
    expect(wantsDeepAnalysis("what agent should I hire first?")).toBe(false);
    expect(wantsDeepAnalysis("turn on SMS for Ava")).toBe(false);
  });

  it("uses Opus without adaptive thinking for heavy deliverables", () => {
    expect(wantsOpusModel("Draft a one-page business plan for my company")).toBe(true);
    expect(wantsOpusModel("Research competitors and pricing in my market")).toBe(true);
    expect(wantsDeepAnalysis("Draft a one-page business plan for my company")).toBe(false);
  });

  it("keeps website and routine code on Sonnet for latency", () => {
    expect(wantsOpusModel("Design a new website for my dental practice")).toBe(false);
    expect(wantsDeepAnalysis("Design a new website for my dental practice")).toBe(false);
    expect(wantsOpusModel("Write a TypeScript API route with Zod validation")).toBe(false);
  });

  it("does not auto-Opus fleet audits without the Deep toggle", () => {
    expect(wantsDeepAnalysis("Audit my whole fleet please")).toBe(true);
    expect(wantsOpusModel("Audit my whole fleet please")).toBe(false);
  });
});

describe("wantsFleetAudit — fast Sonnet path", () => {
  it("detects starter fleet audit copy", () => {
    expect(wantsFleetAudit("Audit my fleet — what should I fix first?")).toBe(true);
    expect(wantsFleetAudit("Review my agents and tell me priorities")).toBe(true);
  });

  it("does not steal competitor research prompts", () => {
    expect(wantsFleetAudit("Research competitors and pricing in my market")).toBe(false);
  });

  it("caps output tokens for routine fleet audits", () => {
    expect(resolveDirectorMaxTokens({ opus: false, longDeliverable: false, fleetAudit: true })).toBe(
      1600,
    );
  });
});

describe("normalizeDirectorPlan — reply", () => {
  it("falls back to a default reply when missing/empty", () => {
    expect(normalizeDirectorPlan({}, FLEET, "sonnet").reply).toMatch(/orchestrate/i);
    expect(normalizeDirectorPlan({ reply: "   " }, FLEET, "sonnet").reply).toMatch(/orchestrate/i);
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

  it("only keeps focus_agent for agents the operator owns", () => {
    const plan = normalizeDirectorPlan(
      {
        reply: "Coach Ava.",
        suggestions: [
          { kind: "focus_agent", label: "Coach Ava", agentId: "agent-1" },
          { kind: "focus_agent", label: "Ghost", agentId: "does-not-exist" },
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

  it("preserves suggestion labels up to 80 characters", () => {
    const longLabel = "Train an agent to use the CRM integration for inbound leads";
    const plan = normalizeDirectorPlan(
      {
        reply: "x",
        suggestions: [{ kind: "open_training", label: longLabel }],
      },
      FLEET,
      "sonnet",
    );
    expect(plan.suggestions[0]?.label).toBe(longLabel);
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
