import { describe, expect, it } from "vitest";
import { computeAgentReadiness } from "./agent-readiness";

describe("computeAgentReadiness", () => {
  it("returns a 0/6-ish baseline for a bare new agent", () => {
    const r = computeAgentReadiness({ id: "a1", name: "New", channel: "voice" }, {}, null);
    // Only "agent" (identity) is satisfied — everything else is empty.
    expect(r.score).toBe(1);
    expect(r.total).toBe(6);
    expect(r.ready).toBe(false);
    expect(r.flags.hasAgent).toBe(true);
    expect(r.flags.hasVoice).toBe(false);
  });

  it("treats an email-channel agent as voice-ready", () => {
    const r = computeAgentReadiness({ id: "a1", channel: "email" }, {}, null);
    expect(r.flags.hasVoice).toBe(true);
  });

  it("counts a connected integration toward the score", () => {
    const base = computeAgentReadiness({ id: "a1", channel: "voice" }, {}, null);
    const withTool = computeAgentReadiness(
      { id: "a1", channel: "voice" },
      {},
      { hubspot: { connected: true }, slack: { connected: false } },
    );
    expect(withTool.flags.connectedIntegrations).toBe(1);
    expect(withTool.score).toBe(base.score + 1);
  });

  it("derives knowledge from website_url or config knowledge entries", () => {
    expect(
      computeAgentReadiness({ id: "a1", website_url: "https://x.co" }, {}, null).flags.hasKnowledge,
    ).toBe(true);
    expect(
      computeAgentReadiness({ id: "a1" }, { knowledge: [{ q: "x" }] }, null).flags.hasKnowledge,
    ).toBe(true);
    expect(computeAgentReadiness({ id: "a1" }, { knowledge: [] }, null).flags.hasKnowledge).toBe(
      false,
    );
  });

  it("derives rules from directives or a personality string", () => {
    expect(
      computeAgentReadiness({ id: "a1" }, { directives: ["never quote prices"] }, null).flags
        .hasRules,
    ).toBe(true);
    expect(computeAgentReadiness({ id: "a1" }, { personality: "warm" }, null).flags.hasRules).toBe(
      true,
    );
    expect(computeAgentReadiness({ id: "a1" }, {}, null).flags.hasRules).toBe(false);
  });

  it("surfaces voice as nextStep for a bare voice agent (never identity)", () => {
    // identity is done; voice is the first unsatisfied actionable check.
    const r = computeAgentReadiness({ id: "a1", channel: "voice" }, {}, null);
    expect(r.nextStep?.id).toBe("voice");
  });

  it("advances nextStep to phone once voice is satisfied", () => {
    // Voice satisfied (email channel); phone/knowledge/rules/tools empty → phone next.
    const r = computeAgentReadiness({ id: "a1", channel: "email" }, {}, null);
    expect(r.nextStep?.id).toBe("phone");
  });

  it("reports ready=true and a 6/6 score when everything is configured", () => {
    const r = computeAgentReadiness(
      {
        id: "a1",
        channel: "voice",
        voice_id: "v1",
        phone_number: "+15551234567",
        website_url: "https://x.co",
      },
      { personality: "warm", directives: ["x"], knowledge: [{ q: "y" }] },
      { hubspot: { connected: true } },
    );
    expect(r.score).toBe(6);
    expect(r.ready).toBe(true);
    expect(r.nextStep).toBeNull();
  });

  it("uses a shorter personal gate (no number or tools requirement)", () => {
    const r = computeAgentReadiness({ id: "a1", channel: "voice" }, {}, null, {
      accountType: "personal",
    });
    expect(r.total).toBe(4);
    expect(r.checks.map((c) => c.id)).toEqual(["agent", "voice", "knowledge", "rules"]);
  });

  it("reaches ready for a personal agent without a number or connected tool", () => {
    const r = computeAgentReadiness(
      { id: "a1", channel: "voice", voice_id: "v1" },
      { personality: "warm", knowledge: [{ q: "y" }] },
      null,
      { accountType: "personal" },
    );
    expect(r.ready).toBe(true);
    expect(r.score).toBe(4);
  });
});
