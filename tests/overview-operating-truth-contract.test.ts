import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overview = readFileSync("src/pages/OverviewPage.tsx", "utf8");
const inbox = readFileSync("src/components/overview/UnifiedInbox.tsx", "utf8");
const types = readFileSync("src/components/overview/overview-types.ts", "utf8");
const route = readFileSync("src/routes/overview-operating-metrics-routes.ts", "utf8");
const navRoute = readFileSync("src/routes/nav-counts-truth-routes.ts", "utf8");
const callOpsRoute = readFileSync("src/routes/call-ops-metrics-routes.ts", "utf8");
const statuses = readFileSync("src/lib/operator-work-status.ts", "utf8");
const registry = readFileSync("src/server/register-api-routes.ts", "utf8");
const recentRouteOffset = route.indexOf('"/api/overview/recent-conversations"');
const metricsRoute = recentRouteOffset > -1 ? route.slice(0, recentRouteOffset) : route;
const overviewUi = `${overview}\n${inbox}\n${types}`;

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

  it("binds KPI tiles to exact operating metrics rather than sampled rows", () => {
    expect(overview).toContain("/api/overview/operating-metrics?since=");
    expect(overview).toContain('label: "Customer conversations today"');
    expect(overview).toContain('label: "High-intent today"');
    expect(overview).toContain('label: "Appointments booked"');
    expect(overview).toContain('label: "Needs attention"');
    expect(overview).toContain("conversationsToday: Number(body?.conversationsToday ?? 0)");
    expect(overview).toContain("highIntentToday: Number(body?.highIntentToday ?? 0)");
    expect(overview).toContain("appointmentsBooked: Number(body?.appointmentsBooked ?? 0)");
    expect(overview).toContain("activeWork: Number(body?.activeWork ?? 0)");
    expect(overview).toContain("wl-metric-tile--compact");
    expect(overview).toContain('role="status"');
    expect(overview).not.toContain("setHotLeadsCount");
    expect(overview).not.toContain("setPendingFollowUps");
    expect(overview).not.toContain('authFetch("/api/nav-counts")');
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

    expect(overview).toContain('authFetch("/api/overview/recent-conversations")');
    expect(types).toContain('return "/inbox?tab=email"');
    expect(types).toContain('return "/inbox?tab=sms"');
    expect(types).toContain('return "/phone?tab=logs"');
    expect(inbox).toContain("conversation.agent_name");
    expect(inbox).toContain("conversationChannelLabel(conversation.channel)");
    expect(overviewUi).not.toContain('authFetch("/api/dashboard/stats")');
  });

  it("isolates recent-conversation and KPI failures so one cannot blank the other", () => {
    expect(overview).toContain('authFetch("/api/overview/recent-conversations").catch(() => null)');
    expect(overview).toContain("setRecentUnavailable(true)");
    expect(overview).toContain("setMetricsUnavailable(true)");
    expect(overview).toContain("recentUnavailable ? (");
    expect(overview).toContain("metricsUnavailable ? (");
    expect(overview).toContain("unavailable={recentUnavailable && conversations.length === 0}");
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
