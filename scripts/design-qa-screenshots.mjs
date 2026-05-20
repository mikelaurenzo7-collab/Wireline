import { chromium } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const outDir = path.resolve("test-results/design-audit");
const viewportFilter = (process.env.QA_VIEWPORT || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const appendMode = process.env.QA_APPEND === "1";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
];

const adminTabs = [
  "branding",
  "carrier",
  "voices",
  "pronunciation",
  "subscription",
  "team",
  "flywheel",
  "system",
  "activity",
];

const dashboardTabs = ["Pulse", "Brief", "Fleet", "History"];
const insightsTabs = [
  "Funnel",
  "Attribution",
  "Topics",
  "Heatmap",
  "Leaderboard",
  "Failures",
  "AI Spend",
  "Quality",
];
const trainingTabs = ["Coach", "Knowledge", "Test call", "Conversation flow", "Connected apps"];

const publicTargets = [
  { name: "public-auth", route: "/" },
  { name: "public-pricing", route: "/pricing" },
  { name: "public-compare", route: "/compare" },
  { name: "public-about", route: "/about" },
  { name: "public-showcase", route: "/showcase" },
  { name: "public-changelog", route: "/changelog" },
  { name: "public-support", route: "/support" },
  { name: "public-privacy", route: "/privacy" },
  { name: "public-terms", route: "/terms" },
  { name: "public-data-deletion", route: "/legal/data-deletion" },
  { name: "public-zoom-docs", route: "/docs/zoom" },
  { name: "vertical-home-services", route: "/for/home-services" },
  { name: "vertical-medical", route: "/for/medical" },
  { name: "vertical-legal", route: "/for/legal" },
  { name: "vertical-real-estate", route: "/for/real-estate" },
  { name: "vertical-personal", route: "/for/personal" },
  { name: "vertical-insurance", route: "/for/insurance" },
  { name: "vertical-restaurants", route: "/for/restaurants" },
  { name: "vertical-sales", route: "/for/sales" },
];

const authTargets = [
  ...dashboardTabs.map((tab) => ({ name: `app-home-${slug(tab)}`, route: "/", click: tab })),
  { name: "app-live", route: "/live" },
  { name: "app-founder", route: "/founder" },
  { name: "app-triage", route: "/triage" },
  ...insightsTabs.map((tab) => ({ name: `app-insights-${slug(tab)}`, route: "/insights", click: tab })),
  { name: "app-pipeline", route: "/pipeline" },
  { name: "app-contact-profile", route: "/contact/+15555550100" },
  { name: "app-call-logs", route: "/logs" },
  { name: "app-email-inbox", route: "/inbox" },
  { name: "app-sms-inbox", route: "/sms" },
  { name: "app-outbound", route: "/outbound" },
  { name: "app-appointments-list", route: "/appointments", clickLabel: "List view" },
  { name: "app-appointments-calendar", route: "/appointments", clickLabel: "Calendar view" },
  { name: "app-cockpit", route: "/cockpit" },
  ...trainingTabs.map((tab) => ({ name: `app-training-${slug(tab)}`, route: "/train", click: tab })),
  { name: "app-knowledge", route: "/knowledge" },
  { name: "app-agents", route: "/agents" },
  { name: "app-integrations", route: "/integrations" },
  ...adminTabs.map((tab) => ({ name: `app-admin-${slug(tab)}`, route: `/admin?tab=${tab}` })),
  { name: "app-dnc", route: "/dnc" },
  { name: "app-audit", route: "/audit" },
  { name: "app-help", route: "/help" },
  { name: "app-not-found", route: "/missing-route-for-design-audit" },
];

const targets = [
  ...publicTargets.map((target) => ({ ...target, auth: false })),
  ...authTargets.map((target) => ({ ...target, auth: true })),
];

const now = "2026-05-20T16:00:00.000Z";
const agents = [
  {
    id: "agent-1",
    name: "Avery",
    role: "front-desk",
    status: "active",
    description: "Handles inbound calls, qualification, booking, and follow-up.",
    voice: "alloy",
    phone_number: "+1 (555) 010-1000",
    created_at: now,
  },
  {
    id: "agent-2",
    name: "Riley",
    role: "sales-development",
    status: "active",
    description: "Outbound prospecting and reactivation specialist.",
    voice: "verse",
    phone_number: "+1 (555) 010-2000",
    created_at: now,
  },
];

const tasks = [
  {
    id: "task-1",
    agent_id: "agent-1",
    task_type: "schedule_calendar",
    priority: "high",
    target_channel: "calendar",
    status: "pending",
    description: "Book roof inspection for Jordan Lee tomorrow afternoon.",
    resolution_notes: "Caller requested a callback window after 2 PM.",
    payload: { customerNumber: "+15555550100" },
    created_at: now,
  },
  {
    id: "task-2",
    agent_id: "agent-2",
    task_type: "send_email",
    priority: "medium",
    target_channel: "email",
    status: "pending",
    description: "Send follow-up pricing recap to Morgan at Ridgeway Dental.",
    resolution_notes: "Lead asked for monthly plan comparison.",
    payload: { email: "morgan@example.com" },
    created_at: now,
  },
];

const calls = [
  {
    id: "call-1",
    customer_number: "+15555550100",
    customer_name: "Jordan Lee",
    direction: "inbound",
    status: "completed",
    duration_seconds: 246,
    lead_score: 86,
    sentiment: "positive",
    sentiment_label: "Ready to book",
    summary: "Qualified lead asked for a roof inspection and preferred tomorrow afternoon.",
    transcript: "Caller: I need help scheduling an inspection. Agent: I can help with that.",
    recording_url: "",
    created_at: now,
  },
  {
    id: "call-2",
    customer_number: "+15555550200",
    customer_name: "Morgan Park",
    direction: "outbound",
    status: "completed",
    duration_seconds: 189,
    lead_score: 74,
    sentiment: "neutral",
    sentiment_label: "Needs pricing",
    summary: "Prospect requested plan comparison and team access details.",
    transcript: "Agent: Thanks for taking the call. Prospect: Please send details.",
    recording_url: "",
    created_at: now,
  },
];

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function json(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

function mockApi(pathname, searchParams, method) {
  if (method !== "GET") return json({ ok: true, success: true, id: "mock-write" });

  if (pathname === "/api/public/stats") {
    return json({ calls_handled: 24891, meetings_booked: 642, avg_response_seconds: 4 });
  }
  if (/^\/api\/auth\/.+\/url$/.test(pathname)) return json({ url: "https://example.com/oauth" });
  if (pathname === "/api/public/stats") {
    return json({ agents_online: 12, calls_this_month: 1480 });
  }
  if (pathname === "/api/nav-counts") return json({ "/triage": 4, "/inbox": 2, "/logs": 3 });
  if (pathname === "/api/user-preferences") {
    return json({
      persona: "operator",
      onboarding_completed: true,
      tour_completed: true,
      preferences: { goal: "convert_leads", situation: "growing" },
    });
  }
  if (pathname === "/api/billing/status") {
    return json({
      email_verified: true,
      subscription: { status: "active", plan: "growth", current_period_end: "2026-06-20" },
      trial: { status: "active", days_left: 12, outbound_used: 6, outbound_cap: 25 },
      usage: { agents: 2, calls: 41, outbound: 6 },
    });
  }
  if (pathname === "/api/billing/plans") {
    return json({
      plans: [
        { id: "starter", name: "Starter", price: 99, agents: 1 },
        { id: "growth", name: "Growth", price: 299, agents: 3 },
      ],
    });
  }
  if (pathname === "/api/agents") return json({ agents });
  if (pathname.match(/^\/api\/agents\/[^/]+\/performance$/)) {
    return json({
      callCount: 28,
      totalMinutes: 118,
      avgScore: 91,
      sentiment: { positive: 19, neutral: 7, negative: 2 },
      sparkline: [2, 3, 5, 4, 6, 3, 5],
    });
  }
  if (pathname.match(/^\/api\/agents\/[^/]+\/scorecard$/)) {
    return json({ score: 92, rubric: [], trend: [] });
  }
  if (pathname.match(/^\/api\/agents\/[^/]+\/workspace\/messages$/)) {
    return json({ messages: [{ role: "assistant", content: "Ready to coach this agent.", created_at: now }] });
  }
  if (pathname.match(/^\/api\/agent-config\//)) {
    return json({
      personality: "Warm, concise, consultative, and precise under pressure.",
      directives: [
        { id: "dir-1", priority: 1, content: "Never quote unavailable inventory or unapproved pricing." },
        { id: "dir-2", priority: 2, content: "Confirm the caller's preferred callback window before ending." },
      ],
      knowledge: [
        { id: "know-1", content: "Standard inspection windows are 9 AM, 1 PM, and 4 PM local time." },
        { id: "know-2", content: "Growth plan includes three deployed agents and shared team inbox support." },
      ],
      lessons: [{ id: "lesson-1", lesson: "Ask for roof age before proposing an inspection slot.", created_at: now }],
      flow: [],
      actions: [],
    });
  }
  if (pathname === "/api/settings") {
    return json({
      subscription_status: "active",
      max_agents: 3,
      voice_llm_provider: "anthropic",
      voice_llm_model: "claude-sonnet-4-6",
      brand_name: "Wireline",
      primary_color: "#4F1E7B",
      twilio_messaging_enabled: true,
      prospecting_enabled: true,
      target_titles: ["Owner", "Operations Manager"],
      target_industries: ["Home services", "Healthcare"],
      target_states: ["WA", "OR", "CA"],
      target_employee_ranges: ["1,10", "11,50"],
    });
  }
  if (pathname === "/api/phone-numbers") {
    return json({ numbers: [{ id: "pn-1", phone_number: "+1 (555) 010-1000", agent_id: "agent-1", vapi_number_id: "vapi-1" }] });
  }
  if (pathname === "/api/carrier/numbers") return json({ numbers: [] });
  if (pathname === "/api/team") {
    return json({ members: [{ id: "member-1", email: "ops@wireline.test", role: "owner", created_at: now }] });
  }
  if (pathname === "/api/claude/status") {
    return json({ available: true, model: "claude-sonnet-4-6", capabilities: ["routing", "coaching", "drafting"] });
  }
  if (pathname === "/api/health/integrations") {
    return json({
      integrations: [
        { id: "anthropic", label: "Claude", description: "Primary reasoning model", group: "AI", required: true, status: "configured", envVars: [] },
        { id: "vapi", label: "Vapi", description: "Voice carrier", group: "Voice", required: true, status: "configured", envVars: [] },
      ],
    });
  }
  if (pathname === "/api/health/slos") return json({ targets: [], error_budget: 99.9 });
  if (pathname === "/api/oauth/integration-health") return json({ reasons: [] });
  if (pathname === "/api/oauth/crm/status") return json({ connected: false, provider: null });
  if (pathname === "/api/fleet/presence") {
    return json({
      signals: [
        { id: "sig-1", customer_number: "+15555550100", label: "Booking call", urgency: 82, status: "active", started_at: now },
        { id: "sig-2", customer_number: "+15555550200", label: "Escalated pricing", urgency: 91, status: "escalated", started_at: now },
      ],
    });
  }
  if (pathname === "/api/fleet/tasks") return json({ tasks });
  if (pathname === "/api/fleet/activity") return json({ activity: tasks });
  if (pathname === "/api/dashboard/dossiers") {
    return json({
      dossiers: {
        "+15555550100": { full_name: "Jordan Lee", company: "Lee Roofing", job_title: "Owner" },
        "+15555550200": { full_name: "Morgan Park", company: "Ridgeway Dental", job_title: "Office Manager" },
      },
    });
  }
  if (pathname === "/api/dashboard/stats") {
    return json({
      calls_today: 18,
      active_calls: 2,
      hot_leads: 6,
      revenue_at_risk: 12800,
      sentimentBreakdown: { positive: 12, neutral: 5, negative: 1 },
      unitEconomics: { costPerCall: 0.42, revenuePerBookedCall: 118, margin: 92 },
      agents: agents.map((agent, index) => ({ ...agent, calls: 12 + index * 8, booked: 4 + index, score: 91 - index * 4 })),
      trend: [
        { date: "Mon", calls: 12, booked: 3 },
        { date: "Tue", calls: 18, booked: 6 },
        { date: "Wed", calls: 16, booked: 5 },
      ],
    });
  }
  if (pathname === "/api/triage") {
    return json({
      hot_leads: [{ id: "lead-hot-1", agent_id: "agent-1", customer_number: "+15555550100", lead_score: 86, intent_label: "Book inspection", summary: "Ready to schedule", sentiment: "positive", created_at: now }],
      compliance: [],
      pending_tasks: tasks,
      knowledge_gaps: [{ id: "gap-1", agent_id: "agent-1", lesson: "Add warranty answer for roof repairs.", created_at: now }],
      escalations: [{ id: "esc-1", agent_id: "agent-2", customer_number: "+15555550200", lead_score: 91, summary: "Asked for manager approval.", created_at: now }],
      counts: { hot_leads: 1, compliance: 0, pending_tasks: 2, knowledge_gaps: 1, escalations: 1 },
    });
  }
  if (pathname === "/api/pipeline") {
    const lead = { id: "lead-1", customerName: "Jordan Lee", customerNumber: "+15555550100", email: "jordan@example.com", status: "open", pipelineStage: "qualified", campaignSource: "Spring winback", attempts: 2, lastCalledAt: now, lastContactSummary: "Asked for a firm inspection slot.", demo: true };
    return json({
      board: { cold: [], contacted: [], qualified: [lead], demo: [], won: [], lost: [] },
      counts: { cold: 0, contacted: 0, qualified: 1, demo: 0, won: 0, lost: 0 },
    });
  }
  if (pathname === "/api/calls") return json({ calls, hasMore: false, total: calls.length });
  if (pathname === "/api/emails/accounts") return json({ accounts: [{ id: "acct-1", provider: "google", email: "ops@wireline.test", agent_id: "agent-1", created_at: now }] });
  if (pathname === "/api/emails/threads") {
    return json({ threads: [{ id: "thread-1", subject: "Inspection quote", from_email: "jordan@example.com", from_name: "Jordan Lee", unread: true, read: false, updated_at: now, snippet: "Can we lock in tomorrow afternoon?" }] });
  }
  if (pathname.match(/^\/api\/emails\/threads\/[^/]+\/messages$/)) {
    return json({ messages: [{ id: "msg-1", from_email: "jordan@example.com", body: "Can we lock in tomorrow afternoon?", created_at: now }, { id: "msg-2", from_email: "ops@wireline.test", body: "Yes, 2 PM is available.", created_at: now }] });
  }
  if (pathname === "/api/sms/threads") return json({ threads: [{ id: "sms-1", customer_number: "+15555550100", status: "open", unread_count: 1, last_message_at: now, created_at: now }] });
  if (pathname.match(/^\/api\/sms\/threads\/[^/]+\/messages$/)) return json({ messages: [{ id: "sms-msg-1", direction: "in", body: "Can you text the appointment details?", created_at: now }, { id: "sms-msg-2", direction: "out", body: "Absolutely. You are set for 2 PM tomorrow.", created_at: now }] });
  if (pathname === "/api/appointments") {
    return json({ appointments: [{ id: "appt-1", customer_name: "Jordan Lee", customer_phone: "+15555550100", customer_email: "jordan@example.com", title: "Roof inspection", start_time: "2026-05-21T14:00:00.000Z", end_time: "2026-05-21T14:30:00.000Z", status: "Scheduled", agent_id: "agent-1", notes: "Prefers text confirmation." }] });
  }
  if (pathname === "/api/outbound") return json({ leads: [{ id: "out-1", name: "Morgan Park", phone: "+15555550200", status: "queued", company: "Ridgeway Dental", created_at: now }], hasMore: false });
  if (pathname === "/api/campaigns") return json({ campaigns: [{ id: "camp-1", name: "May reactivation", status: "draft", total_leads: 24, created_at: now }] });
  if (pathname.match(/^\/api\/campaigns\/[^/]+\/analytics$/)) return json({ calls: 24, answered: 9, booked: 3, cost: 12.5 });
  if (pathname.match(/^\/api\/campaigns\/[^/]+\/leads$/)) return json({ leads: [] });
  if (pathname === "/api/callbacks") return json({ callbacks: [] });
  if (pathname === "/api/knowledge") return json({ items: [{ id: "kb-1", title: "Pricing FAQ", content: "Growth plan supports three deployed agents.", source: "manual", created_at: now }], knowledge: [] });
  if (pathname === "/api/dnc") return json({ entries: [{ id: "dnc-1", phone_number: "+15555550999", reason: "Customer request", created_at: now }] });
  if (pathname === "/api/audit/events") return json({ events: [{ id: 1, event_type: "agent.updated", action: "settings.changed", severity: "info", actor_email: "ops@wireline.test", resource_id: "agent-1", created_at: now, metadata: {} }] });
  if (pathname === "/api/audit/stats") return json({ total_events: 18, total_api_calls: 420, total_cost_usd: 12.34, by_severity: { critical: 0 } });
  if (pathname.startsWith("/api/insights/")) return insightsMock(pathname, searchParams);
  if (pathname === "/api/voices") return json({ voices: [] });
  if (pathname === "/api/pronunciation-dicts") return json({ dictionaries: [], entries: [] });
  if (pathname === "/api/webhooks") return json({ webhooks: [] });
  if (pathname === "/api/intake/keys") return json({ keys: [] });
  if (pathname === "/api/health") return json({ ok: true });

  return json({ ok: true, items: [], tasks: [], agents, calls: [], appointments: [], accounts: [] });
}

function insightsMock(pathname, searchParams) {
  const days = Number(searchParams.get("days") || 30);
  if (pathname === "/api/insights/funnel") {
    return json({ window_days: days, stages: [{ name: "Answered", count: 84 }, { name: "Qualified", count: 42 }, { name: "Booked", count: 18 }] });
  }
  if (pathname === "/api/insights/campaign-attribution") {
    return json({ window_days: days, campaigns: [{ name: "May reactivation", calls: 32, booked: 8, revenue: 6400 }] });
  }
  if (pathname === "/api/insights/topics") {
    return json({ cached: true, total_analyzed: 128, topics: [{ label: "Pricing", count: 34 }, { label: "Scheduling", count: 28 }, { label: "Warranty", count: 16 }] });
  }
  if (pathname === "/api/insights/heatmap") {
    return json({ window_days: days, grid: [{ weekday: 2, hour: 10, count: 14 }, { weekday: 3, hour: 14, count: 22 }] });
  }
  if (pathname === "/api/insights/leaderboard") {
    return json({ window_days: days, agents: agents.map((agent, index) => ({ agent_id: agent.id, name: agent.name, calls: 30 - index * 4, booked: 9 - index, score: 92 - index * 5 })) });
  }
  if (pathname === "/api/insights/failure-modes") {
    return json({ cached: true, modes: [{ label: "Pricing requested", count: 7, recommendation: "Give agents a concise price-range policy." }] });
  }
  if (pathname === "/api/insights/ai-spend") {
    return json({ window_days: days, totals: { cost: 23.45, input_tokens: 180000, output_tokens: 42000 }, by_day: [{ day: "May 18", cost: 7.3 }, { day: "May 19", cost: 8.2 }, { day: "May 20", cost: 7.95 }], by_action: [{ action: "email-draft", cost: 9.4 }, { action: "call-summary", cost: 6.1 }], by_model: [{ model: "claude-sonnet-4-6", cost: 18.2 }, { model: "gemini-1.5-flash", cost: 5.25 }] });
  }
  if (pathname === "/api/insights/quality") {
    return json({ count: 42, avgScore: 91, dimensions: { empathy: 94, accuracy: 89, completion: 92 }, distribution: [{ bucket: "90-100", count: 28 }, { bucket: "80-89", count: 10 }, { bucket: "70-79", count: 4 }], trend: [{ date: "Mon", score: 88 }, { date: "Tue", score: 91 }, { date: "Wed", score: 94 }] });
  }
  return json({ ok: true });
}

async function installApiMocks(page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill(mockApi(url.pathname, url.searchParams, route.request().method()));
  });
}

async function seedVisualState(context, authenticated) {
  await context.addInitScript(
    ({ origin, authenticated }) => {
      if (window.location.origin !== origin) return;
    try {
      localStorage.setItem("wireline_cookie_consent", "acknowledged");
      localStorage.setItem("wireline_tour_seen", "true");
      if (authenticated) {
        localStorage.setItem(
          "wireline_session",
          JSON.stringify({
            access_token: "design-audit-token",
            user: {
              id: "visual-user",
              email: "visual.qa@wireline.test",
              full_name: "Visual QA",
              role: "owner",
              is_owner: true,
            },
          }),
        );
      } else {
        localStorage.removeItem("wireline_session");
      }
    } catch {
      // Non-app frames can block localStorage; the app origin still receives this state.
    }
    },
    { origin: new URL(baseURL).origin, authenticated },
  );
}

async function stabilize(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("body", { state: "attached", timeout: 8_000 });
  await page.waitForTimeout(350);
}

async function clickTarget(page, target) {
  const label = target.clickLabel || target.click;
  if (!label) return;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactTextButton = page
    .locator("button")
    .filter({ hasText: new RegExp(`^\\s*${escaped}\\b`, "i") })
    .first();
  const button = (await exactTextButton.isVisible().catch(() => false))
    ? exactTextButton
    : page.getByRole("button", { name: new RegExp(escaped, "i") }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await page.waitForTimeout(180);
  }
}

async function auditViewport(page) {
  return page.evaluate(() => {
    const issues = [];
    const width = window.innerWidth;
    const height = window.innerHeight;
    const doc = document.documentElement;
    if (doc.scrollWidth > width + 2) {
      issues.push({
        type: "horizontal-overflow",
        detail: `${doc.scrollWidth}px document width in ${width}px viewport`,
      });
    }
    const isInsideHorizontalScroller = (node) => {
      let parent = node.parentElement;
      while (parent && parent !== document.body && parent !== document.documentElement) {
        const style = window.getComputedStyle(parent);
        const scrollable = /(auto|scroll|hidden|clip)/.test(style.overflowX);
        if (scrollable && parent.scrollWidth > parent.clientWidth + 2) return true;
        parent = parent.parentElement;
      }
      return false;
    };
    const candidates = Array.from(
      document.querySelectorAll("button, a, input, select, textarea, [role='tab'], [role='button']"),
    );
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        style.visibility === "hidden" ||
        style.display === "none"
      ) {
        continue;
      }
      const visible = rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width;
      if (!visible) continue;
      if (isInsideHorizontalScroller(el)) continue;
      if (rect.left < -2 || rect.right > width + 2) {
        issues.push({
          type: "control-outside-viewport",
          detail: `${el.tagName.toLowerCase()} ${Math.round(rect.left)}..${Math.round(rect.right)}`,
        });
      }
      const text = (el.textContent || "").trim();
      if (text && el.scrollWidth > el.clientWidth + 2 && style.overflowX !== "hidden") {
        issues.push({ type: "control-text-overflow", detail: text.slice(0, 80) });
      }
    }
    return issues.slice(0, 12);
  });
}

async function run() {
  if (!appendMode) {
    await rm(outDir, { recursive: true, force: true });
  }
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const existingManifestPath = path.join(outDir, "manifest.json");
  const existing = appendMode && existsSync(existingManifestPath)
    ? JSON.parse(readFileSync(existingManifestPath, "utf8"))
    : { manifest: [], failures: [] };
  const activeViewportNames = viewportFilter.length ? new Set(viewportFilter) : null;
  const activeViewports = activeViewportNames
    ? viewports.filter((viewport) => activeViewportNames.has(viewport.name))
    : viewports;
  const manifest = existing.manifest.filter(
    (entry) => !activeViewports.some((viewport) => viewport.name === entry.viewport),
  );
  const failures = existing.failures.filter(
    (failure) => !activeViewports.some((viewport) => failure.startsWith(`${viewport.name}/`)),
  );

  try {
    for (const viewport of activeViewports) {
      const viewportDir = path.join(outDir, viewport.name);
      await rm(viewportDir, { recursive: true, force: true });
      await mkdir(viewportDir, { recursive: true });
      for (const auth of [false, true]) {
        const scopedTargets = targets.filter((target) => target.auth === auth);
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
          reducedMotion: "reduce",
        });
        await installApiMocks(context);
        await seedVisualState(context, auth);

        try {
          for (const target of scopedTargets) {
            const page = await context.newPage();
            page.setDefaultTimeout(8_000);
            page.setDefaultNavigationTimeout(15_000);
            const consoleErrors = [];
            page.on("console", (msg) => {
              if (["error", "warning"].includes(msg.type())) {
                consoleErrors.push(`${msg.type()}: ${msg.text()}`);
              }
            });
            page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
            const url = new URL(target.route, baseURL).toString();
            const screenshotPath = path.join(viewportDir, `${target.name}.png`);
            console.log(`[${viewport.name}] ${target.name}`);
            try {
              await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
              await stabilize(page);
              await clickTarget(page, target);
              await stabilize(page);
              const bodyText = (await page.locator("body").innerText({ timeout: 4_000 })).trim();
              const issues = await auditViewport(page);
              await page.screenshot({
                path: screenshotPath,
                fullPage: false,
                animations: "disabled",
                timeout: 10_000,
              });
              manifest.push({
                viewport: viewport.name,
                target: target.name,
                route: target.route,
                path: path.relative(process.cwd(), screenshotPath),
                textLength: bodyText.length,
                issues,
                consoleErrors: consoleErrors.slice(0, 5),
              });
              if (bodyText.length < 20) {
                failures.push(`${viewport.name}/${target.name}: page rendered very little text`);
              }
              if (
                issues.some(
                  (issue) =>
                    issue.type === "horizontal-overflow" ||
                    issue.type === "control-outside-viewport",
                )
              ) {
                failures.push(
                  `${viewport.name}/${target.name}: ${issues.map((issue) => issue.type).join(", ")}`,
                );
              }
            } catch (error) {
              failures.push(`${viewport.name}/${target.name}: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
              await page.close().catch(() => {});
            }
          }
        } finally {
          await context.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const report = [
    "# Wireline Design QA Screenshots",
    "",
    `Base URL: ${baseURL}`,
    `Viewports: ${viewports.map((v) => `${v.name} ${v.width}x${v.height}`).join(", ")}`,
    `Screenshots: ${manifest.length}`,
    "",
    failures.length ? "## Issues" : "## Issues",
    failures.length ? failures.map((failure) => `- ${failure}`).join("\n") : "- None detected by the viewport audit.",
    "",
    "## Manifest",
    ...manifest.map((entry) => `- ${entry.viewport}/${entry.target}: ${entry.path}`),
    "",
  ].join("\n");

  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify({ baseURL, viewports, targets, manifest, failures }, null, 2));
  await writeFile(path.join(outDir, "REPORT.md"), report);

  console.log(`Design QA complete: ${manifest.length} screenshots written to ${path.relative(process.cwd(), outDir)}`);
  if (failures.length) {
    console.error(`Detected ${failures.length} visual audit issue(s). See ${path.relative(process.cwd(), path.join(outDir, "REPORT.md"))}`);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});