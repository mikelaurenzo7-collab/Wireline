// Performance-goals math tests. The goal cards and the /api/goals route
// both render straight off these functions, so every derivation gets a
// focused case plus its boundary cases.

import { describe, it, expect } from "vitest";
import {
  GOAL_METRICS,
  QUALIFIED_LEAD_SCORE,
  MAX_GOAL_TARGET,
  MAX_GOAL_LABEL_LENGTH,
  isGoalMetric,
  goalMetricDef,
  normalizeTarget,
  normalizeLabel,
  currentPeriod,
  computeGoalProgress,
  computeActuals,
  actualFor,
} from "./goals";

// 2026-05 is a 31-day month. Picking noon on the 16th puts the clock at
// exactly the half-way point, so paceFraction === 0.5 in every case below.
const MAY_START = Date.UTC(2026, 4, 1);
const MAY_MID = Date.UTC(2026, 4, 16, 12, 0, 0);

describe("GOAL_METRICS catalog", () => {
  it("exposes the four supported metrics", () => {
    expect(GOAL_METRICS.map((m) => m.id)).toEqual([
      "calls_handled",
      "appointments_booked",
      "qualified_leads",
      "voice_minutes",
    ]);
  });

  it("gives every metric a label, unit, description and hex accent", () => {
    for (const m of GOAL_METRICS) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.unit.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
      expect(m.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("isGoalMetric", () => {
  it("accepts known metric ids", () => {
    expect(isGoalMetric("calls_handled")).toBe(true);
    expect(isGoalMetric("voice_minutes")).toBe(true);
  });

  it("rejects unknown ids and non-strings", () => {
    expect(isGoalMetric("revenue")).toBe(false);
    expect(isGoalMetric("")).toBe(false);
    expect(isGoalMetric(null)).toBe(false);
    expect(isGoalMetric(42)).toBe(false);
    expect(isGoalMetric(undefined)).toBe(false);
  });
});

describe("goalMetricDef", () => {
  it("returns the matching definition", () => {
    expect(goalMetricDef("appointments_booked").label).toBe("Appointments booked");
  });

  it("throws on an unknown metric", () => {
    // @ts-expect-error — exercising the runtime guard with a bad value.
    expect(() => goalMetricDef("nope")).toThrow(/Unknown goal metric/);
  });
});

describe("normalizeTarget", () => {
  it("accepts positive integers", () => {
    expect(normalizeTarget(40)).toBe(40);
    expect(normalizeTarget(1)).toBe(1);
  });

  it("rounds fractional input", () => {
    expect(normalizeTarget(40.4)).toBe(40);
    expect(normalizeTarget(40.6)).toBe(41);
  });

  it("accepts numeric strings", () => {
    expect(normalizeTarget("250")).toBe(250);
    expect(normalizeTarget("  75 ")).toBe(75);
  });

  it("rejects zero, negatives and over-cap values", () => {
    expect(normalizeTarget(0)).toBeNull();
    expect(normalizeTarget(-5)).toBeNull();
    expect(normalizeTarget(MAX_GOAL_TARGET + 1)).toBeNull();
  });

  it("accepts the exact cap", () => {
    expect(normalizeTarget(MAX_GOAL_TARGET)).toBe(MAX_GOAL_TARGET);
  });

  it("rejects non-numeric and non-finite input", () => {
    expect(normalizeTarget("abc")).toBeNull();
    expect(normalizeTarget("")).toBeNull();
    expect(normalizeTarget(null)).toBeNull();
    expect(normalizeTarget(undefined)).toBeNull();
    expect(normalizeTarget(Infinity)).toBeNull();
    expect(normalizeTarget(NaN)).toBeNull();
  });
});

describe("normalizeLabel", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeLabel("  Q2 push  ")).toBe("Q2 push");
  });

  it("collapses empty / whitespace-only strings to null", () => {
    expect(normalizeLabel("")).toBeNull();
    expect(normalizeLabel("   ")).toBeNull();
  });

  it("truncates to the max length", () => {
    const long = "x".repeat(MAX_GOAL_LABEL_LENGTH + 25);
    expect(normalizeLabel(long)).toHaveLength(MAX_GOAL_LABEL_LENGTH);
  });

  it("returns null for non-strings", () => {
    expect(normalizeLabel(123)).toBeNull();
    expect(normalizeLabel(null)).toBeNull();
    expect(normalizeLabel(undefined)).toBeNull();
  });
});

describe("currentPeriod", () => {
  it("returns UTC month bounds, key and label", () => {
    const p = currentPeriod(MAY_MID);
    expect(p.start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(p.key).toBe("2026-05");
    expect(p.label).toBe("May 2026");
  });

  it("rolls over the year in December", () => {
    const p = currentPeriod(Date.UTC(2026, 11, 20));
    expect(p.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(p.key).toBe("2026-12");
  });

  it("zero-pads single-digit months in the key", () => {
    expect(currentPeriod(Date.UTC(2026, 0, 9)).key).toBe("2026-01");
  });
});

describe("computeGoalProgress", () => {
  it("reports on_track when progress matches the calendar run-rate", () => {
    const p = computeGoalProgress({ target: 100 }, 50, MAY_MID);
    expect(p.status).toBe("on_track");
    expect(p.percent).toBe(50);
    expect(p.fraction).toBeCloseTo(0.5);
    expect(p.paceFraction).toBeCloseTo(0.5);
    expect(p.remaining).toBe(50);
  });

  it("reports ahead when progress outruns the calendar by >=10%", () => {
    expect(computeGoalProgress({ target: 100 }, 60, MAY_MID).status).toBe("ahead");
  });

  it("reports behind when progress trails the run-rate by >10%", () => {
    expect(computeGoalProgress({ target: 100 }, 40, MAY_MID).status).toBe("behind");
  });

  it("holds on_track inside the +/-10% pace band", () => {
    // ratio = (actual/target) / paceFraction; band is [0.9, 1.1).
    expect(computeGoalProgress({ target: 100 }, 46, MAY_MID).status).toBe("on_track"); // ratio 0.92
    expect(computeGoalProgress({ target: 100 }, 54, MAY_MID).status).toBe("on_track"); // ratio 1.08
  });

  it("reports achieved once the target is met or exceeded", () => {
    expect(computeGoalProgress({ target: 100 }, 100, MAY_MID).status).toBe("achieved");
    expect(computeGoalProgress({ target: 100 }, 130, MAY_MID).status).toBe("achieved");
  });

  it("clamps fraction to 1 but lets percent exceed 100 when over target", () => {
    const p = computeGoalProgress({ target: 100 }, 150, MAY_MID);
    expect(p.fraction).toBe(1);
    expect(p.percent).toBe(150);
    expect(p.remaining).toBe(0);
  });

  it("projects the end-of-month total from the current run-rate", () => {
    // Half the month gone, 50 done -> linear projection is 100.
    expect(computeGoalProgress({ target: 200 }, 50, MAY_MID).projected).toBe(100);
  });

  it("treats an unmet goal as on_track at the very start of the month", () => {
    const p = computeGoalProgress({ target: 100 }, 0, MAY_START);
    expect(p.status).toBe("on_track");
    expect(p.paceFraction).toBe(0);
    // No run-rate yet — projection falls back to the actual.
    expect(p.projected).toBe(0);
  });

  it("counts whole days left including today", () => {
    // Noon on the 16th of a 31-day month -> 15.5 days remain -> ceil 16.
    expect(computeGoalProgress({ target: 100 }, 10, MAY_MID).daysLeft).toBe(16);
    expect(computeGoalProgress({ target: 100 }, 10, MAY_START).daysLeft).toBe(31);
  });

  it("clamps negative actuals to zero", () => {
    const p = computeGoalProgress({ target: 100 }, -10, MAY_MID);
    expect(p.actual).toBe(0);
    expect(p.percent).toBe(0);
  });
});

describe("computeActuals", () => {
  it("counts calls, sums voice minutes and flags qualified leads", () => {
    const actuals = computeActuals({
      calls: [
        { durationSeconds: 120, leadScore: QUALIFIED_LEAD_SCORE },
        { durationSeconds: 90, leadScore: 80 },
        { durationSeconds: 30, leadScore: 10 },
      ],
      appointmentCount: 4,
    });
    expect(actuals.calls_handled).toBe(3);
    expect(actuals.qualified_leads).toBe(2);
    expect(actuals.voice_minutes).toBe(4); // (120 + 90 + 30) / 60 = 4
    expect(actuals.appointments_booked).toBe(4);
  });

  it("treats a score exactly at the threshold as qualified", () => {
    const actuals = computeActuals({
      calls: [{ leadScore: QUALIFIED_LEAD_SCORE - 1 }, { leadScore: QUALIFIED_LEAD_SCORE }],
      appointmentCount: 0,
    });
    expect(actuals.qualified_leads).toBe(1);
  });

  it("handles missing / null columns and negative durations", () => {
    const actuals = computeActuals({
      calls: [{}, { durationSeconds: null, leadScore: null }, { durationSeconds: -50 }],
      appointmentCount: 0,
    });
    expect(actuals.calls_handled).toBe(3);
    expect(actuals.qualified_leads).toBe(0);
    expect(actuals.voice_minutes).toBe(0);
  });

  it("rounds voice minutes to the nearest whole minute", () => {
    // 100 seconds -> 1.67 min -> rounds to 2.
    expect(
      computeActuals({ calls: [{ durationSeconds: 100 }], appointmentCount: 0 }).voice_minutes,
    ).toBe(2);
  });

  it("returns all zeros for an empty month", () => {
    expect(computeActuals({ calls: [], appointmentCount: 0 })).toEqual({
      calls_handled: 0,
      appointments_booked: 0,
      qualified_leads: 0,
      voice_minutes: 0,
    });
  });

  it("clamps a negative appointment count to zero", () => {
    expect(computeActuals({ calls: [], appointmentCount: -3 }).appointments_booked).toBe(0);
  });
});

describe("actualFor", () => {
  it("pulls a single metric out of computed actuals", () => {
    const actuals = computeActuals({
      calls: [{ durationSeconds: 600, leadScore: 90 }],
      appointmentCount: 7,
    });
    expect(actualFor("appointments_booked", actuals)).toBe(7);
    expect(actualFor("voice_minutes", actuals)).toBe(10);
    expect(actualFor("qualified_leads", actuals)).toBe(1);
    expect(actualFor("calls_handled", actuals)).toBe(1);
  });
});
