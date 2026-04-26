import { describe, expect, it } from "vitest";

import { buildDashboardBriefing } from "./dashboard";

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
      totalCalls: 30,
      totalAppointments: 10,
      hotLeadCount: 5,
      pendingTasks: 1,
      openEmailThreads: 2,
      activeAgents: 5,
      voiceAgents: 3,
      emailAgents: 2,
      signalsLast24h: 12,
      inboundCount: 16,
      outboundCount: 10,
    });

    expect(briefing.status).toBe("locked-in");
    expect(briefing.score).toBeGreaterThanOrEqual(78);
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
