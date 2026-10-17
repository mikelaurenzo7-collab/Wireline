/* eslint-disable @typescript-eslint/no-explicit-any -- aggregate stats and dashboard rows draw from heterogeneous queries. */
import { Router, Response } from "express";
import { AppError } from "../lib/api-error";
import type { AuthenticatedRequest } from "../types/auth";
import { log, auditLogger, drizzle, serialQueryBatch } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql, desc, lt, gte, inArray } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { dashboardRateLimit } from "../middleware/api-rate-limits";
import { computeDashboardStats } from "../lib/dashboard-stats";
import { presentCallAnalysis } from "../lib/call-review-note";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import { getCachedDashboard, setCachedDashboard } from "../lib/dashboard-cache";
import { getCachedNavCounts, setCachedNavCounts } from "../lib/nav-counts-cache";

import {
  bookNativeAppointment,
  updateCalendarAppointment,
  cancelCalendarAppointment,
} from "../lib/native-calendar";

const router = Router();

// ────────────────────────────────────────────────────────────────────
//  NAV COUNTS — lightweight badge data for the sidebar nav.
//  Returns a map of route path → integer count so the sidebar can render
//  attention badges without a full data load. Uses COUNT(*) queries only.
// ────────────────────────────────────────────────────────────────────
router.get(
  "/api/nav-counts",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;

      const cached = getCachedNavCounts(userId);
      if (cached) {
        res.json(cached);
        return;
      }

      const [[triageResult], [emailResult], [outboundResult], liveSignals] =
        await drizzle.transaction((tx) =>
          serialQueryBatch([
            tx
              .select({ count: sql`count(*)` })
              .from(schema.followUpTasks)
              .where(
                and(
                  eq(schema.followUpTasks.userId, userId),
                  eq(schema.followUpTasks.status, "pending"),
                ),
              ),
            tx
              .select({ count: sql`count(*)` })
              .from(schema.emailThreads)
              .where(
                and(eq(schema.emailThreads.userId, userId), eq(schema.emailThreads.read, false)),
              ),
            tx
              .select({ count: sql`count(*)` })
              .from(schema.outboundLeads)
              .where(
                and(
                  eq(schema.outboundLeads.userId, userId),
                  eq(schema.outboundLeads.status, "Queued"),
                ),
              ),
            tx
              .select({ label: schema.signalPresence.label })
              .from(schema.signalPresence)
              .where(eq(schema.signalPresence.userId, userId)),
          ]),
        );

      const triageCount = Number(triageResult.count);
      const emailCount = Number(emailResult.count);
      const outboundCount = Number(outboundResult.count);

      const distressedCount = (liveSignals || []).filter(
        (s: { label: string | null }) => typeof s.label === "string" && s.label.startsWith("⚠"),
      ).length;

      const counts = {
        "/overview": triageCount,
        "/inbox": emailCount,
        "/phone": triageCount + outboundCount + distressedCount,
      };
      setCachedNavCounts(userId, counts);
      res.json(counts);
    } catch (e) {
      if (e instanceof AppError) throw e;
      const message = e instanceof Error ? e.message : String(e);
      log.warn("nav-counts failed", { error: message });
      res.status(503).json({
        error: "Nav badge counts are temporarily unavailable.",
        code: "NAV_COUNTS_UNAVAILABLE",
      });
    }
  },
);

// 1.5 CALL LOG RETRIEVAL ENDPOINT
router.get("/api/calls", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 200);
    const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);

    const [countResult] = await drizzle
      .select({ count: sql`count(*)` })
      .from(schema.callLogs)
      .where(eq(schema.callLogs.userId, req.user.id));

    const count = Number(countResult.count);

    // Optimized query: LEFT JOIN with agents to get agent name in a single query
    // instead of N+1 pattern. The frontend can now display agent name without
    // a separate lookup. This eliminates the need to fetch all agents separately
    // and match them client-side.
    const calls = await drizzle
      .select({
        id: schema.callLogs.id,
        userId: schema.callLogs.userId,
        vapiCallId: schema.callLogs.vapiCallId,
        agentId: schema.callLogs.agentId,
        direction: schema.callLogs.direction,
        customerNumber: schema.callLogs.customerNumber,
        durationSeconds: schema.callLogs.durationSeconds,
        cost: schema.callLogs.cost,
        summary: schema.callLogs.summary,
        transcript: schema.callLogs.transcript,
        recordingUrl: schema.callLogs.recordingUrl,
        leadScore: schema.callLogs.leadScore,
        intentLabel: schema.callLogs.intentLabel,
        sentiment: schema.callLogs.sentiment,
        coachingNote: schema.callLogs.coachingNote,
        qaScore: schema.callLogs.qaScore,
        qaBreakdown: schema.callLogs.qaBreakdown,
        outcomeTag: schema.callLogs.outcomeTag,
        pipelineError: schema.callLogs.pipelineError,
        campaignSource: schema.callLogs.campaignSource,
        demo: schema.callLogs.demo,
        createdAt: schema.callLogs.createdAt,
        // Include agent name from the JOIN
        agentName: schema.agents.name,
      })
      .from(schema.callLogs)
      .leftJoin(schema.agents, eq(schema.callLogs.agentId, schema.agents.id))
      .where(eq(schema.callLogs.userId, req.user.id))
      .orderBy(desc(schema.callLogs.createdAt))
      .limit(limit)
      .offset(offset);

    // UI reads snake_case (call.customer_number, call.lead_score, etc.).
    // Drizzle returns camelCase. Normalize at the boundary so the call
    // detail panel actually populates lead score, intent label, transcript
    // metadata, recording URL — everything beyond the few fields that
    // happened to match by coincidence (id, summary, transcript, direction).
    const safeCalls = (calls || []).map((call) => ({
      ...presentCallAnalysis(call),
      recordingUrl: call.recordingUrl ? `/api/calls/${String(call.id)}/recording` : null,
    }));

    res.json({
      calls: mapObjectToSnake(safeCalls),
      hasMore: offset + limit < count,
      total: count || 0,
    });
  } catch (error: any) {
    log.error("Failed to fetch calls", { error: getErrorMessage(error) });
    throw AppError.fromHttpStatus(500, "Failed to fetch calls");
  }
});

// ==========================================
// 1.8 DASHBOARD STATS ENDPOINT
// ==========================================
router.get(
  "/api/dashboard/stats",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;

      // Check cache first — reduces load time from ~200-500ms to ~5-10ms
      const cached = getCachedDashboard(userId);
      if (cached) {
        res.json(cached);
        return;
      }

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const [
        apptCountResult,
        leadsCountResult,
        logsResult,
        agentsResult,
        hotEmailsResult,
        recentApptsResult,
        prevLogsResult,
      ] = await drizzle.transaction((tx) =>
        serialQueryBatch([
          tx
            .select({ count: sql`count(*)` })
            .from(schema.appointments)
            .where(eq(schema.appointments.userId, userId)),
          tx
            .select({ count: sql`count(*)` })
            .from(schema.outboundLeads)
            .where(eq(schema.outboundLeads.userId, userId)),
          tx
            .select({
              id: schema.callLogs.id,
              cost: schema.callLogs.cost,
              durationSeconds: schema.callLogs.durationSeconds,
              direction: schema.callLogs.direction,
              createdAt: schema.callLogs.createdAt,
              leadScore: schema.callLogs.leadScore,
              intentLabel: schema.callLogs.intentLabel,
              summary: schema.callLogs.summary,
              customerNumber: schema.callLogs.customerNumber,
              sentiment: schema.callLogs.sentiment,
              coachingNote: schema.callLogs.coachingNote,
            })
            .from(schema.callLogs)
            .where(eq(schema.callLogs.userId, userId))
            .orderBy(desc(schema.callLogs.createdAt))
            .limit(200),
          tx
            .select({
              id: schema.agents.id,
              name: schema.agents.name,
              channel: schema.agents.channel,
              role: schema.agents.role,
            })
            .from(schema.agents)
            .where(eq(schema.agents.userId, userId))
            .limit(500),
          tx
            .select({
              id: schema.emailThreads.id,
              customerEmail: schema.emailThreads.customerEmail,
              leadScore: schema.emailThreads.leadScore,
              intentLabel: schema.emailThreads.intentLabel,
              summary: schema.emailThreads.summary,
              createdAt: schema.emailThreads.createdAt,
            })
            .from(schema.emailThreads)
            .where(
              and(eq(schema.emailThreads.userId, userId), gte(schema.emailThreads.leadScore, 75)),
            )
            .orderBy(desc(schema.emailThreads.createdAt))
            .limit(5),
          tx
            .select({ createdAt: schema.appointments.createdAt })
            .from(schema.appointments)
            .where(
              and(
                eq(schema.appointments.userId, userId),
                gte(schema.appointments.createdAt, sevenDaysAgo),
              ),
            ),
          tx
            .select({
              id: schema.callLogs.id,
              cost: schema.callLogs.cost,
              leadScore: schema.callLogs.leadScore,
              createdAt: schema.callLogs.createdAt,
            })
            .from(schema.callLogs)
            .where(
              and(
                eq(schema.callLogs.userId, userId),
                gte(schema.callLogs.createdAt, fourteenDaysAgo),
                lt(schema.callLogs.createdAt, sevenDaysAgo),
              ),
            )
            .limit(500),
        ]),
      );

      const totalAppointments = Number(apptCountResult[0]?.count ?? 0);
      const totalLeads = Number(leadsCountResult[0]?.count ?? 0);
      const presentedLogs = logsResult.map(presentCallAnalysis);

      const stats = computeDashboardStats({
        totalAppointments,
        totalLeads,
        logs: presentedLogs.map((l) => ({
          ...l,
          customer_number: l.customerNumber,
          duration_seconds: l.durationSeconds,
          lead_score: l.leadScore,
          intent_label: l.intentLabel,
          coaching_note: l.coachingNote,
          created_at: l.createdAt,
        })) as any,
        prevLogs: prevLogsResult.map((l) => ({
          ...l,
          lead_score: l.leadScore,
          created_at: l.createdAt,
        })) as any,
        hotEmails: hotEmailsResult.map((e) => ({
          ...e,
          customer_email: e.customerEmail,
          lead_score: e.leadScore,
          intent_label: e.intentLabel,
          created_at: e.createdAt,
        })) as any,
        recentAppts: recentApptsResult.map((a) => ({ created_at: a.createdAt })) as any,
      });

      const responseData = {
        ...stats,
        agents: agentsResult || [],
        recentLogs: presentedLogs.slice(0, 100).map((l) => ({
          ...l,
          customer_number: l.customerNumber,
          duration_seconds: l.durationSeconds,
          lead_score: l.leadScore,
          intent_label: l.intentLabel,
          coaching_note: l.coachingNote,
          created_at: l.createdAt,
        })),
      };

      // Cache the computed stats for 60 seconds
      setCachedDashboard(userId, responseData);

      res.json(responseData);
    } catch (e: unknown) {
      log.error("Dashboard stats error", {
        userId: req.user?.id,
        error: e instanceof Error ? e.message : String(e),
      });
      throw AppError.fromHttpStatus(500, "Failed to fetch stats");
    }
  },
);

// The industry-benchmarks endpoint was removed 2026-08-13 together with its
// only consumer (PerformanceBenchmarks.tsx, unmounted) and its compute module:
// an authenticated route with zero product callers is attack surface plus
// authz-matrix noise for nothing.

// ==========================================
// 1.6 APPOINTMENTS RETRIEVAL ENDPOINT
// ==========================================
router.get(
  "/api/appointments",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const limitRaw = parseInt(req.query.limit as string);
      const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 200 : limitRaw), 1000);
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor.trim() : "";
      if (
        req.query.cursor !== undefined &&
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(cursor)
      ) {
        throw AppError.badRequest("Invalid appointment cursor. Refresh appointments.");
      }
      if (req.query.offset !== undefined && String(req.query.offset) !== "0") {
        throw AppError.badRequest("Use the returned cursor to load more appointments.");
      }
      let anchor: { createdAt: string; id: string } | undefined;
      if (cursor) {
        // Resolve the owned immutable key in SQL to retain Postgres microseconds.
        // Activity/status updates and newer bookings cannot shift later pages.
        [anchor] = await drizzle
          .select({
            id: schema.appointments.id,
            createdAt: sql<string>`to_char(coalesce(${schema.appointments.createdAt}, 'epoch'::timestamptz) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
          })
          .from(schema.appointments)
          .where(
            and(eq(schema.appointments.userId, req.user.id), eq(schema.appointments.id, cursor)),
          )
          .limit(1);
        if (!anchor)
          throw new AppError(
            404,
            "APPOINTMENT_CURSOR_EXPIRED",
            "Appointment history changed. Refresh to continue.",
          );
      }

      const [countResult] = await drizzle
        .select({ count: sql`count(*)` })
        .from(schema.appointments)
        .where(eq(schema.appointments.userId, req.user.id));

      const count = Number(countResult.count);

      const appointments = await drizzle
        .select()
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.userId, req.user.id),
            anchor
              ? sql`(coalesce(${schema.appointments.createdAt}, 'epoch'::timestamptz), ${schema.appointments.id}) < (${anchor.createdAt}::timestamptz, ${anchor.id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(sql`coalesce(${schema.appointments.createdAt}, 'epoch'::timestamptz)`),
          desc(schema.appointments.id),
        )
        .limit(limit + 1);

      const page = appointments.slice(0, limit);
      const hasMore = appointments.length > limit;
      res.json({
        appointments: mapObjectToSnake(page),
        total: count || 0,
        hasMore,
        nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      log.error("Failed to fetch appointments", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to fetch appointments");
    }
  },
);

/**
 * 1.7 LEAD DOSSIERS — Fetch dossiers for a list of customer numbers.
 * Used by the Recaps to populate caller intelligence cards.
 */
router.get(
  "/api/dashboard/dossiers",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const numbersRaw = req.query.numbers as string;
      if (!numbersRaw) return res.json({ dossiers: {} });

      const numbers = numbersRaw
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      if (numbers.length === 0) return res.json({ dossiers: {} });

      const dossierRows = await drizzle
        .select()
        .from(schema.leadDossiers)
        .where(
          and(
            eq(schema.leadDossiers.userId, req.user.id),
            inArray(schema.leadDossiers.customerNumber, numbers),
          ),
        );

      const dossierMap: Record<string, any> = {};
      dossierRows.forEach((d) => {
        dossierMap[d.customerNumber!] = d;
      });

      res.json({ dossiers: dossierMap });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Dossier fetch failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to load lead dossiers");
    }
  },
);

router.post(
  "/api/appointments",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    const appointment = await bookNativeAppointment(req.user.id, {
      customerName: body.customer_name,
      serviceType: body.service_type,
      date: body.date,
      time: body.time,
      timeZone: body.time_zone,
      phoneNumber: body.phone_number,
      notes: body.notes,
      agentId: body.agent_id,
      requestKey: body.request_key,
    });
    res.json({ appointment });
  },
);

router.patch(
  "/api/appointments/:id",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json({
      appointment: await updateCalendarAppointment(req.user.id, req.params.id, req.body || {}),
    });
  },
);

router.delete(
  "/api/appointments/:id",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    await cancelCalendarAppointment(req.user.id, req.params.id);
    res.json({ success: true });
  },
);

/** Matches audit export cap — prevents unbounded memory use on large tenants. */
const DATA_EXPORT_MAX_ROWS = 5_000;

function rowsToCsv(rows: Record<string, unknown>[], columns: string[]): string {
  if (rows.length === 0) return columns.join(",");
  const header = columns.join(",");
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const val = row[col];
          if (val == null) return "";
          let str = String(val).replace(/"/g, '""');
          // Formula-injection hardening: exported fields include caller-supplied
          // text (lead names arrive via the public intake API), and spreadsheet
          // apps execute cells starting with = + - @ or a tab/CR. Numbers and
          // dates can't carry formulas, so only string values are prefixed.
          if (typeof val === "string" && /^[=+\-@\t\r]/.test(str)) str = `'${str}`;
          return /[",\n\r]/.test(str) ? `"${str}"` : str;
        })
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}`;
}

router.get(
  "/api/export/:type.csv",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const type = req.params.type;
      let data: any[] = [];
      let columns: string[] = [];

      if (type === "calls") {
        columns = [
          "createdAt",
          "customerNumber",
          "direction",
          "durationSeconds",
          "cost",
          "leadScore",
          "intentLabel",
          "sentiment",
          "summary",
        ];
        data = await drizzle
          .select()
          .from(schema.callLogs)
          .where(eq(schema.callLogs.userId, req.user.id))
          .orderBy(desc(schema.callLogs.createdAt))
          .limit(DATA_EXPORT_MAX_ROWS);
      } else if (type === "leads") {
        columns = ["createdAt", "phoneNumber", "customerName", "status", "lastCalledAt"];
        data = await drizzle
          .select()
          .from(schema.outboundLeads)
          .where(eq(schema.outboundLeads.userId, req.user.id))
          .orderBy(desc(schema.outboundLeads.createdAt))
          .limit(DATA_EXPORT_MAX_ROWS);
      } else if (type === "triage") {
        columns = ["createdAt", "taskType", "status", "priority", "description"];
        data = await drizzle
          .select()
          .from(schema.followUpTasks)
          .where(eq(schema.followUpTasks.userId, req.user.id))
          .orderBy(desc(schema.followUpTasks.createdAt))
          .limit(DATA_EXPORT_MAX_ROWS);
      } else if (type === "appointments") {
        columns = ["date", "time", "customerName", "serviceType", "status", "phoneNumber"];
        data = await drizzle
          .select()
          .from(schema.appointments)
          .where(eq(schema.appointments.userId, req.user.id))
          .orderBy(desc(schema.appointments.date))
          .limit(DATA_EXPORT_MAX_ROWS);
      } else {
        throw AppError.fromHttpStatus(404, "Unknown export type.");
      }

      const filename = `botbound-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      void auditLogger
        .logDataOperation("export", {
          userId: req.user.id,
          resourceType: type,
          recordCount: data.length,
          ip: req.ip,
        })
        .catch(() => {});

      res.send(rowsToCsv(data, columns));
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("Export failed", { error: e });
      throw AppError.fromHttpStatus(500, "Export failed");
    }
  },
);

export default router;
