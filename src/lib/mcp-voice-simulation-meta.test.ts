import { describe, expect, it } from "vitest";

import { mcpVoiceSimulationMeta } from "./mcp-voice-simulation-meta";

const session = {
  sdp: "v=0\r\n" + "a".repeat(100),
  maxDurationSeconds: 300,
  endsAt: "2026-08-22T01:30:00.000Z",
  wireline: { provider: "openai_realtime" },
};

describe("mcp voice simulation meta", () => {
  it("gives the host widget only server-mediated signaling metadata", () => {
    const sessionWithLegacyFields = {
      ...session,
      token: "ek_secret",
      client_secret: "ek_secret",
      endpoint: "https://api.openai.com/v1/realtime/calls",
    };
    const meta = mcpVoiceSimulationMeta({
      session: sessionWithLegacyFields,
      agentId: "agent-1",
      greeting: "Hi",
    });
    expect(meta.agent_id).toBe("agent-1");
    expect(meta.realtime_session).toMatchObject({
      sdp: session.sdp,
      maxDurationSeconds: 300,
      endsAt: session.endsAt,
      greeting: "Hi",
    });
    expect(JSON.stringify(meta)).not.toMatch(/ek_secret|token|client_secret|api\.openai\.com/);
  });

  it("keeps the SDP answer in protected metadata rather than model-visible content", () => {
    const meta = mcpVoiceSimulationMeta({
      session,
      agentId: "agent-1",
      greeting: "Hi",
    });
    expect(meta.agent_id).toBe("agent-1");
    expect(meta.realtime_session.sdp).toBe(session.sdp);
    expect(JSON.stringify(meta)).not.toMatch(/token|client_secret/);
  });
});
