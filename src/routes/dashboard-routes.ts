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
import { computeDashboardBenchmarks } from "../lib/dashboard-benchmarks";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import {
  getCachedDashboard,
  setCachedDashboard,
  invalidateDashboard,
} from "../lib/dashboard-cache";
import { getCachedNavCounts, setCachedNavCounts } from "../lib/nav-counts-cache";

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
      ...call,
      recordingUrl: call.recordingUrl
        ? `/api/calls/${String(call.id)}/recording`
        : null,
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

      const stats = computeDashboardStats({
        totalAppointments,
        totalLeads,
        logs: logsResult.map((l) => ({
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
        recentLogs: (logsResult || []).slice(0, 100).map((l) => ({
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

// Performance benchmarks — compare user's stats against industry averages
router.get(
  "/api/dashboard/benchmarks",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // One pooled client for the whole fan-out. Every root Drizzle query
      // checks out its own tenant-scoped client and the serverless pool is
      // capped at five, so a bare Promise.all here would put two concurrent
      // dashboard mounts over the cap and fail on the 5s checkout timeout.
      const [calls, leads, agents] = await drizzle.transaction((tx) =>
        serialQueryBatch([
          tx
            .select({
              duration_seconds: schema.callLogs.durationSeconds,
              lead_score: schema.callLogs.leadScore,
              intent_label: schema.callLogs.intentLabel,
              cost: schema.callLogs.cost,
              qa_score: schema.callLogs.qaScore,
            })
            .from(schema.callLogs)
            .where(
              and(
                eq(schema.callLogs.userId, userId),
                gte(schema.callLogs.createdAt, thirtyDaysAgo),
              ),
            ),
          tx
            .select({ status: schema.outboundLeads.status })
            .from(schema.outboundLeads)
            .where(
              and(
                eq(schema.outboundLeads.userId, userId),
                gte(schema.outboundLeads.createdAt, thirtyDaysAgo),
              ),
            ),
          tx
            .select({ id: schema.agents.id })
            .from(schema.agents)
            .where(eq(schema.agents.userId, userId)),
        ]),
      );

      const result = computeDashboardBenchmarks({
        calls: calls as any,
        leads: leads as any,
        agentCount: agents.length || 0,
      });
      res.json({ ...result, period: "30d" });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Benchmarks endpoint failed", { error });
      throw AppError.fromHttpStatus(500, "Failed to fetch benchmarks");
    }
  },
);

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
      const offsetRaw = parseInt(req.query.offset as string);
      const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 200 : limitRaw), 1000);
      const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);

      const [countResult] = await drizzle
        .select({ count: sql`count(*)` })
        .from(schema.appointments)
        .where(eq(schema.appointments.userId, req.user.id));

      const count = Number(countResult.count);

      const appointments = await drizzle
        .select()
        .from(schema.appointments)
        .where(eq(schema.appointments.userId, req.user.id))
        .orderBy(desc(schema.appointments.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({
        appointments: mapObjectToSnake(appointments || []),
        total: count || 0,
        hasMore: offset + limit < count,
      });
    } catch (error: any) {
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

const APPOINTMENT_STATUSES = [
  "Scheduled",
  "Confirmed",
  "Completed",
  "Cancelled",
  "Rescheduled",
] as const;

router.post(
  "/api/appointments",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { customer_name, service_type, date, time, phone_number, notes, agent_id, status } =
        req.body;
      if (!customer_name?.trim() || !date?.trim() || !time?.trim()) {
        throw AppError.fromHttpStatus(400, "customer_name, date, and time are required");
      }
      if (typeof customer_name !== "string" || customer_name.length > 200) {
        throw AppError.fromHttpStatus(400, "customer_name must be 200 characters or less");
      }
      if (notes && (typeof notes !== "string" || notes.length > 2000)) {
        throw AppError.fromHttpStatus(400, "notes must be 2000 characters or less");
      }
      if (agent_id) {
        const [agent] = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agent_id), eq(schema.agents.userId, req.user.id)))
          .limit(1);
        if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
      }

      const [data] = (await drizzle
        .insert(schema.appointments)
        .values({
          userId: req.user.id,
          customerName: customer_name.trim(),
          serviceType:
            typeof service_type === "string" ? service_type.trim() || "General" : "General",
          date: date.trim(),
          time: time.trim(),
          phoneNumber: typeof phone_number === "string" ? phone_number.trim() || null : null,
          notes: typeof notes === "string" ? notes.trim() || null : null,
          agentId: agent_id || null,
          status: APPOINTMENT_STATUSES.includes(status) ? status : "Scheduled",
        })
        .returning()) as any[];

      invalidateDashboard(req.user.id);
      res.json({ appointment: data });
    } catch (error: any) {
      // Deliberate 400/404 validation errors are raised inside this try; without
      // the rethrow they were rewritten as an opaque 500 and the caller lost the
      // reason their request was rejected.
      if (error instanceof AppError) throw error;
      log.error("Failed to create appointment", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to create appointment");
    }
  },
);

router.patch(
  "/api/appointments/:id",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const allowed = [
        "status",
        "date",
        "time",
        "customer_name",
        "service_type",
        "notes",
        "phone_number",
        "agent_id",
      ];
      const bodyUpdates: Record<string, any> = {};
      for (const k of allowed) if (req.body[k] !== undefined) bodyUpdates[k] = req.body[k];
      if (Object.keys(bodyUpdates).length === 0)
        throw AppError.fromHttpStatus(400, "No valid fields to update");

      if (typeof bodyUpdates.customer_name === "string" && bodyUpdates.customer_name.length > 200) {
        throw AppError.fromHttpStatus(400, "customer_name must be 200 characters or less");
      }
      if (typeof bodyUpdates.notes === "string" && bodyUpdates.notes.length > 2000) {
        throw AppError.fromHttpStatus(400, "notes must be 2000 characters or less");
      }
      if (
        bodyUpdates.status !== undefined &&
        !APPOINTMENT_STATUSES.includes(bodyUpdates.status as (typeof APPOINTMENT_STATUSES)[number])
      ) {
        return res
          .status(400)
          .json({ error: `status must be one of: ${APPOINTMENT_STATUSES.join(", ")}` });
      }

      if (bodyUpdates.agent_id) {
        const [agent] = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(
            and(
              eq(schema.agents.id, bodyUpdates.agent_id as string),
              eq(schema.agents.userId, req.user.id),
            ),
          )
          .limit(1);
        if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
      }

      const updates: any = {};
      if (bodyUpdates.status !== undefined) updates.status = bodyUpdates.status;
      if (bodyUpdates.date !== undefined) updates.date = bodyUpdates.date;
      if (bodyUpdates.time !== undefined) updates.time = bodyUpdates.time;
      if (bodyUpdates.customer_name !== undefined) updates.customerName = bodyUpdates.customer_name;
      if (bodyUpdates.service_type !== undefined) updates.serviceType = bodyUpdates.service_type;
      if (bodyUpdates.notes !== undefined) updates.notes = bodyUpdates.notes;
      if (bodyUpdates.phone_number !== undefined) updates.phoneNumber = bodyUpdates.phone_number;
      if (bodyUpdates.agent_id !== undefined) updates.agentId = bodyUpdates.agent_id;

      const [data] = (await drizzle
        .update(schema.appointments)
        .set(updates)
        .where(
          and(
            eq(schema.appointments.id, req.params.id),
            eq(schema.appointments.userId, req.user.id),
          ),
        )
        .returning()) as any[];

      invalidateDashboard(req.user.id);
      res.json({ appointment: data });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      log.error("Failed to update appointment", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to update appointment");
    }
  },
);

router.delete(
  "/api/appointments/:id",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await drizzle
        .delete(schema.appointments)
        .where(
          and(
            eq(schema.appointments.id, req.params.id),
            eq(schema.appointments.userId, req.user.id),
          ),
        );
      invalidateDashboard(req.user.id);
      res.json({ success: true });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      log.error("Failed to delete appointment", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to delete appointment");
    }
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

      const filename = `wireline-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
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
