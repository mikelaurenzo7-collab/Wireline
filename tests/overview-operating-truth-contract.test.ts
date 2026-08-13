import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overview = readFileSync("src/pages/OverviewPage.tsx", "utf8");
const route = readFileSync("src/routes/overview-operating-metrics-routes.ts", "utf8");
const navRoute = readFileSync("src/routes/nav-counts-truth-routes.ts", "utf8");
const callOpsRoute = readFileSync("src/routes/call-ops-metrics-routes.ts", "utf8");
const statuses = readFileSync("src/lib/operator-work-status.ts", "utf8");
const registry = readFileSync("src/server/register-api-routes.ts", "utf8");
const recentRouteOffset = route.indexOf('"/api/overview/recent-conversations"');
const metricsRoute = recentRouteOffset > -1 ? route.slice(0, recentRouteOffset) : route;

describe("Home operating truth", () => {
  it("uses one canonical active operator lifecycle across Home, nav, Call Ops, and handoffs", () => {
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

  it("serves exact local-day omnichannel Home demand counts without conversation payloads", () => {
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

  it("binds Home KPIs to exact operating metrics rather than sampled dashboard rows or display-list lengths", () => {
    expect(overview).toContain("/api/overview/operating-metrics?since=");
    expect(overview).toContain('label: "Customer conversations today"');
    expect(overview).toContain('label: "High-intent today"');
    expect(overview).toContain('label: "Appointments booked"');
    expect(overview).toContain('label: "Needs attention"');
    expect(overview).toContain(
      "setConversationsToday(Number(operatingData?.conversationsToday ?? 0))",
    );
    expect(overview).toContain("setHighIntentToday(Number(operatingData?.highIntentToday ?? 0))");
    expect(overview).toContain("setActiveWork(Number(operatingData?.activeWork ?? 0))");
    expect(overview).toContain("recentConversations.length > 0 || conversationsToday > 0");
    expect(overview).not.toContain("setHotLeadsCount");
    expect(overview).not.toContain("setPendingFollowUps");
    expect(overview).not.toContain("isoToLocalDateKey");
    expect(overview).not.toContain("localDateKey");
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
    expect(overview).toContain('return "/inbox?tab=email"');
    expect(overview).toContain('return "/inbox?tab=sms"');
    expect(overview).toContain('return "/phone?tab=logs"');
    expect(overview).toContain("conversation.agent_name");
    expect(overview).toContain("conversationChannelLabel(conversation.channel)");
    expect(overview).not.toContain('authFetch("/api/dashboard/stats")');
    expect(overview).not.toContain("call.agent_name || primaryAgent?.name");
  });

  it("keeps connected email first-class in the Home live wiring summary", () => {
    expect(overview).toContain('authFetch("/api/emails/accounts").catch(() => null)');
    expect(overview).toContain(
      "Array.isArray(mailboxData?.accounts) && mailboxData.accounts.length > 0",
    );
    expect(overview).toContain('coreConnections.push("Email")');
    expect(overview).toContain(
      "const allConnections = [...new Set([...coreConnections, ...activeProviders])]",
    );

    const phone = overview.indexOf('coreConnections.push("Phone")');
    const email = overview.indexOf('coreConnections.push("Email")');
    const calendar = overview.indexOf('coreConnections.push("Calendar")');
    expect(phone).toBeGreaterThan(-1);
    expect(email).toBeGreaterThan(phone);
    expect(calendar).toBeGreaterThan(email);
  });

  it("isolates Home data-plane failures so one integration cannot blank independent truth", () => {
    expect(overview).toContain('authFetch("/api/overview/recent-conversations").catch(() => null)');
    expect(overview).toContain('authFetch("/api/oauth/crm/status").catch(() => null)');
    expect(overview).toContain('authFetch("/api/calendar/accounts").catch(() => null)');
    expect(overview).toContain('authFetch("/api/emails/accounts").catch(() => null)');
    expect(overview).toContain("setRecentUnavailable(true)");
    expect(overview).toContain("affected metrics or recent activity may not be current");
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
