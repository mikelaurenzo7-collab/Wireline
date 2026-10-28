import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/call-ops-metrics-routes.ts", "utf8");
const registry = readFileSync("src/server/register-api-routes.ts", "utf8");
const callOps = readFileSync("src/components/CallLogsClaude.tsx", "utf8");

describe("Call Ops operational truth", () => {
  it("serves tenant-scoped, lightweight workspace metrics independently of call pagination", () => {
    expect(route).toContain('"/api/call-ops/metrics"');
    expect(route).toContain("authenticateUser");
    expect(route).toContain("dashboardRateLimit");
    expect(route).toContain("MAX_DAY_BOUNDARY_AGE_MS");
    expect(route).toContain("MAX_CLOCK_SKEW_MS");
    expect(route).toContain("gte(schema.callLogs.createdAt, since)");
    expect(route).toContain("eq(schema.callLogs.userId, userId)");
    expect(route).toContain("eq(schema.followUpTasks.userId, userId)");
    expect(route).toContain(
      'import { ACTIVE_OPERATOR_TASK_STATUSES } from "../lib/operator-work-status";',
    );
    expect(route).toContain(
      "inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES])",
    );
    expect(route).toContain(
      'const CALL_TASK_SOURCE_TYPES = ["phone_call", "showcase_call"] as const;',
    );
    expect(route).toContain(
      "inArray(schema.followUpTasks.sourceType, [...CALL_TASK_SOURCE_TYPES])",
    );
    expect(route).toContain("taskType} = 'human_escalation'");
    expect(route).toContain("eq(schema.agents.userId, userId)");
    expect(route).toContain('res.setHeader("Cache-Control", "private, no-store, max-age=0")');
  });

  it("registers the metrics route before the broad dashboard router", () => {
    expect(registry).toContain(
      'import callOpsMetricsRouter from "../routes/call-ops-metrics-routes";',
    );
    const metricsMount = registry.indexOf("app.use(callOpsMetricsRouter);");
    const dashboardMount = registry.indexOf("app.use(dashboardRouter);");
    expect(metricsMount).toBeGreaterThan(-1);
    expect(metricsMount).toBeLessThan(dashboardMount);
  });

  it("keeps the call feed independent of the separate metrics endpoint", () => {
    expect(callOps).not.toContain("/api/call-ops/metrics");
  });
});
