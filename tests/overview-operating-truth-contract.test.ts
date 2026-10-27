import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/overview-operating-metrics-routes.ts", "utf8");
const navRoute = readFileSync("src/routes/nav-counts-truth-routes.ts", "utf8");
const callOpsRoute = readFileSync("src/routes/call-ops-metrics-routes.ts", "utf8");
const statuses = readFileSync("src/lib/operator-work-status.ts", "utf8");
const registry = readFileSync("src/server/register-api-routes.ts", "utf8");
const recentRouteOffset = route.indexOf('"/api/overview/recent-conversations"');
const metricsRoute = recentRouteOffset > -1 ? route.slice(0, recentRouteOffset) : route;
describe("Overview operating truth", () => {
  it("uses one canonical active operator lifecycle across Overview, nav, Call Ops, and handoffs", () => {
    expect(statuses).toContain(
      'ACTIVE_OPERATOR_TASK_STATUSES = ["pending", "open", "in_progress"] as const',
    );
    expect(route).toContain(
      "inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES])",
    );
    expect(navRoute).toContain(
      "inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES])",
    );
    expect(callOpsRoute).toContain(
      "inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES])",
    );
  });

  it("serves exact local-day omnichannel demand counts without conversation payloads", () => {
    expect(metricsRoute).toContain('"/api/overview/operating-metrics"');
    expect(metricsRoute).toContain("authenticateUser");
    expect(metricsRoute).toContain("dashboardRateLimit");
    expect(metricsRoute).toContain("MAX_DAY_BOUNDARY_AGE_MS");
    expect(metricsRoute).toContain("MAX_CLOCK_SKEW_MS");
    expect(metricsRoute).toContain("gte(schema.callLogs.createdAt, since)");
    expect(metricsRoute).toContain("gte(schema.emailThreads.lastMessageAt, since)");
    expect(metricsRoute).toContain("gte(schema.smsThreads.lastMessageAt, since)");
    expect(metricsRoute).toContain("HIGH_INTENT_SCORE = 75");
    expect(metricsRoute).toContain("eq(schema.appointments.userId, userId)");
    expect(metricsRoute).toContain(
      'res.setHeader("Cache-Control", "private, no-store, max-age=0")',
    );
    expect(metricsRoute).not.toContain("customerNumber:");
    expect(metricsRoute).not.toContain("transcript:");
    expect(metricsRoute).not.toContain("summary:");
  });

  it("keeps exact operating counts on the route after the Overview page retired", () => {
    expect(existsSync("src/pages/OverviewPage.tsx")).toBe(false);
    expect(existsSync("src/components/overview/UnifiedInbox.tsx")).toBe(false);
    expect(route).toContain("conversationsToday:");
    expect(route).toContain("highIntentToday:");
    expect(route).not.toContain("customerNumber:");
    expect(route).not.toContain('authFetch("/api/dashboard/stats")');
  });

  it("serves a bounded truthful recent-conversation glance across voice, email, and SMS", () => {
    expect(route).toContain('"/api/overview/recent-conversations"');
    expect(route).toContain("RECENT_CONVERSATION_LIMIT = 4");
    expect(route).toContain("contact: schema.callLogs.customerNumber");
    expect(route).toContain("contact: schema.emailThreads.customerEmail");
    expect(route).toContain("contact: schema.smsThreads.customerNumber");
    expect(route).toContain("agentName: schema.agents.name");
    expect(route).toMatch(/\.leftJoin\(\s*schema\.agents,/);
    expect(route).toContain('channel: "voice" as const');
    expect(route).toContain('channel: "email" as const');
    expect(route).toContain('channel: "sms" as const');
    expect(route).toContain(".slice(0, RECENT_CONVERSATION_LIMIT)");
    expect(route).not.toContain("schema.callLogs.transcript");
    expect(route).not.toContain("schema.callLogs.recordingUrl");
    expect(route).not.toContain("schema.emailMessages");
    expect(route).not.toContain("schema.smsMessages");

  });

  it("keeps recent conversations on a separate route from the KPI counts", () => {
    const metricsAt = route.indexOf('"/api/overview/operating-metrics"');
    const recentAt = route.indexOf('"/api/overview/recent-conversations"');
    expect(metricsAt).toBeGreaterThan(-1);
    expect(recentAt).toBeGreaterThan(metricsAt);
    expect(route.slice(metricsAt, recentAt)).not.toContain("schema.callLogs.transcript");
  });

  it("shadows historical pending-only nav/dashboard implementations with exact routes first", () => {
    expect(registry).toContain(
      'import overviewOperatingMetricsRouter from "../routes/overview-operating-metrics-routes";',
    );
    expect(registry).toContain(
      'import navCountsTruthRouter from "../routes/nav-counts-truth-routes";',
    );
    const overviewMount = registry.indexOf("app.use(overviewOperatingMetricsRouter);");
    const navMount = registry.indexOf("app.use(navCountsTruthRouter);");
    const dashboardMount = registry.indexOf("app.use(dashboardRouter);");
    expect(overviewMount).toBeGreaterThan(-1);
    expect(navMount).toBeGreaterThan(-1);
    expect(overviewMount).toBeLessThan(dashboardMount);
    expect(navMount).toBeLessThan(dashboardMount);
  });
});
