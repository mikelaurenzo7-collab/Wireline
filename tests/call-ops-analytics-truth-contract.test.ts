import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/call-ops-analytics-routes.ts", "utf8");
const registry = readFileSync("src/server/register-api-routes.ts", "utf8");
const analytics = readFileSync("src/components/CallOpsAnalytics.tsx", "utf8");
const overview = readFileSync("src/components/CallOpsOverview.tsx", "utf8");
const callOps = readFileSync("src/components/CallLogsClaude.tsx", "utf8");
const phonePage = readFileSync("src/pages/PhonePage.tsx", "utf8");
const insightsView = readFileSync("src/components/insights/InsightsView.tsx", "utf8");
const opsDesign = readFileSync("src/lib/wireline-ops-design.ts", "utf8");

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
    expect(route).toContain("AT TIME ZONE ${zone}");
    expect(route).toContain(".groupBy(sql`1`)");
    expect(route).toContain("Call Ops analytics weekday buckets failed");
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
    expect(overview).toContain('import CallOpsAnalytics from "./CallOpsAnalytics";');
    expect(overview).toContain("<CallOpsAnalytics />");
    // Call analytics lives in Insights beside every other channel; Calls keeps
    // the log, outbound work, and lines, and forwards old Analytics bookmarks.
    expect(insightsView).toContain('import CallOpsOverview from "../CallOpsOverview";');
    expect(insightsView).toContain('calls: wrap("Call analytics", <CallOpsOverview />)');
    expect(opsDesign).toContain('tabs: ["funnel", "calls", "goals", "heatmap"]');
    expect(opsDesign).not.toContain("leaderboard");
    expect(phonePage).not.toContain('{ id: "analytics", label: "Analytics" }');
    expect(phonePage).toContain('<Navigate to="/insights?tab=performance&view=calls" replace />');
    expect(callOps).toContain("const CALL_PAGE_SIZE = 100;");
    expect(callOps).toContain("offset: String(calls.length)");
    expect(callOps).toContain("Load More Calls");
    expect(callOps).not.toContain("/api/calls?limit=500");
    expect(callOps).not.toContain("function AnalyticsContent()");
  });

  it("keeps analytics recoverable without erasing the last successful view", () => {
    expect(analytics).toContain("const loadAnalytics = useCallback");
    expect(analytics).toContain("if (loading && !analytics && !error) return <CardRowSkeleton />");
    expect(analytics).not.toContain("setAnalytics(null)");
    expect(analytics).toContain('aria-label="Retry call analytics"');
    expect(analytics).toContain("onClick={() => void loadAnalytics()}");
    expect(analytics).toContain('title="Analytics May Be Out of Date"');
    expect(analytics).toContain("Your last loaded metrics remain available below.");
    expect(analytics.indexOf("{staleDataNotice}")).toBeLessThan(
      analytics.indexOf('className="grid grid-cols-2 gap-3 sm:grid-cols-4"'),
    );
  });
});
