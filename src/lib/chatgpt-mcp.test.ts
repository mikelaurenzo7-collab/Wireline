import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildChatGptWidgetHtml,
  buildDemoRealtimeInstructions,
  createDemoSpec,
  decodeDemoToken,
  encodeDemoToken,
} from "./chatgpt-mcp";

describe("chatgpt-mcp guest demo state", () => {
  const originalSecret = process.env.MCP_DEMO_STATE_SECRET;

  beforeEach(() => {
    process.env.MCP_DEMO_STATE_SECRET =
      "test-demo-secret-that-is-longer-than-thirty-two-characters";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.MCP_DEMO_STATE_SECRET;
    else process.env.MCP_DEMO_STATE_SECRET = originalSecret;
  });

  it("normalizes, signs, and restores a bounded preview specification", () => {
    const spec = createDemoSpec({
      business_name: "  Northstar HVAC  ",
      agent_name: "  Ava  ",
      role: "receptionist",
      primary_goal: "Capture emergency maintenance requests and schedule estimates.",
      tone: "calm and professional",
    });
    const restored = decodeDemoToken(encodeDemoToken(spec));

    expect(restored.agentName).toBe("Ava");
    expect(restored.businessName).toBe("Northstar HVAC");
    expect(restored.role).toBe("receptionist");
    expect(restored.primaryGoal).toContain("emergency maintenance");
  });

  it("rejects a tampered preview token", () => {
    const token = encodeDemoToken(
      createDemoSpec({ business_name: "Acme", primary_goal: "Answer calls" }),
    );
    expect(() => decodeDemoToken(`${token}x`)).toThrow(/invalid/i);
  });

  it("makes the preview boundary explicit in realtime instructions", () => {
    const prompt = buildDemoRealtimeInstructions(
      createDemoSpec({ business_name: "Acme", primary_goal: "Answer calls" }),
    );

    expect(prompt).toContain("private Wireline preview");
    expect(prompt).toContain("do not claim to book appointments");
    expect(prompt).toContain("Do not mention model names");
  });

  it("keeps the browser widget free of embedded credential values", () => {
    const widget = buildChatGptWidgetHtml();

    expect(widget).toContain("create_demo_voice_session");
    expect(widget).toContain("Save to Wireline");
    expect(widget).not.toContain("OPENAI_API_KEY");
    expect(widget).not.toContain("MCP_OAUTH_TOKEN_PEPPER");
  });
});
