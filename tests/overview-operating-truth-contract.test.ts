import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overview = readFileSync("src/pages/OverviewPage.tsx", "utf8");
const route = readFileSync("src/routes/overview-operating-metrics-routes.ts", "utf8");
const navRoute = readFileSync("src/routes/nav-counts-truth-routes.ts", "utf8");
const callOpsRoute = readFileSync("src/routes/call-ops-metrics-routes.ts", "utf8");
const statuses = readFileSync("src/lib/operator-work-status.ts", "utf8");
const registry = readFileSync("src/server/register-api-routes.ts", "utf8");

describe("Home operating truth", () => {
  it("uses one canonical active operator lifecycle across Home, nav, Call Ops, and handoffs", () => {
    expect(statuses).toContain(
      'ACTIVE_OPERATOR_TASK_STATUSES = ["pending", "open", "in_progress"] as const',
    );
    expect(route).toContain("inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES])");
    expect(navRoute).toContain("inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES])");
    expect(callOpsRoute).toContain(
      "inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES])",
    );
  });

  it("serves exact local-day omnichannel Home demand counts without conversation payloads", () => {
    expect(route).toContain('"/api/overview/operating-metrics"');
    expect(route).toContain("authenticateUser");
    expect(route).toContain("dashboardRateLimit");
    expect(route).toContain("MAX_DAY_BOUNDARY_AGE_MS");
    expect(route).toContain("MAX_CLOCK_SKEW_MS");
    expect(route).toContain("gte(schema.callLogs.createdAt, since)");
    expect(route).toContain("gte(schema.emailThreads.lastMessageAt, since)");
    expect(route).toContain("gte(schema.smsThreads.lastMessageAt, since)");
    expect(route).toContain("HIGH_INTENT_SCORE = 75");
    expect(route).toContain("eq(schema.appointments.userId, userId)");
    expect(route).toContain('res.setHeader("Cache-Control", "private, no-store, max-age=0")');
    expect(route).not.toContain("customerNumber:");
    expect(route).not.toContain("transcript:");
    expect(route).not.toContain("summary:");
  });

  it("binds Home KPIs to exact operating metrics rather than sampled dashboard rows or display-list lengths", () => {
    expect(overview).toContain("/api/overview/operating-metrics?since=");
    expect(overview).toContain('label: "Customer conversations today"');
    expect(overview).toContain('label: "High-intent today"');
    expect(overview).toContain('label: "Appointments booked"');
    expect(overview).toContain('label: "Needs attention"');
    expect(overview).toContain("setConversationsToday(Number(data?.conversationsToday ?? 0))");
    expect(overview).toContain("setHighIntentToday(Number(data?.highIntentToday ?? 0))");
    expect(overview).toContain("setActiveWork(Number(data?.activeWork ?? 0))");
    expect(overview).toContain("recentCalls.length > 0 || conversationsToday > 0");
    expect(overview).not.toContain("setHotLeadsCount");
    expect(overview).not.toContain("setPendingFollowUps");
    expect(overview).not.toContain("isoToLocalDateKey");
    expect(overview).not.toContain("localDateKey");
    expect(overview).not.toContain('authFetch("/api/nav-counts")');
  });

  it("isolates Home data-plane failures so one integration cannot blank independent truth", () => {
    expect(overview).toContain('authFetch("/api/dashboard/stats").catch(() => null)');
    expect(overview).toContain('authFetch("/api/oauth/crm/status").catch(() => null)');
    expect(overview).toContain('authFetch("/api/calendar/accounts").catch(() => null)');
    expect(overview).toContain("affected metrics or recent activity may not be current");
  });

  it("shadows historical pending-only nav/dashboard implementations with exact routes first", () => {
    expect(registry).toContain(
      'import overviewOperatingMetricsRouter from "../routes/overview-operating-metrics-routes";',
    );
    expect(registry).toContain('import navCountsTruthRouter from "../routes/nav-counts-truth-routes";');
    const overviewMount = registry.indexOf("app.use(overviewOperatingMetricsRouter);");
    const navMount = registry.indexOf("app.use(navCountsTruthRouter);");
    const dashboardMount = registry.indexOf("app.use(dashboardRouter);");
    expect(overviewMount).toBeGreaterThan(-1);
    expect(navMount).toBeGreaterThan(-1);
    expect(overviewMount).toBeLessThan(dashboardMount);
    expect(navMount).toBeLessThan(dashboardMount);
  });
});
