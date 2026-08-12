import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/call-ops-analytics-routes.ts", "utf8");
const registry = readFileSync("src/server/register-api-routes.ts", "utf8");
const analytics = readFileSync("src/components/CallOpsAnalytics.tsx", "utf8");
const callOps = readFileSync("src/components/CallLogsClaude.tsx", "utf8");

describe("Call Ops analytics truth", () => {
  it("computes exact tenant aggregates without selecting transcript-bearing rows", () => {
    expect(route).toContain('"/api/call-ops/analytics"');
    expect(route).toContain("authenticateUser");
    expect(route).toContain("dashboardRateLimit");
    expect(route).toContain("normalizeIanaTimeZone");
    expect(route).toContain("eq(schema.callLogs.userId, userId)");
    expect(route).toContain("totalCalls: sql`count(*)`");
    expect(route).toContain("sum(${schema.callLogs.durationSeconds})");
    expect(route).toContain("avg(${schema.callLogs.qaScore})");
    expect(route).toContain("extract(dow from timezone(${timeZone}, ${schema.callLogs.createdAt}))::int");
    expect(route).toContain(".groupBy(weekdayExpression)");
    expect(route).toContain('res.setHeader("Cache-Control", "private, no-store, max-age=0")');
    expect(route).not.toContain("schema.callLogs.transcript");
    expect(route).not.toContain("schema.callLogs.customerNumber");
    expect(route).not.toContain("schema.callLogs.summary");
  });

  it("registers analytics before the broad dashboard router", () => {
    expect(registry).toContain(
      'import callOpsAnalyticsRouter from "../routes/call-ops-analytics-routes";',
    );
    const analyticsMount = registry.indexOf("app.use(callOpsAnalyticsRouter);");
    const dashboardMount = registry.indexOf("app.use(dashboardRouter);");
    expect(analyticsMount).toBeGreaterThan(-1);
    expect(analyticsMount).toBeLessThan(dashboardMount);
  });

  it("renders analytics from aggregate-only data and removes the hidden 200-call cap", () => {
    expect(analytics).toContain("/api/call-ops/analytics?timezone=");
    expect(analytics).toContain("Intl.DateTimeFormat().resolvedOptions().timeZone");
    expect(analytics).toContain("analytics.totalCalls");
    expect(analytics).toContain("analytics.totalSeconds");
    expect(analytics).toContain("analytics.avgDurationSeconds");
    expect(analytics).toContain("analytics.avgQaScore");
    expect(analytics).toContain("analytics.weekdayCounts");
    expect(callOps).toContain('import CallOpsAnalytics from "./CallOpsAnalytics";');
    expect(callOps).toContain("return <CallOpsAnalytics />;");
    expect(callOps).not.toContain('/api/calls?limit=500');
    expect(callOps).not.toContain("function AnalyticsContent()");
  });
});
