/* eslint-disable @typescript-eslint/no-explicit-any -- audit metadata and aggregate stats are stored as Postgres jsonb. */
/**
 * src/lib/daily-brief.ts
 *
 * Logic for computing the Claude-authored daily brief.
 * Extracted from server.ts to avoid circular dependencies.
 */

import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, gte, lt, desc } from "drizzle-orm";
import * as insightsAi from "./insights-ai";
import { google } from "googleapis";
import { buildOAuthClient } from "./oauth-helpers";
import { decryptSecret } from "./secret-vault";
import { cachedInsight, setCachedInsight } from "./insights-cache";
import { BRAND } from "../constants/brand-colors";
import { localDateKey } from "./date-display";

export async function computeDailyBrief(userId: string, opts?: { force?: boolean }) {
  const today = localDateKey(new Date());
  const cacheKey = `brief:${userId}:${today}`;
  if (!opts?.force) {
    const cached = cachedInsight(cacheKey);
    if (cached) return { payload: cached, cached: true };
  }
  if (!insightsAi.isInsightsAiAvailable()) {
    const err: any = new Error("AI runtime required for the daily brief.");
    err.code = "AI_RUNTIME_OFFLINE";
    throw err;
  }

  const yStart = new Date();
  yStart.setHours(0, 0, 0, 0);
  yStart.setDate(yStart.getDate() - 1);
  const yEnd = new Date(yStart);
  yEnd.setDate(yEnd.getDate() + 1);
  const wStart = new Date();
  wStart.setDate(wStart.getDate() - 7);

  const [yCalls, wCalls, appts, tasks, leads, wins, losses] = await Promise.all([
    drizzle
      .select({
        leadScore: schema.callLogs.leadScore,
        intentLabel: schema.callLogs.intentLabel,
        durationSeconds: schema.callLogs.durationSeconds,
        cost: schema.callLogs.cost,
        summary: schema.callLogs.summary,
        customerNumber: schema.callLogs.customerNumber,
      })
      .from(schema.callLogs)
      .where(
        and(
          eq(schema.callLogs.userId, userId),
          gte(schema.callLogs.createdAt, yStart),
          lt(schema.callLogs.createdAt, yEnd),
        ),
      ),
    drizzle
      .select({
        leadScore: schema.callLogs.leadScore,
        durationSeconds: schema.callLogs.durationSeconds,
        cost: schema.callLogs.cost,
      })
      .from(schema.callLogs)
      .where(and(eq(schema.callLogs.userId, userId), gte(schema.callLogs.createdAt, wStart))),
    drizzle
      .select({ id: schema.appointments.id })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.userId, userId),
          gte(schema.appointments.createdAt, yStart),
          lt(schema.appointments.createdAt, yEnd),
        ),
      ),
    drizzle
      .select({
        priority: schema.followUpTasks.priority,
        description: schema.followUpTasks.description,
      })
      .from(schema.followUpTasks)
      .where(
        and(eq(schema.followUpTasks.userId, userId), eq(schema.followUpTasks.status, "pending")),
      )
      .orderBy(desc(schema.followUpTasks.createdAt))
      .limit(8),
    drizzle
      .select({ id: schema.outboundLeads.id })
      .from(schema.outboundLeads)
      .where(
        and(eq(schema.outboundLeads.userId, userId), eq(schema.outboundLeads.status, "Pending")),
      ),
    drizzle
      .select({
        customerNumber: schema.callLogs.customerNumber,
        leadScore: schema.callLogs.leadScore,
        summary: schema.callLogs.summary,
      })
      .from(schema.callLogs)
      .where(
        and(
          eq(schema.callLogs.userId, userId),
          gte(schema.callLogs.createdAt, yStart),
          gte(schema.callLogs.leadScore, 70),
        ),
      )
      .orderBy(desc(schema.callLogs.leadScore))
      .limit(3),
    drizzle
      .select({
        customerNumber: schema.callLogs.customerNumber,
        leadScore: schema.callLogs.leadScore,
        summary: schema.callLogs.summary,
      })
      .from(schema.callLogs)
      .where(
        and(
          eq(schema.callLogs.userId, userId),
          gte(schema.callLogs.createdAt, yStart),
          lt(schema.callLogs.leadScore, 30),
        ),
      )
      .orderBy(desc(schema.callLogs.createdAt))
      .limit(3),
  ]);

  const yTotal = yCalls?.length || 0;
  const yMinutes = Math.round(
    (yCalls || []).reduce((s: number, c: any) => s + (c.durationSeconds || 0), 0) / 60,
  );
  const yAvgScore = yTotal
    ? Math.round((yCalls || []).reduce((s: number, c: any) => s + (c.leadScore || 0), 0) / yTotal)
    : 0;
  const yHighIntent = (yCalls || []).filter((c: any) => c.intentLabel === "high").length;
  const yCost = Number(
    (yCalls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0).toFixed(2),
  );

  const wDays = 7;
  const wAvgPerDay = (wCalls?.length || 0) / wDays;
  const wAvgScore = wCalls?.length
    ? (wCalls || []).reduce((s: number, c: any) => s + (c.leadScore || 0), 0) / wCalls.length
    : 0;
  const wAvgCostPerDay =
    (wCalls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0) / wDays;

  const callsPct = wAvgPerDay > 0 ? ((yTotal - wAvgPerDay) / wAvgPerDay) * 100 : 0;
  const scorePct = wAvgScore > 0 ? ((yAvgScore - wAvgScore) / wAvgScore) * 100 : 0;
  const costPct = wAvgCostPerDay > 0 ? ((yCost - wAvgCostPerDay) / wAvgCostPerDay) * 100 : 0;

  const result = await insightsAi.composeDailyBrief({
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
    recentWinSamples: (wins || []).map((w) => ({
      customer: w.customerNumber || "Contact",
      score: w.leadScore || 0,
      summary: w.summary || "",
    })),
    recentLossSamples: (losses || []).map((l) => ({
      customer: l.customerNumber || "Contact",
      score: l.leadScore || 0,
      summary: l.summary || "",
    })),
    openTasks: (tasks || []).map((t: any) => ({
      priority: t.priority || "medium",
      description: t.description || "",
    })),
  });

  setCachedInsight(cacheKey, result);
  return { payload: result, cached: false };
}

export function renderDailyBriefEmail(
  payload: any,
  opts: { dateLabel: string; appUrl?: string | null },
): { subject: string; html: string; text: string } {
  const brief = payload?.brief || {};
  const stats = payload?.stats_yesterday || {};
  const delta = payload?.week_delta || {};
  const headline = brief.headline || "Your daily brief";
  const mood = brief.mood || "neutral";
  const highlights: string[] = brief.highlights || [];
  const concerns: string[] = brief.concerns || [];
  const actions: string[] = brief.action_items || [];

  const moodColor =
    mood === "positive"
      ? BRAND.colors.primary
      : mood === "concerning"
        ? BRAND.colors.error
        : BRAND.colors.onSurfaceMuted;
  const fmtPct = (n: any) => {
    const v = Number(n || 0);
    const sign = v >= 0 ? "+" : "";
    return `${sign}${v.toFixed(0)}%`;
  };
  const link = opts.appUrl ? `${opts.appUrl.replace(/\/+$/, "")}/` : null;

  const subject = `Wireline · ${escapeHtml(headline)} · ${opts.dateLabel}`;

  const css = `
    body { margin:0; padding:0; background-color:#0a0a0a; color:#f4f4f5; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .wrap { max-width:600px; margin:0 auto; padding:40px 20px; }
    .brand-header { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
    .brand-logo { width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, ${BRAND.colors.primary}, ${BRAND.colors.primaryVariant}); display: inline-block; vertical-align: middle; }
    .brand-name { font-size: 20px; font-weight: 700; font-style: italic; letter-spacing: -0.02em; color: #fff; vertical-align: middle; display: inline-block; margin-left: 12px; }
    .card { background:#121214; border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:32px; margin-bottom:24px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
    .card-hero { background: linear-gradient(180deg, #18181b 0%, #121214 100%); position: relative; overflow: hidden; }
    .card-hero::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, ${BRAND.colors.primary}, ${BRAND.colors.onSurfaceMuted}); }
    .label { font-size:10px; font-weight: 600; letter-spacing:0.3em; text-transform:uppercase; color:#a1a1aa; margin:0 0 16px; }
    h1 { font-size:28px; line-height:1.2; margin:0 0 12px; color:#fff; font-weight:600; letter-spacing:-0.02em; font-style: italic; }
    h2 { font-size:12px; font-weight: 700; letter-spacing:0.2em; text-transform:uppercase; color:${moodColor}; margin:0 0 20px; display: inline-block; padding: 4px 10px; background: ${moodColor}15; border-radius: 99px; border: 1px solid ${moodColor}30; }
    p { color:#a1a1aa; line-height:1.6; margin:0 0 16px; font-size:15px; }
    .stats { width:100%; border-collapse:separate; border-spacing:12px 0; margin-top:24px; display: table; table-layout: fixed; }
    .stat { display:table-cell; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:16px 12px; text-align:center; vertical-align:top; }
    .stat .v { font-size:24px; font-weight:600; color:#fff; line-height:1; font-style: italic; }
    .stat .l { font-size:10px; font-weight: 600; letter-spacing:0.2em; text-transform:uppercase; color:#71717a; margin-top:8px; }
    .delta-pos { color:${BRAND.colors.primary}; }
    .delta-neg { color:#f43f5e; }
    ul { padding:0; margin:0; list-style:none; }
    li { background:rgba(255,255,255,0.02); border-left:3px solid ${moodColor}; border-radius:8px; padding:14px 16px; margin-bottom:12px; font-size:15px; line-height:1.6; color:#e4e4e7; border: 1px solid rgba(255,255,255,0.05); border-left-width: 3px; }
    li.warn { border-left-color:#fbbf24; }
    li.action { border-left-color:#38bdf8; }
    .footer { text-align:center; color:#71717a; font-size:12px; padding:32px 0; line-height: 1.6; }
    .btn { display:inline-block; padding:12px 24px; border-radius:99px; background:${BRAND.colors.primary}; color:#ffffff !important; text-decoration:none; font-weight:600; font-size:13px; letter-spacing:0.1em; text-transform: uppercase; border: 1px solid ${BRAND.colors.primaryVariant}; }
  `;

  const stat = (label: string, value: string, delta?: number | null) => `
    <div class="stat">
      <div class="v">${escapeHtml(value)}</div>
      <div class="l">${escapeHtml(label)}</div>
      ${
        delta !== undefined && delta !== null && Math.abs(delta) >= 1
          ? `<div class="${delta >= 0 ? "delta-pos" : "delta-neg"}" style="font-size:11px;font-weight:500;margin-top:8px;">${fmtPct(delta)} <span style="color:#71717a;font-weight:400;font-size:10px;">vs 7d</span></div>`
          : ""
      }
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,600;1,700&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body>
  <div class="wrap">
    <div class="brand-header">
      <div class="brand-logo"></div>
      <div class="brand-name">Wireline</div>
    </div>
    
    <div class="card card-hero">
      <p class="label">Daily Brief · ${escapeHtml(opts.dateLabel)}</p>
      <h1>${escapeHtml(headline)}</h1>
      <h2>${escapeHtml(mood)}</h2>
      
      <div class="stats" role="presentation">
        ${stat("Calls", String(stats.total_calls ?? 0), delta.calls_pct)}
        ${stat("Avg Score", String(stats.avg_lead_score ?? 0), delta.score_pct)}
        ${stat("Cost", `$${Number(stats.cost ?? 0).toFixed(2)}`, delta.cost_pct)}
      </div>
    </div>

    ${
      highlights.length
        ? `
    <div class="card">
      <p class="label">Highlights</p>
      <ul>${highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>
    </div>`
        : ""
    }
    
    ${
      concerns.length
        ? `
    <div class="card">
      <p class="label">Areas of Concern</p>
      <ul>${concerns.map((h) => `<li class="warn">${escapeHtml(h)}</li>`).join("")}</ul>
    </div>`
        : ""
    }
    
    ${
      actions.length
        ? `
    <div class="card">
      <p class="label">Action Items</p>
      <ul>${actions.map((h) => `<li class="action">${escapeHtml(h)}</li>`).join("")}</ul>
    </div>`
        : ""
    }
    
    ${link ? `<div style="text-align:center; padding:24px 0;"><a class="btn" href="${escapeHtml(link)}">Open Dashboard</a></div>` : ""}
    
    <div class="footer">
      This brief was generated by Claude using your real-time call data.<br>
      You can pause these updates anytime in <strong>Command Atlas → Settings</strong>.
    </div>
  </div>
</body>
</html>`;

  // Plain-text fallback for clients that don't render HTML.
  const lines: string[] = [];
  lines.push(`WIRELINE · Daily Brief · ${opts.dateLabel}`);
  lines.push(`Mood: ${mood}`);
  lines.push("");
  lines.push(headline);
  lines.push("");
  lines.push(
    `Calls: ${stats.total_calls ?? 0}  ·  Lead Score: ${stats.avg_lead_score ?? 0}  ·  Cost: $${Number(stats.cost ?? 0).toFixed(2)}  ·  Booked: ${stats.appointments_booked ?? 0}`,
  );
  if (highlights.length) {
    lines.push("");
    lines.push("HIGHLIGHTS");
    highlights.forEach((h) => lines.push(` • ${h}`));
  }
  if (concerns.length) {
    lines.push("");
    lines.push("CONCERNS");
    concerns.forEach((h) => lines.push(` ⚠ ${h}`));
  }
  if (actions.length) {
    lines.push("");
    lines.push("ACTIONS");
    actions.forEach((h) => lines.push(` → ${h}`));
  }
  if (link) {
    lines.push("");
    lines.push(`Open Wireline: ${link}`);
  }
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
  // Pull settings + the Account Holder's connected Gmail account.
  const [settingsRow, accountRow] = await Promise.all([
    drizzle
      .select({
        dailyBriefRecipient: schema.settings.dailyBriefRecipient,
        dailyBriefEnabled: schema.settings.dailyBriefEnabled,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1)
      .then((rows) => rows[0] || null),
    drizzle
      .select({
        accessToken: schema.emailAccounts.accessToken,
        refreshToken: schema.emailAccounts.refreshToken,
        expiresAt: schema.emailAccounts.expiresAt,
        emailAddress: schema.emailAccounts.emailAddress,
      })
      .from(schema.emailAccounts)
      .where(
        and(eq(schema.emailAccounts.userId, userId), eq(schema.emailAccounts.provider, "google")),
      )
      .limit(1)
      .then((rows) => rows[0] || null),
  ]);

  const recipient = settingsRow?.dailyBriefRecipient;
  if (!recipient) throw new Error("No recipient configured (dailyBriefRecipient).");
  const account: any = accountRow;
  if (!account?.refreshToken)
    throw new Error("No connected Gmail account — connect one in Carrier Bridge first.");

  // Compute the brief (uses the per-day cache) — may throw CLAUDE_OFFLINE.
  const { payload } = await computeDailyBrief(userId, { force: opts?.force === true });
  const dateLabel = localDateKey(new Date());
  const { subject, html, text } = renderDailyBriefEmail(payload, {
    dateLabel,
    appUrl: process.env.APP_URL,
  });

  const oauth2Client = buildOAuthClient();
  oauth2Client.setCredentials({
    access_token: decryptSecret(account.accessToken),
    refresh_token: account.refreshToken ? decryptSecret(account.refreshToken) : null,
    expiry_date: account.expiresAt ? Number(account.expiresAt) : null,
  });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Multipart/alternative — text part first, then HTML, per RFC 2046.
  const boundary = `----wirelineboundary${Date.now().toString(36)}`;
  const messageParts = [
    `From: ${account.emailAddress || "me"}`,
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
