import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { enqueue } from "./job-queue";
import { generateAndStorePostCallArtifact } from "./openai-post-call-artifact";
import {
  getPostCallOutputPreferences,
  type PostCallArtifactDestination,
  type PostCallArtifactFormat,
  type PostCallOutputPreferences,
  type ScheduledReportFrequency,
} from "./post-call-output-preferences";
import { drizzle } from "./server-context";
import { redactSensitiveText } from "./shareable-artifact/redact";
import { maybePublishWeeklyRecap } from "./shareable-artifact/publish-weekly-recap";
import type { WeeklyRecapOutcomeSlice, WeeklyRecapVolumePoint } from "./shareable-artifact/types";

export interface ScheduledReportJobPayload extends Record<string, unknown> {
  userId: string;
  scheduleVersion: number;
  frequency: Exclude<ScheduledReportFrequency, "off">;
  format: PostCallArtifactFormat;
  destination: PostCallArtifactDestination;
  scheduledFor: string;
}

function parseUtcTime(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : { hour: 13, minute: 0 };
}

export function nextScheduledReportAt(
  preferences: PostCallOutputPreferences,
  from = new Date(),
): Date | null {
  if (
    preferences.scheduled_report_frequency === "off" ||
    !preferences.scheduled_report_destination
  ) {
    return null;
  }
  const { hour, minute } = parseUtcTime(preferences.scheduled_report_send_at_utc);
  const next = new Date(from);
  next.setUTCSeconds(0, 0);
  next.setUTCHours(hour, minute, 0, 0);

  if (preferences.scheduled_report_frequency === "daily") {
    if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  const target = preferences.scheduled_report_weekday;
  let days = (target - next.getUTCDay() + 7) % 7;
  if (days === 0 && next.getTime() <= from.getTime()) days = 7;
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export async function ensureNextScheduledReport(
  userId: string,
  preferences: PostCallOutputPreferences,
  from = new Date(),
): Promise<string | null> {
  const runAt = nextScheduledReportAt(preferences, from);
  const destination = preferences.scheduled_report_destination;
  const frequency = preferences.scheduled_report_frequency;
  if (!runAt || !destination || frequency === "off") return null;

  const [existing] = await drizzle
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.userId, userId),
        eq(schema.jobs.type, "scheduled_report"),
        eq(schema.jobs.status, "pending"),
        sql`${schema.jobs.payload}->>'scheduleVersion' = ${String(preferences.scheduled_report_version)}`,
      ),
    )
    .limit(1);
  if (existing?.id) return String(existing.id);

  const result = await enqueue(drizzle, {
    userId,
    type: "scheduled_report",
    runAt,
    maxAttempts: 3,
    payload: {
      userId,
      scheduleVersion: preferences.scheduled_report_version,
      frequency,
      format: preferences.scheduled_report_format,
      destination,
      scheduledFor: runAt.toISOString(),
    } satisfies ScheduledReportJobPayload,
  });
  if (!result.ok) throw new Error(result.error || "Failed to schedule report.");
  return result.jobId || null;
}

function preferencesMatchScheduledJob(
  preferences: PostCallOutputPreferences,
  payload: ScheduledReportJobPayload,
): boolean {
  return (
    preferences.scheduled_report_frequency !== "off" &&
    preferences.scheduled_report_version === payload.scheduleVersion &&
    preferences.scheduled_report_frequency === payload.frequency &&
    preferences.scheduled_report_format === payload.format &&
    preferences.scheduled_report_destination === payload.destination
  );
}

/** Returns the current matching preferences, or null when a queued job became stale. */
export async function currentScheduledReportPreferences(
  payload: ScheduledReportJobPayload,
): Promise<PostCallOutputPreferences | null> {
  const preferences = await getPostCallOutputPreferences(payload.userId);
  return preferencesMatchScheduledJob(preferences, payload) ? preferences : null;
}

function periodStart(frequency: "daily" | "weekly", end: Date): Date {
  return new Date(end.getTime() - (frequency === "daily" ? 24 : 7 * 24) * 60 * 60 * 1000);
}

export async function generateScheduledOperatingReport(payload: ScheduledReportJobPayload) {
  const preferences = await currentScheduledReportPreferences(payload);
  if (!preferences) {
    return { skipped: true, reason: "schedule_changed" } as const;
  }

  const end = new Date(payload.scheduledFor);
  const safeEnd = Number.isNaN(end.getTime()) ? new Date() : end;
  const start = periodStart(payload.frequency, safeEnd);
  const callsInPeriod = and(
    eq(schema.callLogs.userId, payload.userId),
    gte(schema.callLogs.createdAt, start),
    lt(schema.callLogs.createdAt, safeEnd),
  );
  const pendingTasks = and(
    eq(schema.followUpTasks.userId, payload.userId),
    eq(schema.followUpTasks.status, "pending"),
  );

  // Schedule the next occurrence before doing external work. A transient OpenAI
  // or connector outage can fail this report without silently stopping all future reports.
  await ensureNextScheduledReport(
    payload.userId,
    preferences,
    new Date(safeEnd.getTime() + 60_000),
  );

  const calls = await drizzle
    .select({
      createdAt: schema.callLogs.createdAt,
      agentId: schema.callLogs.agentId,
      direction: schema.callLogs.direction,
      customerNumber: schema.callLogs.customerNumber,
      durationSeconds: schema.callLogs.durationSeconds,
      summary: schema.callLogs.summary,
      outcomeTag: schema.callLogs.outcomeTag,
      leadScore: schema.callLogs.leadScore,
      sentiment: schema.callLogs.sentiment,
      intentLabel: schema.callLogs.intentLabel,
      campaignSource: schema.callLogs.campaignSource,
      qaScore: schema.callLogs.qaScore,
    })
    .from(schema.callLogs)
    .where(callsInPeriod)
    .orderBy(desc(schema.callLogs.createdAt))
    .limit(250);

  // Detailed rows are a bounded sample for narrative examples. Aggregate the
  // whole reporting window separately so busy workspaces do not lose earlier
  // calls, minutes, outcomes or scored calls from their reported totals.
  // Buckets start at the schedule's UTC time, matching the report period.
  const dayIndex = sql<number>`floor(extract(epoch from (${schema.callLogs.createdAt} - ${start.toISOString()}::timestamptz)) / 86400)::integer`;
  const [callGroups, [appointmentTotals], openTasks, [taskTotals]] = await Promise.all([
    drizzle
      .select({
        dayIndex: dayIndex.as("report_day_index"),
        outcomeTag: schema.callLogs.outcomeTag,
        callCount: sql<number>`count(*)`,
        durationSeconds: sql<number>`coalesce(sum(${schema.callLogs.durationSeconds}), 0)`,
        qaScoreTotal: sql<number>`coalesce(sum(${schema.callLogs.qaScore}), 0)`,
        qaScoreCount: sql<number>`count(${schema.callLogs.qaScore})`,
      })
      .from(schema.callLogs)
      .where(callsInPeriod)
      .groupBy((fields) => [fields.dayIndex, fields.outcomeTag]),
    drizzle
      .select({ count: sql<number>`count(*)` })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.userId, payload.userId),
          gte(schema.appointments.createdAt, start),
          lt(schema.appointments.createdAt, safeEnd),
        ),
      ),
    drizzle
      .select({
        description: schema.followUpTasks.description,
        priority: schema.followUpTasks.priority,
        dueDate: schema.followUpTasks.dueDate,
      })
      .from(schema.followUpTasks)
      .where(pendingTasks)
      .orderBy(desc(schema.followUpTasks.createdAt))
      .limit(30),
    drizzle
      .select({ count: sql<number>`count(*)` })
      .from(schema.followUpTasks)
      .where(pendingTasks),
  ]);

  const dayCount = payload.frequency === "daily" ? 1 : 7;
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const volumeByDay: WeeklyRecapVolumePoint[] = Array.from({ length: dayCount }, (_, index) => ({
    label: dayLabels[new Date(start.getTime() + index * 86_400_000).getUTCDay()],
    count: 0,
  }));
  let callCount = 0;
  let durationSeconds = 0;
  let qaScoreTotal = 0;
  let qaScoreCount = 0;
  const outcomes: Record<string, number> = {};
  for (const group of callGroups) {
    // Postgres count/sum may arrive as strings even with a typed SQL expression.
    const count = Number(group.callCount);
    callCount += count;
    durationSeconds += Number(group.durationSeconds);
    qaScoreTotal += Number(group.qaScoreTotal);
    qaScoreCount += Number(group.qaScoreCount);
    const key = group.outcomeTag || "unclassified";
    outcomes[key] = (outcomes[key] || 0) + count;
    const bucket = volumeByDay[Number(group.dayIndex)];
    if (bucket) bucket.count += count;
  }
  const minutes = Math.round(durationSeconds / 60);
  const qualified = (outcomes.qualified || 0) + (outcomes.booked || 0);
  const averageQa = qaScoreCount ? Math.round(qaScoreTotal / qaScoreCount) : null;
  const openTaskCount = Number(taskTotals?.count ?? 0);
  const periodLabel = `${start.toISOString().slice(0, 10)} through ${safeEnd
    .toISOString()
    .slice(0, 10)}`;
  const title = `${payload.frequency === "daily" ? "Daily" : "Weekly"} Agent Performance Report`;
  const summary = JSON.stringify(
    {
      period: periodLabel,
      calls: callCount,
      voice_minutes: minutes,
      outcomes,
      booked_or_qualified: qualified,
      appointments_created: Number(appointmentTotals?.count ?? 0),
      open_follow_up_tasks: openTaskCount,
      average_qa_score: averageQa,
      instruction:
        "Use these full-period totals. Supporting call and task details are recent samples, not the complete history. Explain what happened, what needs attention, and the three highest-value next actions; do not present sample-only patterns as period-wide facts.",
    },
    null,
    2,
  );
  const supporting = JSON.stringify(
    {
      calls: calls.slice(0, 100),
      open_tasks: openTasks,
      sampling: {
        calls_included: Math.min(calls.length, 100),
        calls_total: callCount,
        open_tasks_included: openTasks.length,
        open_tasks_total: openTaskCount,
        selection: "Most recent records; summary metrics cover the full reporting period.",
      },
    },
    null,
    2,
  );

  const artifact = await generateAndStorePostCallArtifact({
    userId: payload.userId,
    callLogId: `scheduled:${payload.scheduleVersion}:${payload.scheduledFor}`,
    outcomeTag: "operating-report",
    summary,
    transcript: supporting,
    format: payload.format,
    destination: payload.destination,
    purpose: "operating_report",
    reportTitle: title,
    periodLabel,
  });

  const shareableRecap =
    payload.frequency === "weekly"
      ? await maybePublishWeeklyRecap({
          userId: payload.userId,
          weekLabel: periodLabel,
          periodStart: start,
          periodEnd: safeEnd,
          volumeByDay,
          totals: {
            calls: callCount,
            voiceMinutes: minutes,
            booked: outcomes.booked || 0,
            qualified: outcomes.qualified || 0,
            followup: outcomes.followup || 0,
          },
          averageQaScore: averageQa,
          outcomeMix: Object.entries(outcomes)
            .map<WeeklyRecapOutcomeSlice>(([tag, count]) => ({ tag, count }))
            .sort((left, right) => right.count - left.count),
          topMoments: calls
            .filter(
              (call) =>
                call.outcomeTag === "booked" ||
                call.outcomeTag === "qualified" ||
                (call.leadScore ?? 0) >= 70,
            )
            .slice(0, 5)
            .map((call) => ({
              // Redact before this reaches the shareable weekly-recap artifact —
              // same reasoning as maybePublishCallRecap: a spoken card number or
              // SSN in the underlying call summary must never survive into a
              // link-gated public page.
              hero: redactSensitiveText(
                call.summary?.split(/\n+/)[0]?.trim() || `${call.outcomeTag || "call"}`,
              ),
              caller: call.customerNumber || null,
              atLabel: call.createdAt ? call.createdAt.toISOString().slice(0, 10) : null,
            })),
          followUps: openTasks.slice(0, 6).map((task) => ({
            description: redactSensitiveText(task.description ?? ""),
            priority:
              task.priority === "high" || task.priority === "medium" || task.priority === "low"
                ? task.priority
                : null,
            dueAtLabel: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
          })),
        })
      : null;

  return {
    skipped: false,
    title,
    period: periodLabel,
    calls: callCount,
    externalUrl: artifact.externalUrl,
    fileName: artifact.fileName,
    destination: artifact.provider,
    openaiResponseId: artifact.openaiResponseId,
    shareableRecapUrl: shareableRecap?.url ?? null,
  } as const;
}
