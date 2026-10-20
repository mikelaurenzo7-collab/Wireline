import { describe, expect, it } from "vitest";
import {
  compileAgentRuntimeInstructions,
  normalizeAgentCustomization,
} from "./agent-customization";

describe("customizable agent profile", () => {
  it("preserves a personal assistant role across all MCP client sources", () => {
    for (const source of ["chatgpt_mcp", "claude_mcp", "cursor_mcp"] as const) {
      const profile = normalizeAgentCustomization(
        { business_name: "Alex", role: "personal_assistant" },
        source,
      );
      expect(profile.identity).toMatchObject({
        name: "Alex Assistant",
        role: "personal_assistant",
        businessName: "Alex",
      });
      expect(profile.lifecycle).toBe("draft");
      expect(profile.source).toBe(source);
      expect(profile.mission.primaryGoal).toContain("personal coordination");
    }
  });
  it("normalizes user customization into a bounded canonical profile", () => {
    const profile = normalizeAgentCustomization({
      agent_name: "  Ava  ",
      business_name: " Northstar HVAC ",
      role: "receptionist",
      primary_goal: "Capture after-hours emergencies and estimate requests.",
      tone: "calm and professional",
      rules: ["Ask for ZIP code.", "Ask for ZIP code.", "Never quote a price."],
      allowed_actions: ["Offer an estimate callback", "Offer an estimate callback"],
      prohibited_topics: ["Medical advice"],
      escalation_policy: "handoff_when_configured",
      knowledge_summary:
        "Emergency service is available for active leaks and no heat in freezing weather.",
    });

    expect(profile.identity).toEqual({
      name: "Ava",
      businessName: "Northstar HVAC",
      role: "receptionist",
      tone: "calm and professional",
    });
    expect(profile.behavior.rules).toEqual(["Ask for ZIP code.", "Never quote a price."]);
    expect(profile.behavior.allowedActions).toEqual(["Offer an estimate callback"]);
    expect(profile.lifecycle).toBe("draft");
    expect(profile.source).toBe("chatgpt_mcp");
  });

  it("compiles custom controls into runtime instructions without promising external actions", () => {
    const profile = normalizeAgentCustomization({
      business_name: "Northstar HVAC",
      role: "scheduler",
      primary_goal: "Schedule estimate requests.",
      allowed_actions: ["Offer available estimate windows"],
      rules: ["Ask for service address before proposing a next step."],
      escalation_policy: "take_message",
    });
    const prompt = compileAgentRuntimeInstructions(profile);

    expect(prompt).toContain("Schedule estimate requests.");
    expect(prompt).toContain("Ask for service address before proposing a next step.");
    expect(prompt).toContain("Never claim an appointment was booked");
    expect(prompt).toContain("No external action is assumed");
  });

  it("uses safe defaults when a client omits optional customization", () => {
    const profile = normalizeAgentCustomization({
      business_name: "Northstar HVAC",
      primary_goal: "Answer calls",
    });

    expect(profile.identity.role).toBe("receptionist");
    expect(profile.behavior.rules.length).toBeGreaterThan(0);
    expect(profile.behavior.escalationPolicy).toBe("take_message");
  });
});
