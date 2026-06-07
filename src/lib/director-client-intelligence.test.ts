import { describe, it, expect } from "vitest";
import {
  renderSituationReport,
  type DirectorClientIntelligence,
} from "./director-client-intelligence";

function baseIntel(
  overrides: Partial<DirectorClientIntelligence> = {},
): DirectorClientIntelligence {
  return {
    ok: true,
    funnel: {
      calls7d: 40,
      bookings7d: 8,
      callsPrev7d: 50,
      bookingsPrev7d: 12,
      bookRate7d: 0.2,
      callsTrendPct: -20,
      bookingsTrendPct: -33,
    },
    openTasks: 0,
    uncapturedHotLeads: 0,
    overdueCallbacks: 0,
    stalledDeals: 0,
    recoveryNeeded: 0,
    agents: [],
    ...overrides,
  };
}

describe("renderSituationReport", () => {
  it("always leads with the live funnel and WoW trend", () => {
    const report = renderSituationReport(baseIntel());
    expect(report).toContain("LIVE SITUATION REPORT");
    expect(report).toContain("40 calls");
    expect(report).toContain("-20%");
    expect(report).toContain("20% booking rate");
  });

  it("surfaces uncaptured hot leads as a money-on-the-table gap", () => {
    const report = renderSituationReport(baseIntel({ uncapturedHotLeads: 5 }));
    expect(report).toContain("Slipping through the cracks");
    expect(report).toMatch(/5 HOT caller/);
  });

  it("lists overdue callbacks, stalled deals, recovery and open tasks", () => {
    const report = renderSituationReport(
      baseIntel({
        overdueCallbacks: 3,
        stalledDeals: 2,
        recoveryNeeded: 4,
        openTasks: 7,
      }),
    );
    expect(report).toMatch(/3 scheduled callback/);
    expect(report).toMatch(/2 qualified\/demo deal/);
    expect(report).toMatch(/4 unhappy caller/);
    expect(report).toMatch(/7 open fleet task/);
  });

  it("surfaces per-agent direction for non-healthy agents, worst first", () => {
    const report = renderSituationReport(
      baseIntel({
        agents: [
          {
            agentId: "a1",
            agentName: "Closer Carl",
            calls: 30,
            bookings: 1,
            bookRate: 0.03,
            avgLeadScore: 30,
            negativeRate: 0.3,
            avgCsat: 2,
            avgTtftMs: 1400,
            errorRate: 0.2,
            verdict: "Critical",
            recommendations: ["Latency is high (avg 1400ms to first token, target <900ms)."],
          },
          {
            agentId: "a2",
            agentName: "Healthy Hannah",
            calls: 40,
            bookings: 18,
            bookRate: 0.45,
            avgLeadScore: 72,
            negativeRate: 0.05,
            avgCsat: 4.6,
            avgTtftMs: 700,
            errorRate: 0,
            verdict: "Healthy",
            recommendations: ["Performing well."],
          },
        ],
      }),
    );
    expect(report).toContain("Fleet direction");
    expect(report).toContain("Closer Carl [Critical]");
    // Healthy agents are not surfaced as needing tuning.
    expect(report).not.toContain("Healthy Hannah");
  });

  it("reports a clean account when there are no gaps or agent issues", () => {
    const report = renderSituationReport(baseIntel());
    expect(report).toContain("No critical gaps right now");
  });
});
