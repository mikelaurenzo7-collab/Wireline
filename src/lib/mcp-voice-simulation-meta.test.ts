import { describe, expect, it } from "vitest";

import { mcpVoiceSimulationMeta } from "./mcp-voice-simulation-meta";

const session = {
  value: "ek_secret",
  token: "ek_secret",
  client_secret: "ek_secret",
  endpoint: "https://api.openai.com/v1/realtime/calls",
};

describe("mcp voice simulation meta", () => {
  it("keeps the ChatGPT widget secret in _meta only", () => {
    const meta = mcpVoiceSimulationMeta({
      draftSource: "chatgpt_mcp",
      session,
      agentId: "agent-1",
      greeting: "Hi",
    });
    expect(meta.agent_id).toBe("agent-1");
    expect(meta.realtime_session).toMatchObject({ token: "ek_secret", greeting: "Hi" });
  });

  it("omits Realtime secrets from Cursor and Claude results", () => {
    for (const draftSource of ["cursor_mcp", "claude_mcp"] as const) {
      const meta = mcpVoiceSimulationMeta({
        draftSource,
        session,
        agentId: "agent-1",
        greeting: "Hi",
      });
      expect(meta).toEqual({ agent_id: "agent-1" });
      expect(JSON.stringify(meta)).not.toMatch(/ek_secret|token|client_secret/);
    }
  });
});
