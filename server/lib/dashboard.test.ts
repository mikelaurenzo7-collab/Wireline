import { describe, expect, it } from "vitest";

import {
  buildDashboardBriefing,
  buildFounderPlaybook,
  formatConversionRate,
  getDashboardChannelCounts,
} from "./dashboard";

describe("buildDashboardBriefing", () => {
  it("flags an empty fleet as action-needed", () => {
    const briefing = buildDashboardBriefing({
      totalCalls: 0,
      totalAppointments: 0,
      hotLeadCount: 0,
      pendingTasks: 0,
      openEmailThreads: 0,
      activeAgents: 0,
      voiceAgents: 0,
      emailAgents: 0,
      signalsLast24h: 0,
      inboundCount: 0,
      outboundCount: 0,
    });

    expect(briefing.status).toBe("action-needed");
    expect(briefing.headline).toMatch(/deploy/i);
    expect(briefing.actions[0].tone).toBe("critical");
  });

  it("rewards balanced, healthy throughput", () => {
    const briefing = buildDashboardBriefing({
      totalCalls: 48,
      totalAppointments: 18,
      hotLeadCount: 8,
      pendingTasks: 0,
      openEmailThreads: 2,
      activeAgents: 6,
      voiceAgents: 3,
      emailAgents: 3,
      signalsLast24h: 20,
      inboundCount: 24,
      outboundCount: 16,
    });

    expect(briefing.status).toBe("locked-in");
    expect(briefing.score).toBeGreaterThanOrEqual(76);
    expect(briefing.actions.every((action) => action.tone !== "critical")).toBe(true);
  });

  it("surfaces queue pressure when workload stacks up", () => {
    const briefing = buildDashboardBriefing({
      totalCalls: 12,
      totalAppointments: 1,
      hotLeadCount: 1,
      pendingTasks: 8,
      openEmailThreads: 12,
      activeAgents: 2,
      voiceAgents: 2,
      emailAgents: 0,
      signalsLast24h: 4,
      inboundCount: 8,
      outboundCount: 3,
    });

    expect(briefing.status).toBe("action-needed");
    expect(briefing.actions[1].tone).toBe("critical");
    expect(briefing.nextMove).toMatch(/pending handoff/i);
  });
});

describe("dashboard helpers", () => {
  it("counts voice and email capable agents consistently", () => {
    expect(
      getDashboardChannelCounts([
        { channel: "voice" },
        { channel: "email" },
        { channel: "omnichannel" },
        { channel: "unknown" },
      ])
    ).toEqual({
      activeAgents: 4,
      voiceAgents: 2,
      emailAgents: 2,
    });
  });

  it("formats conversion rate with a stable string contract", () => {
    expect(formatConversionRate(3, 12)).toBe("25.0");
    expect(formatConversionRate(3, 0)).toBe("0.0");
  });
});

describe("buildFounderPlaybook", () => {
  it("prioritizes first agent deployment when the fleet is empty", () => {
    const playbook = buildFounderPlaybook({
      totalCalls: 0,
      totalAppointments: 0,
      hotLeadCount: 0,
      pendingTasks: 0,
      openEmailThreads: 0,
      activeAgents: 0,
      voiceAgents: 0,
      emailAgents: 0,
      signalsLast24h: 0,
      inboundCount: 0,
      outboundCount: 0,
    });

    expect(playbook[0]).toMatchObject({
      priority: "critical",
      route: "/agents",
    });
  });

  it("surfaces queue and inbox pressure before optimization work", () => {
    const playbook = buildFounderPlaybook({
      totalCalls: 20,
      totalAppointments: 2,
      hotLeadCount: 4,
      pendingTasks: 7,
      openEmailThreads: 9,
      activeAgents: 3,
      voiceAgents: 2,
      emailAgents: 1,
      signalsLast24h: 8,
      inboundCount: 12,
      outboundCount: 6,
    });

    expect(playbook.some((item) => item.title.includes("handoff"))).toBe(true);
    expect(playbook.some((item) => item.title.includes("inbox"))).toBe(true);
    expect(playbook[0].priority).toBe("critical");
  });
});
