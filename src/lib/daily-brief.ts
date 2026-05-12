/**
 * src/lib/daily-brief.ts
 *
 * Logic for computing the Claude-authored daily brief.
 * Extracted from server.ts to avoid circular dependencies.
 */

import { db } from "./server-context";
import * as claudeBrain from "./claude-brain";
import { google } from "googleapis";
import { buildOAuthClient } from "./oauth-helpers";
import { decryptSecret } from "./secret-vault";
import { cachedInsight, setCachedInsight } from "./insights-cache";

export async function computeDailyBrief(userId: string, opts?: { force?: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `brief:${userId}:${today}`;
  if (!opts?.force) {
    const cached = cachedInsight(cacheKey);
    if (cached) return { payload: cached, cached: true };
  }
  if (!claudeBrain.isClaudeAvailable()) {
    const err: any = new Error("Claude required for the daily brief.");
    err.code = "CLAUDE_OFFLINE";
    throw err;
  }

  const yStart = new Date(); yStart.setHours(0, 0, 0, 0); yStart.setDate(yStart.getDate() - 1);
  const yEnd   = new Date(yStart); yEnd.setDate(yEnd.getDate() + 1);
  const wStart = new Date(); wStart.setDate(wStart.getDate() - 7);

  const [{ data: yCalls }, { data: wCalls }, { data: appts }, { data: tasks }, { data: leads }, { data: wins }, { data: losses }] = await Promise.all([
    db.from("wireline_call_logs").select("lead_score, intent_label, duration_seconds, cost, summary, customer_number").eq("user_id", userId).gte("created_at", yStart.toISOString()).lt("created_at", yEnd.toISOString()),
    db.from("wireline_call_logs").select("lead_score, duration_seconds, cost").eq("user_id", userId).gte("created_at", wStart.toISOString()),
    db.from("wireline_appointments").select("id").eq("user_id", userId).gte("created_at", yStart.toISOString()).lt("created_at", yEnd.toISOString()),
    db.from("wireline_fleet_tasks").select("priority, description").eq("user_id", userId).eq("status", "pending").order("created_at", { ascending: false }).limit(8),
    db.from("wireline_outbound_leads").select("id").eq("user_id", userId).eq("status", "Pending"),
    db.from("wireline_call_logs").select("customer_number, lead_score, summary").eq("user_id", userId).gte("created_at", yStart.toISOString()).gte("lead_score", 70).order("lead_score", { ascending: false }).limit(3),
    db.from("wireline_call_logs").select("customer_number, lead_score, summary").eq("user_id", userId).gte("created_at", yStart.toISOString()).lt("lead_score", 30).order("created_at", { ascending: false }).limit(3),
  ]);

  const yTotal = yCalls?.length || 0;
  const yMinutes = Math.round((yCalls || []).reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / 60);
  const yAvgScore = yTotal ? Math.round((yCalls || []).reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / yTotal) : 0;
  const yHighIntent = (yCalls || []).filter((c: any) => c.intent_label === "high").length;
  const yCost = Number((yCalls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0).toFixed(2));

  const wDays = 7;
  const wAvgPerDay = (wCalls?.length || 0) / wDays;
  const wAvgScore = wCalls?.length ? (wCalls || []).reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / wCalls.length : 0;
  const wAvgCostPerDay = (wCalls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0) / wDays;

  const callsPct = wAvgPerDay > 0 ? ((yTotal - wAvgPerDay) / wAvgPerDay) * 100 : 0;
  const scorePct = wAvgScore > 0 ? ((yAvgScore - wAvgScore) / wAvgScore) * 100 : 0;
  const costPct = wAvgCostPerDay > 0 ? ((yCost - wAvgCostPerDay) / wAvgCostPerDay) * 100 : 0;

  const result = await claudeBrain.dailyBrief({
    yesterdayStats: {
      total_calls: yTotal,
      total_minutes: yMinutes,
      avg_lead_score: yAvgScore,
      high_intent_count: yHighIntent,
      cost: yCost,
      appointments_booked: appts?.length || 0,
      pending_tasks: tasks?.length || 0,
      new_leads: leads?.length || 0,
    },
    weekDelta: {
      calls_pct: Math.round(callsPct),
      score_pct: Math.round(scorePct),
      cost_pct: Math.round(costPct),
    },
    recentWinSamples: (wins || []).map(w => ({ customer: w.customer_number || "Contact", score: w.lead_score || 0, summary: w.summary || "" })),
    recentLossSamples: (losses || []).map(l => ({ customer: l.customer_number || "Contact", score: l.lead_score || 0, summary: l.summary || "" })),
    openTasks: (tasks || []).map((t: any) => ({ priority: t.priority || "medium", description: t.description || "" })),
  });

  setCachedInsight(cacheKey, result);
  return { payload: result, cached: false };
}

export function renderDailyBriefEmail(payload: any, opts: { dateLabel: string; appUrl?: string | null }): { subject: string; html: string; text: string } {
  const brief = payload?.brief || {};
  const stats = payload?.stats_yesterday || {};
  const delta = payload?.week_delta || {};
  const headline = brief.headline || "Your daily brief";
  const mood = brief.mood || "neutral";
  const highlights: string[] = brief.highlights || [];
  const concerns: string[] = brief.concerns || [];
  const actions: string[] = brief.action_items || [];

  const moodColor = mood === "positive" ? "#10b981" : mood === "concerning" ? "#f43f5e" : "#7DF9FF";
  const fmtPct = (n: any) => {
    const v = Number(n || 0);
    const sign = v >= 0 ? "+" : "";
    return `${sign}${v.toFixed(0)}%`;
  };
  const link = opts.appUrl ? `${opts.appUrl.replace(/\/+$/, "")}/` : null;

  const subject = `Wireline · ${escapeHtml(headline)} · ${opts.dateLabel}`;

  const css = `
    body { margin:0; padding:0; background:#0F0E2D; color:#EEF1F8; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
    .wrap { max-width:640px; margin:0 auto; padding:32px 16px; }
    .card { background:#191734; border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:28px; margin-bottom:16px; }
    .label { font-size:10px; letter-spacing:0.4em; text-transform:uppercase; color:#8E91A8; margin:0 0 12px; }
    h1 { font-size:28px; line-height:1.15; margin:0 0 8px; color:#fff; font-weight:600; letter-spacing:-0.01em; }
    h2 { font-size:13px; letter-spacing:0.3em; text-transform:uppercase; color:${moodColor}; margin:0 0 16px; }
    p { color:rgba(238,241,248,0.8); line-height:1.55; margin:0 0 12px; font-size:14px; }
    .stats { display:table; width:100%; border-collapse:separate; border-spacing:8px 0; margin-top:8px; }
    .stat { display:table-cell; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:14px; text-align:center; vertical-align:top; }
    .stat .v { font-size:22px; font-weight:600; color:#fff; line-height:1; }
    .stat .l { font-size:10px; letter-spacing:0.25em; text-transform:uppercase; color:#8E91A8; margin-top:8px; }
    .delta-pos { color:#4DFFC4; }
    .delta-neg { color:#FF6BD9; }
    ul { padding:0; margin:0; list-style:none; }
    li { background:rgba(255,255,255,0.03); border-left:3px solid ${moodColor}; border-radius:6px; padding:10px 14px; margin-bottom:8px; font-size:14px; line-height:1.5; color:rgba(238,241,248,0.9); }
    li.warn { border-left-color:#FFC07D; }
    li.action { border-left-color:#7DF9FF; }
    .footer { text-align:center; color:#8E91A8; font-size:11px; padding:16px 0; }
    .btn { display:inline-block; padding:10px 18px; border-radius:999px; background:linear-gradient(135deg,#7DF9FF,#C58BFF); color:#0F0E2D !important; text-decoration:none; font-weight:600; font-size:13px; letter-spacing:0.05em; }
  `;

  const stat = (label: string, value: string, delta?: number | null) => `
    <div class="stat">
      <div class="v">${escapeHtml(value)}</div>
      <div class="l">${escapeHtml(label)}</div>
      ${delta !== undefined && delta !== null && Math.abs(delta) >= 1
        ? `<div class="${delta >= 0 ? "delta-pos" : "delta-neg"}" style="font-size:11px;margin-top:6px;">${fmtPct(delta)} vs 7-day</div>`
        : ""}
    </div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>${css}</style></head><body>
    <div class="wrap">
      <div class="card">
        <p class="label">Wireline · Daily Brief · ${escapeHtml(opts.dateLabel)}</p>
        <h2>${escapeHtml(mood)}</h2>
        <h1>${escapeHtml(headline)}</h1>
        <div class="stats" role="presentation">
          ${stat("Calls", String(stats.total_calls ?? 0), delta.calls_pct)}
          ${stat("Lead Score", String(stats.avg_lead_score ?? 0), delta.score_pct)}
          ${stat("Cost", `$${Number(stats.cost ?? 0).toFixed(2)}`, delta.cost_pct)}
          ${stat("Booked", String(stats.appointments_booked ?? 0))}
        </div>
      </div>
      ${highlights.length ? `
      <div class="card">
        <p class="label">Highlights</p>
        <ul>${highlights.map(h => `<li>${escapeHtml(h)}</li>`).join("")}</ul>
      </div>` : ""}
      ${concerns.length ? `
      <div class="card">
        <p class="label">Concerns</p>
        <ul>${concerns.map(h => `<li class="warn">${escapeHtml(h)}</li>`).join("")}</ul>
      </div>` : ""}
      ${actions.length ? `
      <div class="card">
        <p class="label">Action Items</p>
        <ul>${actions.map(h => `<li class="action">${escapeHtml(h)}</li>`).join("")}</ul>
      </div>` : ""}
      ${link ? `<div style="text-align:center; padding:12px 0 32px;"><a class="btn" href="${escapeHtml(link)}">Open Wireline</a></div>` : ""}
      <div class="footer">Sent automatically from your scheduled daily brief. Pause anytime in <strong>Command Atlas → Daily Brief</strong>.</div>
    </div>
  </body></html>`;

  // Plain-text fallback for clients that don't render HTML.
  const lines: string[] = [];
  lines.push(`WIRELINE · Daily Brief · ${opts.dateLabel}`);
  lines.push(`Mood: ${mood}`);
  lines.push("");
  lines.push(headline);
  lines.push("");
  lines.push(`Calls: ${stats.total_calls ?? 0}  ·  Lead Score: ${stats.avg_lead_score ?? 0}  ·  Cost: $${Number(stats.cost ?? 0).toFixed(2)}  ·  Booked: ${stats.appointments_booked ?? 0}`);
  if (highlights.length) { lines.push(""); lines.push("HIGHLIGHTS"); highlights.forEach(h => lines.push(` • ${h}`)); }
  if (concerns.length)   { lines.push(""); lines.push("CONCERNS");   concerns.forEach(h => lines.push(` ⚠ ${h}`)); }
  if (actions.length)    { lines.push(""); lines.push("ACTIONS");    actions.forEach(h => lines.push(` → ${h}`)); }
  if (link) { lines.push(""); lines.push(`Open Wireline: ${link}`); }
  return { subject, html, text: lines.join("\n") };
}

function escapeHtml(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendDailyBriefEmail(userId: string, opts?: { force?: boolean }) {
  // Pull settings + the operator's connected Gmail account.
  const [{ data: settings }, { data: accounts }] = await Promise.all([
    db.from("wireline_settings").select("daily_brief_recipient, daily_brief_enabled").eq("user_id", userId).maybeSingle(),
    db.from("wireline_email_accounts").select("access_token, refresh_token, expires_at, email_address").eq("user_id", userId).limit(1),
  ]);
  const recipient = settings?.daily_brief_recipient;
  if (!recipient) throw new Error("No recipient configured (daily_brief_recipient).");
  const account: any = accounts?.[0];
  if (!account?.refresh_token) throw new Error("No connected Gmail account — connect one in Carrier Bridge first.");

  // Compute the brief (uses the per-day cache) — may throw CLAUDE_OFFLINE.
  const { payload } = await computeDailyBrief(userId, { force: opts?.force === true });
  const dateLabel = new Date().toISOString().slice(0, 10);
  const { subject, html, text } = renderDailyBriefEmail(payload, { dateLabel, appUrl: process.env.APP_URL });

  const oauth2Client = buildOAuthClient();
  oauth2Client.setCredentials({
    access_token: decryptSecret(account.access_token),
    refresh_token: account.refresh_token ? decryptSecret(account.refresh_token) : null,
    expiry_date: account.expires_at,
  });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Multipart/alternative — text part first, then HTML, per RFC 2046.
  const boundary = `----wirelineboundary${Date.now().toString(36)}`;
  const messageParts = [
    `From: ${account.email_address || "me"}`,
    `To: ${recipient}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    html,
    ``,
    `--${boundary}--`,
  ].join("\r\n");
  const encoded = Buffer.from(messageParts).toString("base64url");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });

  return { recipient, subject };
}
