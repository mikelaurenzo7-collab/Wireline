import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_DIRECTION_GUIDANCE,
  GUIDED_AGENT_LEARNING_LOOP,
  scoreCallPlanReadiness,
} from "../src/lib/guided-agent-learning";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("guided agent learning", () => {
  it("keeps the setup method focused on ask, teach, capture, check", () => {
    expect(GUIDED_AGENT_LEARNING_LOOP.map((item) => item.step)).toEqual([
      "Ask",
      "Teach",
      "Capture",
      "Check",
    ]);
  });

  it("teaches the three call directions before setup details", () => {
    expect(AGENT_DIRECTION_GUIDANCE.outbound.loop).toEqual(["List", "Script", "Dial", "Log"]);
    expect(AGENT_DIRECTION_GUIDANCE.inbound.loop).toEqual([
      "Route",
      "Answer",
      "Resolve",
      "Log",
    ]);
    expect(AGENT_DIRECTION_GUIDANCE.hybrid.loop).toEqual([
      "Answer",
      "Act",
      "Follow up",
      "Sync",
    ]);
  });

  it("requires a concrete call plan before launch save", () => {
    const weakPlan = scoreCallPlanReadiness({
      purpose: "Sales",
      caller: "Prospects",
      outcome: "Book",
      handoff: "Ask me",
      boundaries: "Be good",
    });
    expect(weakPlan.every((item) => item.ready)).toBe(false);

    const readyPlan = scoreCallPlanReadiness({
      purpose: "Qualify outbound sales calls and book approved next conversations.",
      caller: "Prospects from approved campaign lists and returning customers.",
      outcome: "Capture the need, qualify fit, and book the next meeting when appropriate.",
      handoff: "Escalate pricing exceptions, angry callers, and enterprise requests to a person.",
      boundaries: "Never promise discounts, implementation dates, or features that are not confirmed.",
    });
    expect(readyPlan.every((item) => item.ready)).toBe(true);
  });

  it("wires the guidance into the real call plan builder", () => {
    const blueprint = read("src/components/PhoneAgentBlueprint.tsx");
    expect(blueprint).toContain("AGENT_DIRECTION_GUIDANCE");
    expect(blueprint).toContain("GUIDED_AGENT_LEARNING_LOOP");
    expect(blueprint).toContain("scoreCallPlanReadiness");
    expect(blueprint).toContain('aria-label="Call direction"');
    expect(blueprint).toContain('aria-label="Launch readiness"');
    expect(blueprint).toContain("Choose direction first");
  });
});
