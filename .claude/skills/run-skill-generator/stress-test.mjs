#!/usr/bin/env node
/**
 * Wireline Comprehensive Stress Test
 *
 * Exercises every route, sub-tab, toolbar interaction, dropdown, gallery tab,
 * and responsive layout as a heavy user would — using rich mocked API data so
 * every page renders fully without a database.
 *
 * Usage:
 *   node stress-test.mjs
 *   STRESS_SUITES=chat,agents node stress-test.mjs
 *   STRESS_URL=http://localhost:3000 STRESS_HEADED=1 node stress-test.mjs
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = process.env.STRESS_URL || "http://127.0.0.1:4173";
const OUT_DIR = process.env.STRESS_OUT || "/tmp/wireline-stress";
const SS_DIR = path.join(OUT_DIR, "screenshots");
const HEADED = process.env.STRESS_HEADED === "1";
const SUITES_FILTER = process.env.STRESS_SUITES
  ? new Set(process.env.STRESS_SUITES.split(",").map((s) => s.trim()))
  : null;
const [VW, VH] = (process.env.STRESS_VIEWPORT || "1440x900").split("x").map(Number);

[OUT_DIR, SS_DIR].forEach((d) => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
});

// ─── Rich Mock Data ───────────────────────────────────────────────────────────
const MOCK_AGENTS = [
  {
    id: "agent-aria",
    name: "ARIA",
    role: "sales",
    channel: "voice",
    status: "active",
    phone_number: "+1 (847) 555-0110",
    vapi_agent_id: "vapi-aria-001",
    system_prompt: "You are ARIA, an elite outbound sales agent...",
    first_message: "Hi, this is ARIA calling from Brightline...",
    voice_id: "bIHbv24MWmeRgasZH58o",
    voice_provider: "11labs",
    enabled_tools: null,
    language: "en-US",
    kpi_focus: "conversions",
  },
  {
    id: "agent-max",
    name: "MAX",
    role: "customer_service",
    channel: "voice",
    status: "active",
    phone_number: "+1 (847) 555-0111",
    vapi_agent_id: "vapi-max-001",
    system_prompt: "You are MAX, a warm and efficient support specialist...",
    first_message: "Thank you for calling Brightline support, this is MAX...",
    voice_id: "EXAVITQu4vr4xnSDxMaL",
    voice_provider: "11labs",
    enabled_tools: null,
    language: "en-US",
    kpi_focus: "resolutions",
  },
  {
    id: "agent-nova",
    name: "NOVA",
    role: "scheduler",
    channel: "voice",
    status: "active",
    phone_number: "+1 (847) 555-0112",
    vapi_agent_id: "vapi-nova-001",
    system_prompt: "You are NOVA, a HIPAA-aware medical appointment scheduler...",
    first_message: "Hello, this is NOVA from Brightline Medical...",
    voice_id: "21m00Tcm4TlvDq8ikWAM",
    voice_provider: "11labs",
    enabled_tools: null,
    language: "en-US",
    compliance_mode: "hipaa",
    kpi_focus: "qualifications",
  },
  {
    id: "agent-zara",
    name: "ZARA",
    role: "lead_qualifier",
    channel: "email",
    status: "active",
    email_address: "zara@brightline.ai",
    system_prompt: "You are ZARA, handling inbound email triage...",
    voice_id: null,
    enabled_tools: null,
    language: "en-US",
    kpi_focus: "qualifications",
  },
  {
    id: "agent-leo",
    name: "LEO",
    role: "collections",
    channel: "voice",
    status: "paused",
    phone_number: "+1 (847) 555-0113",
    vapi_agent_id: "vapi-leo-001",
    system_prompt: "You are LEO, a compliant collections specialist...",
    first_message: "Hi, this is LEO calling regarding account #...",
    voice_id: "VR6AewLTigWG4xSOukaG",
    voice_provider: "11labs",
    enabled_tools: null,
    language: "en-US",
    compliance_mode: "financial",
    kpi_focus: "general",
  },
];

const STITCH_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1180" viewBox="0 0 900 1180"><rect width="900" height="1180" fill="#EFE9DC"/><rect width="900" height="64" fill="#1A1614"/><circle cx="44" cy="32" r="10" fill="#8B3FD6"/><rect x="64" y="26" width="120" height="12" rx="3" fill="#EFE9DC"/><rect x="660" y="22" width="90" height="20" rx="10" fill="#8B3FD6"/><rect x="770" y="22" width="90" height="20" rx="10" fill="#6B2FA8"/><rect x="80" y="150" width="520" height="44" rx="6" fill="#1A1614"/><rect x="80" y="208" width="440" height="44" rx="6" fill="#4F1E7B"/><rect x="80" y="300" width="620" height="16" rx="4" fill="#1A1614" opacity="0.55"/><rect x="80" y="328" width="560" height="16" rx="4" fill="#1A1614" opacity="0.4"/><rect x="80" y="392" width="180" height="48" rx="8" fill="#8B3FD6"/><rect x="280" y="392" width="160" height="48" rx="8" fill="none" stroke="#4F1E7B" stroke-width="2"/><rect x="80" y="520" width="240" height="300" rx="14" fill="#fff" stroke="#8B3FD6" stroke-opacity="0.25"/><rect x="340" y="520" width="240" height="300" rx="14" fill="#fff" stroke="#8B3FD6" stroke-opacity="0.25"/><rect x="600" y="520" width="240" height="300" rx="14" fill="#fff" stroke="#8B3FD6" stroke-opacity="0.25"/><circle cx="120" cy="572" r="20" fill="#8B3FD6" opacity="0.85"/><circle cx="380" cy="572" r="20" fill="#6B2FA8" opacity="0.85"/><circle cx="640" cy="572" r="20" fill="#10B981" opacity="0.85"/><rect x="100" y="900" width="700" height="200" rx="16" fill="#4F1E7B"/><rect x="140" y="950" width="360" height="22" rx="5" fill="#EFE9DC"/><rect x="600" y="980" width="150" height="44" rx="8" fill="#8B3FD6"/></svg>`)}`;

// Multiple Director conversation scenarios to stress the chat UI
function buildChatScenario(kind) {
  const base = { artifacts: [], fleet: MOCK_AGENTS, featureFlags: { toolExecution: true }, degraded: false };
  const ts = (offset) => new Date(Date.now() - offset * 1000).toISOString();

  if (kind === "stitch") {
    return {
      ...base,
      messages: [
        { id: "u1", role: "user", content: "Design a landing page for my home-services brand, Brightline.", createdAt: ts(120) },
        {
          id: "d1", role: "director", content: "Here's a first pass from Google Stitch — conversion-focused in your brand palette. Flip to **Live HTML** to interact, or **Export** to hand it to your dev team.", createdAt: ts(100), model: "opus", modelLabel: "Opus",
          previews: [
            { conceptId: "stitch-1", title: "Brightline — Hero + Services", rationale: "Google Stitch concept, desktop-first.", kind: "stitch", previewDataUrl: STITCH_SVG, htmlDownloadUrl: "/api/director/files/stitch-1.html?inline=1", imageDownloadUrl: "/api/director/files/stitch-1.png", deviceType: "DESKTOP" },
            { conceptId: "stitch-2", title: "Brightline — Mobile variant", rationale: "Google Stitch concept, mobile-first layout.", kind: "stitch", previewDataUrl: STITCH_SVG, htmlDownloadUrl: "/api/director/files/stitch-2.html?inline=1", deviceType: "MOBILE" },
          ],
        },
      ],
    };
  }

  if (kind === "fleet-action") {
    return {
      ...base,
      messages: [
        { id: "u2", role: "user", content: "ARIA hasn't closed a deal in 3 days. What should we do?", createdAt: ts(300) },
        {
          id: "d2", role: "director",
          content: "I reviewed ARIA's last 47 calls. Three patterns are dragging her close rate:\n\n1. **Objection: 'I need to talk to my spouse'** — she's not using the takeaway close. Recommend coaching her on the _soft urgency_ technique.\n2. **Call duration** averaging 6m 42s — optimal is 4–5m. She's over-explaining the pricing tier.\n3. **Lunch window** (12–1pm) has 0 closes. Reallocate her outbound cadence to 10–11am and 2–4pm.\n\nWant me to update her system prompt with the objection handling or adjust her call window in Ops?",
          createdAt: ts(280), model: "opus", modelLabel: "Opus",
        },
        { id: "u3", role: "user", content: "Yes, update her system prompt with the objection handling.", createdAt: ts(260) },
        { id: "d3", role: "director", content: "Done — I've added a dedicated **Objection Handling** section to ARIA's system prompt covering the spouse objection, price anchoring, and the soft urgency close. Her next call will use the updated version. I'll flag you in 24 hours with the before/after close rate.", createdAt: ts(240), model: "opus", modelLabel: "Opus" },
      ],
    };
  }

  if (kind === "campaign") {
    return {
      ...base,
      messages: [
        { id: "u4", role: "user", content: "Set up an outbound campaign to re-engage our 90-day-dormant leads.", createdAt: ts(500) },
        {
          id: "d4", role: "director",
          content: "Here's my recommended campaign blueprint for the **90-Day Re-engagement** push:\n\n**Wave 1 — Week 1** _(ARIA, 200 contacts/day)_\n- Warm reintroduction call — acknowledge the gap, lead with new value prop\n- Filter: status = dormant AND last_contact > 90 days AND deal_value > $1,500\n\n**Wave 2 — Week 2** _(MAX as backup for no-answers)_\n- SMS nudge with a direct scheduling link\n- Trigger: Wave 1 no-answer after 2 attempts\n\n**Success metric:** ≥12% reconnect rate → booked call\n\nShall I build the campaign or do you want to tweak the filter criteria first?",
          createdAt: ts(480), model: "opus", modelLabel: "Opus",
        },
      ],
    };
  }

  // Default: analysis scenario
  return {
    ...base,
    messages: [
      { id: "u5", role: "user", content: "Give me a full performance breakdown for last week.", createdAt: ts(700) },
      {
        id: "d5", role: "director",
        content: "**Last Week Performance — Week of Jun 1–7**\n\n| Metric | Value | vs. Prior Week |\n|---|---|---|\n| Total calls | 1,847 | +12% ↑ |\n| Connected rate | 38.4% | +2.1pp ↑ |\n| Close rate | 11.2% | -0.8pp ↓ |\n| Avg handle time | 5m 14s | -22s ✓ |\n| Escalations | 23 | -8 ✓ |\n\n**Top agent:** ARIA (142 closes, 13.8% rate)  \n**Underperformer:** LEO (18 closes, 6.2% rate — collections cohort)\n\nClose rate dip is entirely LEO's collections vertical — the broader sales fleet improved. Recommend a LEO coaching session on the FDCPA-safe close. Want me to draft it?",
        createdAt: ts(680), model: "opus", modelLabel: "Opus",
      },
    ],
  };
}

// Insights mock data for each view
const FUNNEL_DATA = { stages: [{ name: "Dialed", count: 1847 }, { name: "Connected", count: 709 }, { name: "Qualified", count: 284 }, { name: "Closed", count: 79 }], period: "30d" };
const GOALS_DATA = {
  period: "2026-06",
  period_label: "June 2026",
  metrics: [
    { id: "calls_handled", label: "Calls handled", unit: "calls", description: "Total calls completed this month.", accent: "#8B3FD6" },
    { id: "appointments_booked", label: "Appointments booked", unit: "appointments", description: "Appointments scheduled this month.", accent: "#8B3FD6" },
    { id: "qualified_leads", label: "Qualified leads", unit: "leads", description: "High-intent leads this month.", accent: "#8B3FD6" },
    { id: "voice_minutes", label: "Voice minutes", unit: "minutes", description: "Total talk time this month.", accent: "#6B2FA8" },
  ],
  actuals: { calls_handled: 3847, appointments_booked: 214, qualified_leads: 189, voice_minutes: 9620 },
  goals: [
    { id: "g1", metric: "calls_handled", metric_label: "Calls handled", unit: "calls", accent: "#8B3FD6", label: null, target: 4000, actual: 3847, percent: 96.2, fraction: 0.962, remaining: 153, pace_fraction: 0.88, projected: 4380, days_left: 8, status: "ahead" },
    { id: "g2", metric: "appointments_booked", metric_label: "Appointments booked", unit: "appointments", accent: "#8B3FD6", label: null, target: 200, actual: 214, percent: 107, fraction: 1.07, remaining: 0, pace_fraction: 0.88, projected: 243, days_left: 8, status: "achieved" },
    { id: "g3", metric: "qualified_leads", metric_label: "Qualified leads", unit: "leads", accent: "#8B3FD6", label: null, target: 250, actual: 189, percent: 75.6, fraction: 0.756, remaining: 61, pace_fraction: 0.88, projected: 215, days_left: 8, status: "behind" },
  ],
};
const HEATMAP_DATA = { cells: Array.from({ length: 7 * 24 }, (_, i) => ({ day: Math.floor(i / 24), hour: i % 24, value: Math.round(Math.random() * 40) })) };
const LEADERBOARD_DATA = { agents: MOCK_AGENTS.map((a, i) => ({ ...a, closes: 142 - i * 25, rate: (13.8 - i * 1.5).toFixed(1), calls: 1028 - i * 180 })) };
const TOPICS_DATA = { topics: [{ name: "Pricing objection", count: 234, sentiment: -0.4 }, { name: "Competitor mention", count: 187, sentiment: -0.2 }, { name: "Positive close signal", count: 412, sentiment: 0.8 }, { name: "Callback request", count: 156, sentiment: 0.1 }] };
const FAILURES_DATA = { failures: [{ type: "No answer after 3 attempts", count: 892, pct: 48 }, { type: "Voicemail drop", count: 412, pct: 22 }, { type: "Wrong number", count: 89, pct: 5 }] };
const LATENCY_DATA = { p50: 320, p95: 890, p99: 1240, samples: 1847, breakdown: [{ label: "STT", ms: 80 }, { label: "LLM", ms: 190 }, { label: "TTS", ms: 50 }] };
const AI_SPEND_DATA = { totalUsd: 284.42, breakdown: [{ model: "claude-sonnet-4-6", calls: 18470, usd: 148.22 }, { model: "claude-opus-4-7", calls: 823, usd: 136.20 }] };
const QUALITY_DATA = { scorecards: MOCK_AGENTS.slice(0, 3).map((a) => ({ agentId: a.id, name: a.name, avgScore: (7.8 + Math.random()).toFixed(1), empathy: 8.2, clarity: 7.9, compliance: 9.1, calls: 412 })) };
const ATTRIBUTION_DATA = { channels: [{ name: "Outbound dial", revenue: 48200, closes: 67 }, { name: "Inbound call", revenue: 31400, closes: 44 }, { name: "Email follow-up", revenue: 12800, closes: 18 }] };

// Ops mock data
const OPS_DATA = { liveCallers: [], pendingActions: 3, fleetAgents: 5, escalations: 1, actions: [{ id: "a1", type: "approval", label: "Deploy ARIA to campaign C-041", createdAt: new Date().toISOString() }, { id: "a2", type: "review", label: "Flagged call from LEO — potential FDCPA issue", createdAt: new Date().toISOString() }] };

// Integrations mock
const INTEGRATIONS_DATA = { carriers: [{ id: "c1", provider: "email", name: "Gmail", status: "connected", email: "outbound@brightline.ai" }, { id: "c2", provider: "outlook", name: "Outlook", status: "disconnected" }], connected: [{ id: "i1", name: "HubSpot CRM", status: "active", syncedAt: new Date().toISOString() }, { id: "i2", name: "Google Calendar", status: "active", syncedAt: new Date().toISOString() }] };

// Admin/settings mock
const SETTINGS_DATA = {
  branding: { platformName: "Brightline OS", primaryColor: "#8B3FD6", logoUrl: "https://assets.yoursite.com/logo.png" },
  team: [{ id: "t1", email: "mike@brightline.ai", role: "owner", name: "Mike Laurenzo" }, { id: "t2", email: "sarah@brightline.ai", role: "admin", name: "Sarah Chen" }, { id: "t3", email: "dev@brightline.ai", role: "member", name: "Dev Account" }],
  billing: { plan: "pro", status: "active", nextBillingDate: "2026-07-06", amount: 499 },
};

// Training mock for all sub-tabs
const TRAINING_DATA = {
  knowledge: { entries: [{ id: "k1", title: "Objection: Price Too High", content: "Use the ROI reframe...", category: "objection-handling" }, { id: "k2", title: "Company Overview", content: "Brightline is a home-services platform...", category: "company-info" }, { id: "k3", title: "Product: Premium Plan", content: "The Premium Plan includes...", category: "product" }] },
  voices: { voiceId: "eleven-aria-v2", provider: "elevenlabs", stability: 0.75, similarity: 0.85, style: 0.3, speed: 1.05 },
  pronunciation: { rules: [{ word: "Brightline", ipa: "braɪtlaɪn" }, { word: "ARIA", ipa: "ɛːriə" }, { word: "FDCPA", ipa: "ɛf diː siː piː eɪ" }] },
};

// ─── API Mock Router ──────────────────────────────────────────────────────────
let _chatScenario = "stitch";

function mockApi(urlPath, searchParams) {
  if (urlPath.includes("/auth/session")) return { user: { id: "usr-001", email: "mike@brightline.ai", full_name: "Mike Laurenzo", role: "owner", is_owner: true } };
  if (urlPath.includes("/nav-counts")) return { triage: 3, actions: 2, email: 1 };

  // Director Chat
  if (urlPath.includes("/director/messages")) return buildChatScenario(_chatScenario);
  if (urlPath.includes("/director/files")) return "<html><body><p>Live HTML mock</p></body></html>";

  // Agents
  if (urlPath.includes("/agents") && !urlPath.includes("/agent-")) return { agents: MOCK_AGENTS };
  if (/\/agents\/[^/]+\/scorecard/.test(urlPath)) return {
    kpi_focus: "conversions", window_days: 30,
    primary: { label: "Close rate", value: 14.2, format: "percent", delta_pct: 3.1, trend: [11.2, 12.4, 11.8, 13.1, 14.2] },
    secondary: [
      { label: "Calls handled", value: 1028, format: "number" },
      { label: "Avg duration", value: 187, format: "seconds" },
      { label: "CSAT", value: 8.7, format: "score" },
    ],
    sample_size: 1028,
  };
  if (/\/agent-config\/[^/]+/.test(urlPath)) return { personality: "You are ARIA, a top-performing Brightline sales agent. You are warm, confident, and relentlessly helpful.", directives: [{ id: "d1", type: "must_do", text: "Always confirm the caller's name at the start." }, { id: "d2", type: "must_not", text: "Never discuss competitor pricing." }], knowledge: [] };

  // Training
  if (urlPath.includes("/training/knowledge") || urlPath.includes("/knowledge-base")) return TRAINING_DATA.knowledge;
  if (urlPath.includes("/training/voices") || urlPath.includes("/voice-config")) return TRAINING_DATA.voices;
  if (urlPath.includes("/training/pronunciation")) return TRAINING_DATA.pronunciation;

  // Ops
  if (urlPath.includes("/ops/actions") || urlPath.includes("/actions")) return OPS_DATA.actions;
  if (urlPath.includes("/ops")) return OPS_DATA;

  // Insights
  if (urlPath.includes("/insights/funnel") || urlPath.includes("/funnel")) return FUNNEL_DATA;
  if (urlPath.includes("/insights/goals") || urlPath.includes("/goals")) return GOALS_DATA;
  if (urlPath.includes("/insights/heatmap") || urlPath.includes("/heatmap")) return HEATMAP_DATA;
  if (urlPath.includes("/insights/leaderboard") || urlPath.includes("/leaderboard")) return LEADERBOARD_DATA;
  if (urlPath.includes("/insights/topics") || urlPath.includes("/topics")) return TOPICS_DATA;
  if (urlPath.includes("/insights/failures") || urlPath.includes("/failures")) return FAILURES_DATA;
  if (urlPath.includes("/insights/latency") || urlPath.includes("/latency")) return LATENCY_DATA;
  if (urlPath.includes("/insights/spend") || urlPath.includes("/spend")) return AI_SPEND_DATA;
  if (urlPath.includes("/insights/quality") || urlPath.includes("/quality") || urlPath.includes("/scorecard")) return QUALITY_DATA;
  if (urlPath.includes("/insights/attribution") || urlPath.includes("/attribution")) return ATTRIBUTION_DATA;

  // Integrations
  if (urlPath.includes("/emails/accounts")) return { accounts: [{ id: "ea1", provider: "google", email: "outbound@brightline.ai", status: "active", label: "Gmail (Brightline)" }, { id: "ea2", provider: "microsoft", email: "support@brightline.ai", status: "active", label: "Outlook (Support)" }] };
  if (urlPath.includes("/integrations")) return INTEGRATIONS_DATA;

  // Audit log
  if (urlPath.includes("/audit/stats")) return { total_events: 142, total_api_calls: 89, total_cost_usd: 4.23, by_severity: { info: 98, warning: 32, error: 8, critical: 4 } };
  if (urlPath.includes("/audit")) return { events: [{ id: "ev1", timestamp: new Date().toISOString(), category: "auth", action: "login", severity: "info", actor: "mike@brightline.ai", metadata: {} }, { id: "ev2", timestamp: new Date().toISOString(), category: "agent", action: "config_updated", severity: "info", actor: "mike@brightline.ai", metadata: { agent: "ARIA" } }], total: 142, page: 1, per_page: 50 };

  // Settings / Admin
  if (urlPath.includes("/settings/branding") || urlPath.includes("/branding")) return SETTINGS_DATA.branding;
  if (urlPath.includes("/settings/team") || urlPath.includes("/team")) return { members: SETTINGS_DATA.team };
  if (urlPath.includes("/settings/billing") || urlPath.includes("/billing")) return SETTINGS_DATA.billing;
  if (urlPath.includes("/settings")) return SETTINGS_DATA;

  // Billing plans
  if (urlPath.includes("/billing/plans")) return { plans: [{ id: "starter", name: "Starter", price: 99 }, { id: "pro", name: "Pro", price: 499 }, { id: "business", name: "Business", price: 1499 }] };

  // List endpoints
  if (/(logs|leads|threads|messages|events|appointments|campaigns|list|history|items|calls)/.test(urlPath)) return [];

  return {};
}

// ─── Test Runner Primitives ───────────────────────────────────────────────────
const results = [];
let page, context;

async function step(suite, name, fn) {
  if (SUITES_FILTER && !SUITES_FILTER.has(suite)) return;
  const t0 = Date.now();
  const entry = { suite, step: name, passed: true, durationMs: 0, errors: [], flags: [] };
  const consoleErrors = [];

  const onError = (msg) => {
    if (msg.type() === "error") {
      const txt = msg.text().slice(0, 200);
      if (!txt.includes("ERR_FAILED") && !txt.includes("MIME type") && !txt.includes("net::ERR_ABORTED")) {
        consoleErrors.push(txt);
      }
    }
  };
  page.on("console", onError);

  try {
    await fn(entry);
    const ssName = `${suite}--${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    await page.screenshot({ path: path.join(SS_DIR, ssName), type: "png" });
  } catch (err) {
    entry.passed = false;
    entry.errors.push(`STEP_FAILED: ${err.message.slice(0, 200)}`);
    try {
      const ssName = `${suite}--${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ERR.png`;
      await page.screenshot({ path: path.join(SS_DIR, ssName), type: "png" });
    } catch { /* ignore */ }
  } finally {
    page.removeListener("console", onError);
    entry.durationMs = Date.now() - t0;
    entry.errors.push(...consoleErrors.map((e) => `CONSOLE_ERROR: ${e}`));
    if (consoleErrors.length > 0) entry.passed = false;
    results.push(entry);
    const icon = entry.passed ? (entry.flags.length ? "⚡" : "✓") : "✗";
    process.stdout.write(`  ${icon} [${suite}] ${name} (${entry.durationMs}ms)${entry.flags.length ? " flags: " + entry.flags.join(", ") : ""}\n`);
    if (!entry.passed) entry.errors.forEach((e) => process.stdout.write(`      → ${e}\n`));
  }
}

async function nav(url, opts = {}) {
  await page.goto(BASE_URL + url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(opts.settle ?? 1200);
}

async function click(selector, opts = {}) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "visible", timeout: 5000 });
  await el.click(opts);
  await page.waitForTimeout(opts.settle ?? 500);
}

async function checkDeadSpace(entry, threshold = 80) {
  const gap = await page.evaluate(() => {
    const stage = document.querySelector(".workspace-stage, .client-console__stage, main");
    if (!stage) return 0;
    // Skip fixed-height overflow:hidden containers (the authenticated console layout) —
    // they clip content intentionally and :last-child bottom would equal viewport height
    const stageStyle = getComputedStyle(stage);
    if (stageStyle.overflowY === "hidden" || stageStyle.overflow === "hidden") return 0;
    // For scrollable containers, find the lowest actually-rendered visible element
    const children = Array.from(stage.querySelectorAll("*"));
    const stageBtm = stage.getBoundingClientRect().bottom;
    let maxBottom = stage.getBoundingClientRect().top;
    for (const el of children) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.bottom > maxBottom && r.bottom <= stageBtm + 2) {
        maxBottom = r.bottom;
      }
    }
    return Math.max(0, Math.round(stageBtm - maxBottom));
  });
  if (gap > threshold) entry.flags.push(`BOTTOM_DEAD_SPACE_${gap}px`);
}

// ─── Suite: Director Chat ─────────────────────────────────────────────────────
async function suitChat() {
  console.log("\n▸ Suite: chat");

  // Scenario 1: Stitch design + gallery interactions
  _chatScenario = "stitch";
  await step("chat", "Stitch conversation loads", async (e) => {
    await nav("/chat");
    const bubble = page.locator(".wl-director-bubble, [class*='director-bubble']").first();
    await bubble.waitFor({ state: "visible", timeout: 8000 });
  });

  await step("chat", "Stitch gallery — Screenshot tab visible", async (e) => {
    // The gallery renders when previews[0].kind === "stitch"
    const gallery = page.locator("[class*='stitch'], [class*='Stitch'], [data-testid*='stitch']").first();
    const found = await gallery.isVisible().catch(() => false);
    if (!found) e.flags.push("ELEMENT_NOT_FOUND: stitch gallery");
  });

  await step("chat", "Stitch gallery — Screenshot tab active by default", async (e) => {
    // Screenshot tab is the default — verify the design preview image is visible
    const previewImg = page.locator(".wl-stitch-gallery img, .wl-stitch-device img").first();
    const found = await previewImg.isVisible().catch(() => false);
    if (!found) e.flags.push("ELEMENT_NOT_FOUND: stitch design preview image");
  });

  await step("chat", "Stitch gallery — Live HTML tab click", async (e) => {
    // Tabs are: Screenshot, Live HTML, Export
    const liveHtmlBtn = page.getByRole("button", { name: /live html/i }).first();
    const found = await liveHtmlBtn.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: Live HTML tab"); return; }
    await liveHtmlBtn.click();
    await page.waitForTimeout(600);
  });

  await step("chat", "Stitch gallery — Export tab click", async (e) => {
    const exportBtn = page.getByRole("button", { name: /^export$/i }).first();
    const found = await exportBtn.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: Export tab"); return; }
    await exportBtn.click();
    await page.waitForTimeout(400);
    // Return to Screenshot tab
    const screenshotBtn = page.getByRole("button", { name: /screenshot/i }).first();
    const ssFound = await screenshotBtn.isVisible().catch(() => false);
    if (ssFound) await screenshotBtn.click();
    await page.waitForTimeout(300);
  });

  await step("chat", "Stitch gallery — pagination Next/Prev variant", async (e) => {
    // Pagination buttons have aria-label="Next variant" / "Previous variant"
    const nextBtn = page.getByRole("button", { name: /next variant/i }).first();
    const found = await nextBtn.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: gallery Next variant button"); return; }
    await nextBtn.click();
    await page.waitForTimeout(500);
    // Navigate back
    const prevBtn = page.getByRole("button", { name: /previous variant/i }).first();
    const prevFound = await prevBtn.isVisible().catch(() => false);
    if (prevFound) { await prevBtn.click(); await page.waitForTimeout(300); }
  });

  await step("chat", "Stitch gallery — device label shows Desktop/Mobile", async (e) => {
    // Device type shown as info label next to "Google Stitch" chip (not a button)
    const deviceLabel = page.getByText(/desktop|mobile|tablet|responsive/i).first();
    const found = await deviceLabel.isVisible().catch(() => false);
    if (!found) e.flags.push("ELEMENT_NOT_FOUND: device type label in gallery");
  });

  // Scenario 2: Fleet action conversation
  _chatScenario = "fleet-action";
  await step("chat", "Fleet-action conversation loads", async (e) => {
    await nav("/chat");
    const bubble = page.locator(".wl-director-bubble, [class*='director-bubble']").first();
    await bubble.waitFor({ state: "visible", timeout: 8000 });
    // Verify bold/numbered list markdown renders (no table in this scenario)
    const hasBold = await page.locator("strong").first().isVisible().catch(() => false);
    if (!hasBold) e.flags.push("MARKDOWN_BOLD_NOT_RENDERED");
  });

  // Scenario 3: Analysis conversation (contains markdown table)
  _chatScenario = "analysis";
  await step("chat", "Analysis conversation with markdown table", async (e) => {
    await nav("/chat");
    await page.waitForTimeout(1400);
    // This scenario has a markdown table in the message
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    if (!hasTable) e.flags.push("MARKDOWN_TABLE_NOT_RENDERED");
  });

  // Scenario 4: Campaign conversation
  _chatScenario = "campaign";
  await step("chat", "Campaign conversation loads", async (e) => {
    await nav("/chat");
    await page.waitForTimeout(1400);
  });

  // Composer toolbar interactions (back to stitch scenario for rich context)
  _chatScenario = "stitch";
  await step("chat", "Composer toolbar — model picker opens", async (e) => {
    await nav("/chat");
    await page.waitForTimeout(1400);
    // Click model picker button
    const picker = page.getByRole("button", { name: /model|auto|sonnet|opus/i }).first();
    const found = await picker.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: model picker"); return; }
    await picker.click();
    await page.waitForTimeout(400);
    // Verify dropdown/popover opened
    const dropdown = page.getByRole("listbox").first();
    const open = await dropdown.isVisible().catch(() => false);
    if (!open) e.flags.push("INTERACTION_FAILED: model picker did not open");
  });

  await step("chat", "Composer toolbar — connections chip", async (e) => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const chip = page.getByRole("button", { name: /connect/i }).first();
    const found = await chip.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: connections chip"); return; }
    await chip.click();
    await page.waitForTimeout(500);
  });

  await step("chat", "Composer toolbar — capabilities chip", async (e) => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const chip = page.getByRole("button", { name: /capabilit/i }).first();
    const found = await chip.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: capabilities chip"); return; }
    await chip.click();
    await page.waitForTimeout(600);
    // Should reveal catalog panel
    const catalog = page.locator("[class*='catalog'], [class*='Catalog']").first();
    const panelOpen = await catalog.isVisible().catch(() => false);
    if (!panelOpen) e.flags.push("INTERACTION_FAILED: capabilities catalog did not expand");
  });

  await step("chat", "Composer toolbar — deep analysis toggle", async (e) => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // Deep analysis: aria-label = DIRECTOR_DEEP_MODE_COPY.hint (contains "Opus + extended thinking")
    // Also try matching by aria-pressed attribute (it's the only pressed button in the toolbar area)
    const deepBtn = page.locator(
      "button[aria-label*='Opus + extended thinking'], button[aria-label*='extended thinking'], button[aria-label*='deep analysis' i]"
    ).first();
    const found = await deepBtn.isVisible().catch(() => false);
    if (!found) {
      // Soft flag: deep analysis toggle only shows for non-OpenRouter, non-coaching mode
      e.flags.push("ELEMENT_NOT_FOUND: deep analysis toggle (may be hidden by model/coach state)");
      return;
    }
    const pressedBefore = await deepBtn.getAttribute("aria-pressed").catch(() => null);
    await deepBtn.click();
    await page.waitForTimeout(400);
    const pressedAfter = await deepBtn.getAttribute("aria-pressed").catch(() => null);
    if (pressedBefore === pressedAfter) e.flags.push("INTERACTION_FAILED: deep analysis toggle state unchanged");
    // Toggle back off
    await deepBtn.click().catch(() => {});
    await page.waitForTimeout(300);
  });

  await step("chat", "Composer — type a message and check char count", async (e) => {
    const textarea = page.locator("textarea, [contenteditable='true'], [role='textbox']").first();
    const found = await textarea.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: chat composer"); return; }
    await textarea.click();
    await textarea.fill("What is the conversion rate this week and how does it compare to last month?");
    await page.waitForTimeout(300);
    // Verify text was entered
    const val = await textarea.inputValue().catch(async () => await textarea.textContent());
    if (!val || val.length < 10) e.flags.push("INTERACTION_FAILED: could not type in composer");
    // Clear it
    await textarea.fill("");
  });

  await step("chat", "Director header and clear button visible", async (e) => {
    const header = page.getByText("Director", { exact: false }).first();
    const found = await header.isVisible().catch(() => false);
    if (!found) e.flags.push("ELEMENT_NOT_FOUND: Director header");
    const clearBtn = page.getByRole("button", { name: /clear/i }).first();
    const clearFound = await clearBtn.isVisible().catch(() => false);
    if (!clearFound) e.flags.push("ELEMENT_NOT_FOUND: Clear button");
  });
}

// ─── Suite: Agents ────────────────────────────────────────────────────────────
async function suiteAgents() {
  console.log("\n▸ Suite: agents");

  await step("agents", "Template gallery loads with agent cards", async (e) => {
    await nav("/agents");
    // Template cards should be visible
    const cards = page.locator("[class*='template'], [class*='Template'], button:has-text('Deploy Agent')");
    const count = await cards.count().catch(() => 0);
    if (count === 0) e.flags.push("ELEMENT_NOT_FOUND: template cards");
  });

  await step("agents", "Template gallery — search filter", async (e) => {
    const search = page.getByPlaceholder(/search/i).first();
    const found = await search.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: search input"); return; }
    await search.fill("sales");
    await page.waitForTimeout(600);
    await search.fill("");
  });

  // Test each category filter chip — actual labels are mixed-case, filters are plain buttons (not role=tab)
  const CATEGORIES = ["Sales & Revenue", "Customer Support", "Scheduling", "Collections & Finance", "Marketing", "E-commerce", "Personal & Lifestyle"];
  for (const cat of CATEGORIES) {
    await step("agents", `Template gallery — filter: ${cat}`, async (e) => {
      // Build regex from words only (handles the & separator gracefully)
      const words = cat.split(/[^a-zA-Z]+/).filter(Boolean);
      const regex = new RegExp(words.join("[^a-zA-Z]+"), "i");
      const btn = page.getByRole("button", { name: regex }).first();
      const found = await btn.isVisible().catch(() => false);
      if (!found) { e.flags.push(`ELEMENT_NOT_FOUND: category filter "${cat}"`); return; }
      await btn.click();
      await page.waitForTimeout(500);
    });
  }

  // Reset to ALL
  await step("agents", "Template gallery — reset to ALL", async (e) => {
    const allBtn = page.getByRole("button", { name: /^all$/i }).first();
    const found = await allBtn.isVisible().catch(() => false);
    if (found) await allBtn.click();
    await page.waitForTimeout(400);
  });

  await step("agents", "MY FLEET tab with 5 agents", async (e) => {
    // Sub-tabs render as role="tab" (ShadButton with role="tab" in ClientSubTabs)
    const fleetTab = page.getByRole("tab", { name: /my fleet/i }).first();
    const found = await fleetTab.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: MY FLEET tab"); return; }
    await fleetTab.click();
    await page.waitForTimeout(800);
    // Should show agent list
    const agentNames = page.getByText("ARIA").first();
    const hasAgents = await agentNames.isVisible().catch(() => false);
    if (!hasAgents) e.flags.push("ELEMENT_NOT_FOUND: agent ARIA in fleet");
  });

  await step("agents", "Agent card — hover state visible", async (e) => {
    const firstCard = page.locator("[class*='agent-card'], [class*='fleet-card'], [class*='AgentCard']").first();
    const found = await firstCard.isVisible().catch(() => false);
    if (found) await firstCard.hover();
    await page.waitForTimeout(300);
  });
}

// ─── Suite: Training ──────────────────────────────────────────────────────────
async function suiteTraining() {
  console.log("\n▸ Suite: training");

  // AgentTraining internal tabs: labels the buttons show (NOT URL params — tabs are clicked in-component)
  // The page-level ?tab= only knows about "database" (Knowledge). Other tabs are driven by clicking.
  // Labels come from page-sub-tabs.ts (WorkspaceTopBar), not from AgentTraining internal labels
  const TAB_LABELS = ["Knowledge", "Voices", "Pronunciation", "Simulator", "Flow"];

  // Load the training page for the first agent
  await step("training", "Training page loads with agent selected", async (e) => {
    await nav(`/training?agent=${MOCK_AGENTS[0].id}`);
    await page.waitForTimeout(1500);
    // Training sub-tabs are role="tab" in WorkspaceTopBar's ClientSubTabs (div[role=tablist])
    // Training sub-tabs are rendered as role="tab" via WorkspaceTopBar's ClientSubTabs (div[role=tablist])
    const knowledgeTab = page.getByRole("tab", { name: /knowledge/i }).first();
    const found = await knowledgeTab.isVisible().catch(() => false);
    if (!found) e.flags.push("ELEMENT_NOT_FOUND: Knowledge tab");
  });

  // Click each internal tab in sequence (stays on same agent, same page)
  for (const label of TAB_LABELS) {
    await step("training", `Sub-tab: ${label}`, async (e) => {
      // Use text filter — training tab buttons include a HelpTooltip "?" in their content
      const tabBtn = page.getByRole("tab", { name: new RegExp(label, "i") }).first();
      const found = await tabBtn.isVisible().catch(() => false);
      if (!found) { e.flags.push(`ELEMENT_NOT_FOUND: ${label} tab button`); return; }
      await tabBtn.click();
      await page.waitForTimeout(700);
    });
  }

  await step("training", "Agent selector sidebar — switch between agents", async (e) => {
    // Navigate fresh so the sidebar is visible and settled
    await nav(`/training?agent=${MOCK_AGENTS[0].id}`);
    await page.waitForTimeout(1500);
    // Desktop sidebar agents — `aside button` contains the agent name; wait for load
    await page.waitForTimeout(500);
    const secondAgent = page.locator("aside").getByRole("button", { name: /max/i }).first();
    const found = await secondAgent.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: MAX in training sidebar"); return; }
    await secondAgent.click();
    await page.waitForTimeout(600);
  });
}

// ─── Suite: Ops ───────────────────────────────────────────────────────────────
async function suiteOps() {
  console.log("\n▸ Suite: ops");

  await step("ops", "Live Floor tab — empty state + fleet pulse", async (e) => {
    await nav("/ops");
    await page.waitForTimeout(1400);
    // Check for key sections
    const liveFloor = page.getByText(/live floor/i).first();
    const found = await liveFloor.isVisible().catch(() => false);
    if (!found) e.flags.push("ELEMENT_NOT_FOUND: Live Floor heading");
    await checkDeadSpace(e);
  });

  await step("ops", "Actions tab", async (e) => {
    // Ops sub-tabs render as role="tab" in ClientSubTabs
    const actionsTab = page.getByRole("tab", { name: /actions/i }).first();
    const found = await actionsTab.isVisible().catch(() => false);
    if (found) await actionsTab.click();
    await page.waitForTimeout(700);
  });

  await step("ops", "Analytics tab", async (e) => {
    const analyticsTab = page.getByRole("tab", { name: /analytics/i }).first();
    const found = await analyticsTab.isVisible().catch(() => false);
    if (found) await analyticsTab.click();
    await page.waitForTimeout(700);
  });

  await step("ops", "Fleet Pulse panel visible", async (e) => {
    await nav("/ops");
    await page.waitForTimeout(1400);
    const pulse = page.getByText(/fleet pulse/i).first();
    const found = await pulse.isVisible().catch(() => false);
    if (!found) e.flags.push("ELEMENT_NOT_FOUND: Fleet Pulse panel");
  });

  await step("ops", "Escalations panel visible", async (e) => {
    const escalations = page.getByText(/escalation/i).first();
    const found = await escalations.isVisible().catch(() => false);
    if (!found) e.flags.push("ELEMENT_NOT_FOUND: Escalations panel");
  });
}

// ─── Suite: Insights ─────────────────────────────────────────────────────────
async function suiteInsights() {
  console.log("\n▸ Suite: insights");

  const VIEWS = [
    { group: "performance", view: "funnel", label: "Funnel" },
    { group: "performance", view: "goals", label: "Goals" },
    { group: "performance", view: "attribution", label: "Attribution" },
    { group: "performance", view: "topics", label: "Topics" },
    { group: "performance", view: "heatmap", label: "Heatmap" },
    { group: "performance", view: "leaderboard", label: "Leaderboard" },
    { group: "quality", view: "failures", label: "Failures" },
    { group: "quality", view: "latency", label: "Latency" },
    { group: "quality", view: "spend", label: "AI Spend" },
    { group: "quality", view: "quality", label: "Scorecards" },
  ];

  for (const { group, view, label } of VIEWS) {
    await step("insights", `View: ${label} (${group})`, async (e) => {
      await nav(`/insights?tab=${group}&view=${view}`);
      await page.waitForTimeout(1200);
      await checkDeadSpace(e, 100);
    });
  }

  // Day-window selectors
  const DAY_OPTS = [7, 14, 30, 60, 90];
  await step("insights", "Day window — cycle all 5 selectors", async (e) => {
    await nav("/insights?tab=performance&view=funnel");
    await page.waitForTimeout(1000);
    for (const d of DAY_OPTS) {
      const btn = page.getByRole("button", { name: new RegExp(`^${d}d$`, "i") }).first();
      const found = await btn.isVisible().catch(() => false);
      if (!found) { e.flags.push(`ELEMENT_NOT_FOUND: day selector ${d}d`); continue; }
      await btn.click();
      await page.waitForTimeout(400);
    }
  });

  // Group tab switching — these are role="tab" in ClientSubTabs
  await step("insights", "Switch from Performance → Quality group tab", async (e) => {
    await nav("/insights?tab=performance");
    await page.waitForTimeout(800);
    const qualityTab = page.getByRole("tab", { name: /quality/i }).first();
    const found = await qualityTab.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: Quality group tab"); return; }
    await qualityTab.click();
    await page.waitForTimeout(600);
  });

  await step("insights", "Switch to Revenue group tab", async (e) => {
    const revenueTab = page.getByRole("tab", { name: /revenue/i }).first();
    const found = await revenueTab.isVisible().catch(() => false);
    if (found) {
      await revenueTab.click();
      await page.waitForTimeout(600);
    } else {
      e.flags.push("ELEMENT_NOT_FOUND: Revenue group tab (may not exist in this build)");
    }
  });
}

// ─── Suite: Integrations ──────────────────────────────────────────────────────
async function suiteIntegrations() {
  console.log("\n▸ Suite: integrations");

  await step("integrations", "Integrations page loads", async (e) => {
    await nav("/integrations");
    await page.waitForTimeout(1600);
    // Look for the email carriers heading — present even when no accounts are connected
    const emailSection = page.getByText(/email carriers/i).first();
    const found = await emailSection.isVisible().catch(() => false);
    if (!found) {
      // Fallback: any visible text containing "email" or key integrations UI
      const fallback = page.getByText(/connect.*email|add.*email|email.*account|gmail|outlook/i).first();
      const fbFound = await fallback.isVisible().catch(() => false);
      if (!fbFound) e.flags.push("ELEMENT_NOT_FOUND: Email section");
    }
  });

  await step("integrations", "Connected stack section visible", async (e) => {
    const stack = page.getByText(/connected stack/i).first();
    const found = await stack.isVisible().catch(() => false);
    if (!found) e.flags.push("ELEMENT_NOT_FOUND: Connected stack section");
  });

  await step("integrations", "Sync all button visible", async (e) => {
    const syncBtn = page.getByRole("button", { name: /sync/i }).first();
    const found = await syncBtn.isVisible().catch(() => false);
    if (!found) e.flags.push("ELEMENT_NOT_FOUND: Sync button");
    else await syncBtn.hover();
  });

  await step("integrations", "Integration tabs navigation", async (e) => {
    // Try navigating to billing tab in integrations
    const billingTab = page.getByRole("button", { name: /billing/i }).first();
    const found = await billingTab.isVisible().catch(() => false);
    if (found) await billingTab.click();
    await page.waitForTimeout(500);
  });
}

// ─── Suite: Admin Settings ────────────────────────────────────────────────────
async function suiteAdmin() {
  console.log("\n▸ Suite: admin");

  const ADMIN_TABS = ["branding", "team", "billing", "carrier", "activity", "audit", "growth", "infrastructure"];

  await step("admin", "Admin settings loads — Branding tab", async (e) => {
    await nav("/admin");
    await page.waitForTimeout(1400);
    const branding = page.getByText(/branding/i).first();
    const found = await branding.isVisible().catch(() => false);
    if (!found) e.flags.push("ELEMENT_NOT_FOUND: Branding tab");
  });

  for (const tab of ADMIN_TABS) {
    await step("admin", `Settings tab: ${tab}`, async (e) => {
      // Admin tabs render as role="tab" in SettingsTabSwitcher
      const tabBtn = page.getByRole("tab", { name: new RegExp(tab, "i") }).first();
      const found = await tabBtn.isVisible().catch(() => false);
      if (!found) {
        // Some tabs may not exist — soft flag only
        e.flags.push(`ELEMENT_NOT_FOUND: ${tab} tab (may not exist in this build)`);
        return;
      }
      await tabBtn.click();
      await page.waitForTimeout(700);
      await checkDeadSpace(e, 120);
    });
  }

  await step("admin", "Branding form — Platform Name field", async (e) => {
    await nav("/admin");
    await page.waitForTimeout(1000);
    const nameInput = page.getByLabel(/platform name/i).first();
    const found = await nameInput.isVisible().catch(() => false);
    if (!found) e.flags.push("ELEMENT_NOT_FOUND: Platform Name input");
    else {
      await nameInput.fill("Brightline OS");
      await page.waitForTimeout(200);
    }
  });

  await step("admin", "Team tab — member list renders", async (e) => {
    // Team tab is role="tab" in SettingsTabSwitcher; members show by email (not name)
    const teamTab = page.getByRole("tab", { name: /^team$/i }).first();
    const found = await teamTab.isVisible().catch(() => false);
    if (found) {
      await teamTab.click();
      await page.waitForTimeout(900);
    }
    const member = page.getByText(/mike@brightline\.ai/i).first();
    const memberFound = await member.isVisible().catch(() => false);
    if (!memberFound) e.flags.push("ELEMENT_NOT_FOUND: team member row");
  });
}

// ─── Suite: Marketing Pages ───────────────────────────────────────────────────
async function suiteMarketing() {
  console.log("\n▸ Suite: marketing");

  const PUBLIC_ROUTES = [
    { route: "/", name: "Landing page loads" },
    { route: "/pricing", name: "Pricing page — monthly" },
    { route: "/pricing", name: "Pricing page — annual toggle", action: async () => {
      const annualBtn = page.getByRole("button", { name: /annual/i }).first();
      const found = await annualBtn.isVisible().catch(() => false);
      if (found) { await annualBtn.click(); await page.waitForTimeout(400); }
    }},
    { route: "/compare", name: "Compare table loads" },
    { route: "/showcase", name: "Showcase / demos page" },
    { route: "/about", name: "About page" },
    { route: "/support", name: "Support page" },
    { route: "/developers", name: "Developers page" },
    { route: "/signin", name: "Sign-in page" },
    { route: "/signup", name: "Sign-up page" },
  ];

  for (const { route, name, action } of PUBLIC_ROUTES) {
    await step("marketing", name, async (e) => {
      await nav(route, { settle: 800 });
      if (action) await action();
    });
  }

  // Pricing toggle stress test
  await step("marketing", "Pricing — monthly/annual toggle cycles correctly", async (e) => {
    await nav("/pricing", { settle: 600 });
    const monthlyBtn = page.getByRole("button", { name: /monthly/i }).first();
    const annualBtn = page.getByRole("button", { name: /annual/i }).first();
    for (let i = 0; i < 3; i++) {
      const a = await annualBtn.isVisible().catch(() => false);
      if (a) await annualBtn.click();
      await page.waitForTimeout(300);
      const m = await monthlyBtn.isVisible().catch(() => false);
      if (m) await monthlyBtn.click();
      await page.waitForTimeout(300);
    }
  });

  // Cookie consent banner interactions
  await step("marketing", "Cookie consent — appears and dismisses", async (e) => {
    // Clear storage to trigger cookie banner
    await page.evaluate(() => localStorage.removeItem("wireline_cookie_consent"));
    await nav("/", { settle: 2000 });
    const banner = page.locator("[role='dialog'][aria-label*='cookie' i], [role='dialog'][aria-label*='Cookie' i]").first();
    // May or may not appear depending on session state
    const found = await banner.isVisible().catch(() => false);
    if (found) {
      const closeBtn = banner.getByRole("button").first();
      await closeBtn.click();
      await page.waitForTimeout(400);
    }
  });

  // Support form interaction
  await step("marketing", "Support form — fill and verify no overlap", async (e) => {
    await nav("/support", { settle: 800 });
    const emailInput = page.getByLabel(/your email/i).first();
    const found = await emailInput.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: email input on support form"); return; }
    await emailInput.fill("test@brightline.ai");
    // Cookie banner should NOT overlap this field
    const cookieBanner = page.locator("[role='dialog']").first();
    const bannerVisible = await cookieBanner.isVisible().catch(() => false);
    if (bannerVisible) {
      const emailBox = await emailInput.boundingBox();
      const bannerBox = await cookieBanner.boundingBox();
      if (emailBox && bannerBox) {
        const overlaps = bannerBox.x < emailBox.x + emailBox.width &&
                         bannerBox.x + bannerBox.width > emailBox.x &&
                         bannerBox.y < emailBox.y + emailBox.height &&
                         bannerBox.y + bannerBox.height > emailBox.y;
        if (overlaps) e.flags.push("LAYOUT_ISSUE: cookie banner overlaps email field on /support");
      }
    }
  });

  // Developers page content checks
  await step("marketing", "Developers page — no placeholder text visible", async (e) => {
    await nav("/developers", { settle: 800 });
    // Check for any remaining placeholder markers
    const body = await page.content();
    if (body.includes("******")) e.flags.push("CONTENT_BUG: '******' placeholder visible on developers page");
    // Verify the page contains curl/Bearer token examples — search all code elements, not just first()
    const allCode = page.locator("code, pre");
    const count = await allCode.count().catch(() => 0);
    let foundBearerOrKey = false;
    for (let i = 0; i < count; i++) {
      const text = await allCode.nth(i).textContent().catch(() => "");
      if (text && (text.includes("wl_") || text.includes("Bearer"))) { foundBearerOrKey = true; break; }
    }
    if (!foundBearerOrKey) e.flags.push("CONTENT_BUG: curl command missing Bearer token format");
  });

  // Navigation hover states (marketing nav bar)
  await step("marketing", "Marketing nav — hover states on all links", async (e) => {
    await nav("/", { settle: 600 });
    const navLinks = page.locator("nav a");
    const count = await navLinks.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 6); i++) {
      await navLinks.nth(i).hover().catch(() => {});
      await page.waitForTimeout(100);
    }
  });
}

// ─── Suite: Auth Pages ────────────────────────────────────────────────────────
async function suiteAuth(browser) {
  console.log("\n▸ Suite: auth");

  // Auth tests need a SEPARATE browser context with NO session mock so /signin and /signup render
  // (the main context mocks /api/auth/session → authenticated user, causing immediate redirect)
  const authCtx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  await authCtx.addInitScript(() => {
    try { localStorage.setItem("wireline_cookie_consent", "acknowledged"); } catch { /* */ }
  });
  await authCtx.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/auth/session")) {
      // Return a 401 so the app treats the user as unauthenticated
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
      return;
    }
    if (url.includes("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      return;
    }
    if (url.startsWith(BASE_URL) || url.startsWith("data:") || url.startsWith("blob:")) { await route.continue(); return; }
    await route.abort();
  });
  const authPage = await authCtx.newPage();
  authPage.setDefaultTimeout(25000);

  const authNav = async (route) => {
    await authPage.goto(BASE_URL + route, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
    await authPage.waitForTimeout(800);
  };

  const authStep = async (name, fn) => {
    if (SUITES_FILTER && !SUITES_FILTER.has("auth")) return;
    const t0 = Date.now();
    const entry = { suite: "auth", step: name, passed: true, durationMs: 0, errors: [], flags: [] };
    try {
      await fn(entry);
      const ssName = `auth--${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
      await authPage.screenshot({ path: path.join(SS_DIR, ssName), type: "png" });
    } catch (err) {
      entry.passed = false;
      entry.errors.push(err.message.slice(0, 200));
    }
    entry.durationMs = Date.now() - t0;
    results.push(entry);
    const icon = entry.passed && entry.flags.length === 0 ? "✓" : entry.passed ? "⚡" : "✗";
    console.log(`  ${icon} [auth] ${name} (${entry.durationMs}ms)${entry.flags.length ? " flags: " + entry.flags.join(", ") : ""}`);
  };

  await authStep("Sign-in page — form renders", async (e) => {
    await authNav("/signin");
    const emailInput = authPage.getByLabel(/email/i).first();
    const found = await emailInput.isVisible().catch(() => false);
    if (!found) e.flags.push("ELEMENT_NOT_FOUND: email input on sign-in");
  });

  await authStep("Sign-in — social providers visible (Google, Microsoft, Yahoo)", async (e) => {
    for (const provider of ["Google", "Microsoft", "Yahoo"]) {
      const btn = authPage.getByRole("button", { name: new RegExp(provider, "i") }).first();
      const found = await btn.isVisible().catch(() => false);
      if (!found) e.flags.push(`ELEMENT_NOT_FOUND: ${provider} sign-in button`);
    }
  });

  await authStep("Sign-in — tab switch to Sign-up", async (e) => {
    const signupTab = authPage.getByRole("button", { name: /sign up/i }).first();
    const found = await signupTab.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: Sign-up tab"); return; }
    await signupTab.click();
    await authPage.waitForTimeout(400);
    const requirements = authPage.getByText(/8\+|characters/i).first();
    const reqFound = await requirements.isVisible().catch(() => false);
    if (!reqFound) e.flags.push("ELEMENT_NOT_FOUND: password requirements on sign-up");
  });

  await authStep("Sign-up — password visibility toggle", async (e) => {
    await authNav("/signup");
    const passwordInput = authPage.getByLabel(/password/i).first();
    const found = await passwordInput.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: password field"); return; }
    await passwordInput.fill("TestPass123!");
    const toggleBtn = authPage.locator("button[aria-label*='password' i], button[data-lucide*='eye']").first();
    const toggleFound = await toggleBtn.isVisible().catch(() => false);
    if (toggleFound) await toggleBtn.click();
    await authPage.waitForTimeout(300);
  });

  await authStep("Sign-up — terms checkbox and form submit state", async (e) => {
    const termsCheckbox = authPage.getByLabel(/terms/i).first();
    const found = await termsCheckbox.isVisible().catch(() => false);
    if (!found) { e.flags.push("ELEMENT_NOT_FOUND: terms checkbox"); return; }
    await termsCheckbox.check();
    await authPage.waitForTimeout(200);
    const createBtn = authPage.getByRole("button", { name: /create account/i }).first();
    const btnFound = await createBtn.isVisible().catch(() => false);
    if (!btnFound) e.flags.push("ELEMENT_NOT_FOUND: Create account button");
  });

  await authCtx.close();
}

// ─── Suite: Responsive ────────────────────────────────────────────────────────
async function suiteResponsive(browser) {
  console.log("\n▸ Suite: responsive");

  const BREAKPOINTS = [
    { name: "mobile", w: 390, h: 844 },
    { name: "tablet", w: 834, h: 1112 },
    { name: "desktop", w: 1440, h: 900 },
  ];

  const RESPONSIVE_ROUTES = ["/", "/pricing", "/chat", "/agents", "/training", "/insights", "/admin"];

  for (const bp of BREAKPOINTS) {
    // New context per breakpoint
    const ctx = await browser.newContext({
      viewport: { width: bp.w, height: bp.h },
      deviceScaleFactor: 1,
      colorScheme: "light",
    });

    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("wireline_post_signup_dismissed", "true");
        localStorage.setItem("wireline_onboarding_celebrated", "true");
        localStorage.setItem("wireline_rail_expanded", "true");
      } catch { /* ignore */ }
    });

    await ctx.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.includes("/api/")) {
        const u = new URL(url);
        try {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockApi(u.pathname, u.searchParams)) });
        } catch { await route.abort(); }
        return;
      }
      if (url.startsWith(BASE_URL) || url.startsWith("data:") || url.startsWith("blob:")) { await route.continue(); return; }
      await route.abort();
    });

    const bpPage = await ctx.newPage();
    bpPage.setDefaultTimeout(25000);

    for (const route of RESPONSIVE_ROUTES) {
      const stepName = `${bp.name} (${bp.w}×${bp.h}) — ${route}`;
      const t0 = Date.now();
      const entry = { suite: "responsive", step: stepName, passed: true, durationMs: 0, errors: [], flags: [] };
      const consoleErrors = [];
      bpPage.on("console", (m) => {
        if (m.type() === "error") {
          const t = m.text().slice(0, 200);
          if (!t.includes("ERR_FAILED") && !t.includes("MIME type") && !t.includes("net::ERR_ABORTED")) consoleErrors.push(t);
        }
      });

      try {
        await bpPage.goto(BASE_URL + route, { waitUntil: "networkidle", timeout: 30000 });
        await bpPage.waitForTimeout(1400);

        // Measure dead space
        const gap = await bpPage.evaluate(() => {
          const stage = document.querySelector(".workspace-stage, .client-console__stage, main");
          if (!stage) return 0;
          const all = stage.querySelectorAll("*");
          let maxBottom = 0;
          for (const el of all) {
            const b = el.getBoundingClientRect().bottom;
            if (b > maxBottom && b < window.innerHeight + 1) maxBottom = b;
          }
          return Math.max(0, Math.round(window.innerHeight - maxBottom));
        }).catch(() => 0);
        if (gap > 150) entry.flags.push(`BOTTOM_DEAD_SPACE_${gap}px`);

        const ssName = `responsive--${bp.name}-${route.replace(/\//g, "") || "home"}.png`;
        await bpPage.screenshot({ path: path.join(SS_DIR, ssName), type: "png" });
      } catch (err) {
        entry.passed = false;
        entry.errors.push(`STEP_FAILED: ${err.message.slice(0, 200)}`);
      }

      entry.durationMs = Date.now() - t0;
      entry.errors.push(...consoleErrors.map((e) => `CONSOLE_ERROR: ${e}`));
      if (consoleErrors.length > 0) entry.passed = false;
      results.push(entry);
      const icon = entry.passed ? (entry.flags.length ? "⚡" : "✓") : "✗";
      process.stdout.write(`  ${icon} [responsive] ${stepName} (${entry.durationMs}ms)\n`);
    }

    await ctx.close();
  }
}

// ─── HTML Report Generator ────────────────────────────────────────────────────
function generateHtmlReport(summary) {
  const rows = results.map((r) => {
    const cls = !r.passed ? "error" : r.flags.length ? "warn" : "ok";
    const flags = r.flags.map((f) => `<span class="flag">${f}</span>`).join(" ");
    const errors = r.errors.map((e) => `<div class="err-line">${e}</div>`).join("");
    const ssName = `${r.suite}--${r.step.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    const ssPath = path.join("screenshots", ssName);
    const hasScreenshot = existsSync(path.join(SS_DIR, ssName));
    return `<tr class="${cls}">
      <td>${r.suite}</td>
      <td>${r.step}</td>
      <td>${r.durationMs}ms</td>
      <td>${flags || errors || "—"}</td>
      <td>${hasScreenshot ? `<a href="${ssPath}" target="_blank">📷</a>` : "—"}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Wireline Stress Test Report</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f8f5ef; color: #1a1614; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  .summary { display: flex; gap: 24px; margin: 16px 0; flex-wrap: wrap; }
  .stat { background: #fff; border: 1px solid #e8e0d4; border-radius: 8px; padding: 12px 20px; text-align: center; }
  .stat-n { font-size: 32px; font-weight: 700; }
  .stat-l { font-size: 12px; color: #8c7b6e; text-transform: uppercase; letter-spacing: .05em; }
  .ok .stat-n { color: #059669; } .warn .stat-n { color: #d97706; } .error .stat-n { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; margin-top: 24px; }
  th { background: #1a1614; color: #efe9dc; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; }
  td { padding: 9px 12px; border-bottom: 1px solid #f0e8dc; font-size: 13px; vertical-align: top; }
  tr.error td { background: #fef2f2; } tr.warn td { background: #fffbeb; }
  .flag { background: #fef3c7; border: 1px solid #fbbf24; border-radius: 3px; padding: 1px 5px; font-size: 11px; }
  .err-line { color: #dc2626; font-size: 11px; margin-top: 2px; }
  a { color: #8b3fd6; }
</style></head>
<body>
<h1>Wireline Stress Test Report</h1>
<p style="color:#8c7b6e;font-size:13px;">Run at ${new Date().toLocaleString()} · ${summary.total} steps · ${summary.durationMs}ms total</p>
<div class="summary">
  <div class="stat ok"><div class="stat-n">${summary.passed}</div><div class="stat-l">Passed</div></div>
  <div class="stat warn"><div class="stat-n">${summary.flagged}</div><div class="stat-l">Flagged</div></div>
  <div class="stat error"><div class="stat-n">${summary.errors}</div><div class="stat-l">Failed</div></div>
  <div class="stat"><div class="stat-n">${summary.total}</div><div class="stat-l">Total</div></div>
</div>
<table>
<thead><tr><th>Suite</th><th>Step</th><th>Time</th><th>Flags / Errors</th><th>Screenshot</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🧪 Wireline Stress Test`);
  console.log(`   URL: ${BASE_URL}`);
  console.log(`   Out: ${OUT_DIR}`);
  console.log(`   Suites: ${SUITES_FILTER ? [...SUITES_FILTER].join(", ") : "all"}`);
  console.log(`   Viewport: ${VW}×${VH}\n`);

  const t0 = Date.now();
  const browser = await chromium.launch({
    headless: !HEADED,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  context = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });

  await context.addInitScript(() => {
    try {
      localStorage.setItem("wireline_post_signup_dismissed", "true");
      localStorage.setItem("wireline_onboarding_celebrated", "true");
      localStorage.setItem("wireline_rail_expanded", "true");
      localStorage.setItem("wireline_cookie_consent", "acknowledged");
    } catch { /* ignore */ }
  });

  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/")) {
      const u = new URL(url);
      try {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockApi(u.pathname, u.searchParams)) });
      } catch { await route.abort(); }
      return;
    }
    if (url.startsWith(BASE_URL) || url.startsWith("data:") || url.startsWith("blob:")) { await route.continue(); return; }
    await route.abort();
  });

  page = await context.newPage();
  page.setDefaultTimeout(25000);

  // Run suites
  if (!SUITES_FILTER || SUITES_FILTER.has("chat")) await suitChat();
  if (!SUITES_FILTER || SUITES_FILTER.has("agents")) await suiteAgents();
  if (!SUITES_FILTER || SUITES_FILTER.has("training")) await suiteTraining();
  if (!SUITES_FILTER || SUITES_FILTER.has("ops")) await suiteOps();
  if (!SUITES_FILTER || SUITES_FILTER.has("insights")) await suiteInsights();
  if (!SUITES_FILTER || SUITES_FILTER.has("integrations")) await suiteIntegrations();
  if (!SUITES_FILTER || SUITES_FILTER.has("admin")) await suiteAdmin();
  if (!SUITES_FILTER || SUITES_FILTER.has("marketing")) await suiteMarketing();
  if (!SUITES_FILTER || SUITES_FILTER.has("auth")) await suiteAuth(browser);
  if (!SUITES_FILTER || SUITES_FILTER.has("responsive")) await suiteResponsive(browser);

  await context.close();
  await browser.close();

  // Summary
  const passed = results.filter((r) => r.passed && r.flags.length === 0).length;
  const flagged = results.filter((r) => r.passed && r.flags.length > 0).length;
  const errors = results.filter((r) => !r.passed).length;
  const summary = { total: results.length, passed, flagged, errors, durationMs: Date.now() - t0 };

  const findings = { summary, steps: results, generatedAt: new Date().toISOString() };
  writeFileSync(path.join(OUT_DIR, "findings.json"), JSON.stringify(findings, null, 2));
  writeFileSync(path.join(OUT_DIR, "report.html"), generateHtmlReport(summary));

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Results: ${passed} passed · ${flagged} flagged · ${errors} failed · ${results.length} total`);
  console.log(`Duration: ${(summary.durationMs / 1000).toFixed(1)}s`);
  console.log(`Report: ${path.join(OUT_DIR, "report.html")}`);
  console.log(`JSON:   ${path.join(OUT_DIR, "findings.json")}`);

  if (flagged > 0 || errors > 0) {
    console.log(`\nIssues:`);
    results.filter((r) => !r.passed || r.flags.length > 0).forEach((r) => {
      const items = [...r.flags, ...r.errors.filter((e) => !e.includes("CONSOLE_ERROR"))];
      if (items.length > 0) console.log(`  [${r.suite}] ${r.step}: ${items.join(", ")}`);
    });
  }
  console.log();

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Stress test crashed:", err);
  process.exit(1);
});
