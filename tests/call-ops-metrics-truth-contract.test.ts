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
    expect(route).toContain('eq(schema.followUpTasks.status, "pending")');
    expect(route).toContain('const CALL_TASK_SOURCE_TYPES = ["phone_call", "showcase_call"] as const;');
    expect(route).toContain("inArray(schema.followUpTasks.sourceType, [...CALL_TASK_SOURCE_TYPES])");
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

  it("uses exact KPI aggregates without coupling metric availability to the call feed", () => {
    expect(callOps).toContain("type CallOpsMetrics = {");
    expect(callOps).toContain("/api/call-ops/metrics?since=");
    expect(callOps).toContain("setMetricsError(true)");
    expect(callOps).toContain('label: "Today", value: metrics?.today ?? 0');
    expect(callOps).toContain('label: "Pending", value: metrics?.pending ?? 0');
    expect(callOps).toContain('label: "Agents", value: metrics?.agents ?? 0');
    expect(callOps).toContain('label: "Escalations", value: metrics?.escalations ?? 0');
    expect(callOps).toContain('metricsLoading || metricsError ? "—" : kpi.value');
    expect(callOps).toContain('authFetch("/api/calls?limit=100&offset=0")');
    expect(callOps).not.toContain("emitProductEventOnce");
    expect(callOps).not.toContain('event: "outcome_reviewed"');
    expect(callOps).not.toContain("const fleet = useMemo");
  });
});
