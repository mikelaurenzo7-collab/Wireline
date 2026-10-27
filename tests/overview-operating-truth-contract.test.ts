import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const navRoute = readFileSync("src/routes/nav-counts-truth-routes.ts", "utf8");
const callOpsRoute = readFileSync("src/routes/call-ops-metrics-routes.ts", "utf8");
const statuses = readFileSync("src/lib/operator-work-status.ts", "utf8");
const registry = readFileSync("src/server/register-api-routes.ts", "utf8");

describe("Overview operating truth", () => {
  it("uses one canonical active operator lifecycle across nav, Call Ops, and handoffs", () => {
    expect(statuses).toContain(
      'ACTIVE_OPERATOR_TASK_STATUSES = ["pending", "open", "in_progress"] as const',
    );
    expect(navRoute).toContain(
      "inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES])",
    );
    expect(callOpsRoute).toContain(
      "inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES])",
    );
  });

  it("keeps the retired Overview page and its unconsumed routes retired", () => {
    expect(existsSync("src/pages/OverviewPage.tsx")).toBe(false);
    expect(existsSync("src/components/overview/UnifiedInbox.tsx")).toBe(false);
    expect(existsSync("src/routes/overview-operating-metrics-routes.ts")).toBe(false);
    expect(registry).not.toContain("overview-operating-metrics-routes");
    expect(registry).not.toContain("overviewOperatingMetricsRouter");
  });

  it("shadows historical pending-only nav/dashboard implementations with exact routes first", () => {
    expect(registry).toContain(
      'import navCountsTruthRouter from "../routes/nav-counts-truth-routes";',
    );
    const navMount = registry.indexOf("app.use(navCountsTruthRouter);");
    const dashboardMount = registry.indexOf("app.use(dashboardRouter);");
    expect(navMount).toBeGreaterThan(-1);
    expect(dashboardMount).toBeGreaterThan(-1);
    expect(navMount).toBeLessThan(dashboardMount);
  });
});
