import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const goals = readFileSync("src/routes/goals-routes.ts", "utf8");
const insights = readFileSync("src/routes/insights-routes.ts", "utf8");

describe("booked appointment counts", () => {
  it("leaves cancelled and demo rows out of Goals and Activity Totals", () => {
    for (const source of [goals, insights]) {
      expect(source).toContain("schema.appointments.status} is distinct from 'Cancelled'");
      expect(source).toContain("eq(schema.appointments.demo, false)");
    }
    expect(insights).not.toContain("/api/insights/leaderboard");
  });
});
