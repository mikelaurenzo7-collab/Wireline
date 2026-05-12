import { Router } from "express";
import { db, log, auditLogger } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { computeDashboardStats } from "../lib/dashboard-stats";
import { computeDashboardBenchmarks } from "../lib/dashboard-benchmarks";
import { getErrorMessage } from "../lib/server-utils";

const router = Router();

// ────────────────────────────────────────────────────────────────────
//  NAV COUNTS — lightweight badge data for the sidebar nav.
//  Returns a map of route path → integer count so the sidebar can render
//  attention badges without a full data load. Uses COUNT(*) queries only.
// ────────────────────────────────────────────────────────────────────
router.get("/api/nav-counts", authenticateUser, async (req: any, res: any) => {
  try {
    const userId = req.user.id;

    const [
      { count: triageCount },
      { count: emailCount },
      { count: outboundCount },
      { data: liveSignals },
    ] = await Promise.all([
      // Triage: pending fleet tasks (any type)
      db.from("wireline_fleet_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "pending"),
      // Email: unread threads
      db.from("wireline_email_threads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("read", false),
      // Outbound: queued leads not yet dialed
      db.from("wireline_outbound_leads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "queued"),
      // Live: active calls whose sentiment label indicates distress ("⚠ Frustrated")
      db.from("wireline_signal_presence")
        .select("label")
        .eq("user_id", userId),
    ]);

    // Count signals whose label starts with the distress prefix (⚠).
    const distressedCount = (liveSignals ?? []).filter(
      (s: any) => typeof s.label === "string" && s.label.startsWith("⚠")
    ).length;

    res.json({
      "/triage":   triageCount    ?? 0,
      "/inbox":    emailCount     ?? 0,
      "/outbound": outboundCount  ?? 0,
      "/live":     distressedCount,
    });
  } catch (e) {
    // Never 500 on a non-critical badge endpoint
    log.warn("nav-counts failed", { error: e instanceof Error ? e.message : String(e) });
    res.json({ "/triage": 0, "/inbox": 0, "/outbound": 0, "/live": 0 });
  }
});

// 1.5 CALL LOG RETRIEVAL ENDPOINT
router.get("/api/calls", authenticateUser, async (req: any, res: any) => {
  try {
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 200);
    const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);
    
    const { data: calls, error, count } = await db
      .from('wireline_call_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
      
    if (error) throw error;
    res.json({ 
       calls: calls || [],
       hasMore: count ? (offset + limit) < count : false,
       total: count || 0
    });
  } catch (error: any) {
    log.error("Failed to fetch calls", { error: getErrorMessage(error) });
    res.json({ calls: [], hasMore: false, total: 0 }); // Fail gracefully if table not created
  }
});

// ==========================================
// 1.8 DASHBOARD STATS ENDPOINT
// ==========================================
router.get("/api/dashboard/stats", authenticateUser, async (req: any, res: any) => {
   try {
      // Compute time windows once so all sub-queries share the same boundaries.
      const now = Date.now();
      const sevenDaysAgo     = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
      const fourteenDaysAgo  = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

      // All queries run in parallel — no serial awaits below this line.
      const [apptRes, leadsRes, logsRes, agentsRes, hotEmailsRes, recentApptsRes, prevLogsRes] = await Promise.all([
          db.from('wireline_appointments').select('id', { count: 'exact' }).eq('user_id', req.user.id),
          db.from('wireline_outbound_leads').select('id', { count: 'exact' }).eq('user_id', req.user.id),
          db.from('wireline_call_logs')
            // intent_label added so hotCalls can be derived from this result set
            .select('id, cost, duration_seconds, direction, created_at, lead_score, intent_label, summary, customer_number, sentiment, coaching_note')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(200),
          db.from('wireline_agents').select('id, name, channel, role').eq('user_id', req.user.id).limit(500),
          // Hot email threads — only the fields the client actually consumes
          db.from('wireline_email_threads')
            .select('id, customer_email, lead_score, intent_label, summary, created_at')
            .eq('user_id', req.user.id)
            .gte('lead_score', 75)
            .order('created_at', { ascending: false })
            .limit(5),
          // Appointments created in the last 7 days — scoped to avoid a full-table scan
          db.from('wireline_appointments')
            .select('created_at')
            .eq('user_id', req.user.id)
            .gte('created_at', sevenDaysAgo),
          // Prior 7-day window (days 8-14) — used for week-over-week trend arrows
          db.from('wireline_call_logs')
            .select('id, cost, lead_score, created_at')
            .eq('user_id', req.user.id)
            .gte('created_at', fourteenDaysAgo)
            .lt('created_at', sevenDaysAgo)
            .limit(500),
      ]);
      
      const totalAppointments = apptRes.count || 0;
      const totalLeads = leadsRes.count || 0;

      // Hand the rows to the pure stats math (src/lib/dashboard-stats.ts)
      // so each derivation — totals, sentiment, week-delta, hot leads,
      // 7-day chart series — is unit-tested in isolation.
      const stats = computeDashboardStats({
        totalAppointments,
        totalLeads,
        logs:        logsRes.data || [],
        prevLogs:    prevLogsRes.data || [],
        hotEmails:   hotEmailsRes.data || [],
        recentAppts: recentApptsRes.data || [],
      });

      res.json({
         ...stats,
         agents: agentsRes.data || [],
         recentLogs: (logsRes.data || []).slice(0, 100),
      });
   } catch(e: any) {
      log.error("Dashboard stats error", { error: e?.message || String(e) });
      res.status(500).json({ error: "Failed to fetch stats" });
   }
});

// Performance benchmarks — compare user's stats against industry averages
router.get("/api/dashboard/benchmarks", authenticateUser, async (req: any, res: any) => {
  try {
    const userId = req.user.id;

    // Fetch user's actual stats for the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [callsResult, leadsResult, agentsResult] = await Promise.all([
      db.from('wireline_call_logs')
        .select('duration_seconds, lead_score, intent_label, cost, qa_score')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo),
      db.from('wireline_outbound_leads')
        .select('status')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo),
      db.from('wireline_agents')
        .select('id')
        .eq('user_id', userId),
    ]);

    const result = computeDashboardBenchmarks({
      calls: callsResult.data || [],
      leads: leadsResult.data || [],
      agentCount: agentsResult.data?.length || 0,
    });
    res.json({ ...result, period: "30d" });
  } catch (error) {
    log.error("Benchmarks endpoint failed", { error });
    res.status(500).json({ error: "Failed to fetch benchmarks" });
  }
});

// ==========================================
// 1.6 APPOINTMENTS RETRIEVAL ENDPOINT
// ==========================================
router.get("/api/appointments", authenticateUser, async (req: any, res: any) => {
  try {
    // Hard cap to prevent 'load all my historical appointments' from
    // shipping a multi-MB response. Default 200, max 1000.
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 200 : limitRaw), 1000);
    const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);

    const { data: appointments, error, count } = await db
      .from('wireline_appointments')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({
      appointments: appointments || [],
      total: count || 0,
      hasMore: count ? (offset + limit) < count : false,
    });
  } catch (error: any) {
    log.error("Failed to fetch appointments", { error: getErrorMessage(error) });
    res.json({ appointments: [], total: 0, hasMore: false });
  }
});

const APPOINTMENT_STATUSES = ['Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'Rescheduled'] as const;

router.post("/api/appointments", authenticateUser, async (req: any, res: any) => {
  try {
    const { customer_name, service_type, date, time, phone_number, notes, agent_id, status } = req.body;
    if (!customer_name?.trim() || !date?.trim() || !time?.trim()) {
      return res.status(400).json({ error: "customer_name, date, and time are required" });
    }
    if (typeof customer_name !== 'string' || customer_name.length > 200) {
      return res.status(400).json({ error: "customer_name must be 200 characters or less" });
    }
    if (notes && (typeof notes !== 'string' || notes.length > 2000)) {
      return res.status(400).json({ error: "notes must be 2000 characters or less" });
    }
    if (agent_id) {
      const { data: agent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', agent_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }
    const { data, error } = await db.from('wireline_appointments').insert({
      user_id: req.user.id,
      customer_name: customer_name.trim(),
      service_type: typeof service_type === 'string' ? service_type.trim() || 'General' : 'General',
      date: date.trim(),
      time: time.trim(),
      phone_number: typeof phone_number === 'string' ? phone_number.trim() || null : null,
      notes: typeof notes === 'string' ? notes.trim() || null : null,
      agent_id: agent_id || null,
      status: APPOINTMENT_STATUSES.includes(status) ? status : 'Scheduled',
    }).select().single();
    if (error) throw error;
    res.json({ appointment: data });
  } catch (error: any) {
    log.error("Failed to create appointment", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to create appointment" });
  }
});

router.patch("/api/appointments/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const allowed = ['status', 'date', 'time', 'customer_name', 'service_type', 'notes', 'phone_number', 'agent_id'];
    const updates: Record<string, unknown> = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No valid fields to update" });

    if (typeof updates.customer_name === 'string' && updates.customer_name.length > 200) {
      return res.status(400).json({ error: "customer_name must be 200 characters or less" });
    }
    if (typeof updates.notes === 'string' && updates.notes.length > 2000) {
      return res.status(400).json({ error: "notes must be 2000 characters or less" });
    }
    if (updates.status !== undefined && !APPOINTMENT_STATUSES.includes(updates.status as any)) {
      return res.status(400).json({ error: `status must be one of: ${APPOINTMENT_STATUSES.join(', ')}` });
    }

    if (updates.agent_id) {
      const { data: agent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', updates.agent_id as string)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }

    const { data, error } = await db.from('wireline_appointments')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select().single();
    if (error) throw error;
    res.json({ appointment: data });
  } catch (error: any) {
    log.error("Failed to update appointment", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update appointment" });
  }
});

router.delete("/api/appointments/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { error } = await db.from('wireline_appointments')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to delete appointment", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to delete appointment" });
  }
});

function rowsToCsv(rows: any[], columns: string[]): string {
  if (rows.length === 0) return columns.join(",");
  const header = columns.join(",");
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const val = row[col];
          if (val == null) return "";
          const str = String(val).replace(/"/g, '""');
          return str.includes(",") || str.includes("\n") || str.includes('"') ? `"${str}"` : str;
        })
        .join(",")
    )
    .join("\n");
  return `${header}\n${body}`;
}

const EXPORT_DEFS: Record<string, { table: string; columns: string[]; order: string }> = {
  calls: {
    table: "wireline_call_logs",
    columns: ["created_at", "customer_number", "direction", "duration_seconds", "cost", "lead_score", "intent_label", "sentiment", "summary"],
    order: "created_at",
  },
  leads: {
    table: "wireline_outbound_leads",
    columns: ["created_at", "customer_number", "customer_name", "status", "last_called_at"],
    order: "created_at",
  },
  triage: {
    table: "wireline_fleet_tasks",
    columns: ["created_at", "task_type", "status", "priority", "description"],
    order: "created_at",
  },
  appointments: {
    table: "wireline_appointments",
    columns: ["date", "time", "customer_name", "service_type", "status", "phone_number"],
    order: "date",
  },
};

router.get("/api/export/:type.csv", authenticateUser, async (req: any, res: any) => {
  try {
    const def = EXPORT_DEFS[req.params.type];
    if (!def) return res.status(404).json({ error: `Unknown export type. Use: ${Object.keys(EXPORT_DEFS).join(", ")}.` });

    const { data, error } = await db
      .from(def.table)
      .select(def.columns.join(","))
      .eq("user_id", req.user.id)
      .order(def.order, { ascending: false });
    if (error) throw error;

    const filename = `wireline-${req.params.type}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    void auditLogger.logDataOperation('export', {
      userId: req.user.id,
      resourceType: req.params.type,
      recordCount: (data || []).length,
      ip: req.ip,
    }).catch(() => {});
    res.send(rowsToCsv(data || [], def.columns));
  } catch {
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;
