import { Router, type Response } from "express";

import { authenticateUser, type AuthenticatedRequest } from "../lib/auth";
import { buildDashboardBriefing } from "../lib/dashboard";
import { asyncHandler } from "../lib/errors";
import { logger } from "../lib/logger";
import { db } from "../lib/supabase";

const router = Router();

router.get(
  "/api/calls",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { data: calls, error } = await db
        .from("wireline_call_logs")
        .select("*")
        .eq("user_id", req.user!.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      res.json({ calls: calls || [] });
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch calls");
      res.json({ calls: [] });
    }
  })
);

router.get(
  "/api/dashboard/stats",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [
        apptRes,
        scheduledApptRes,
        leadsRes,
        logsRes,
        agentsRes,
        pendingTasksRes,
        openEmailThreadsRes,
        hotCallsRes,
        hotEmailsRes,
      ] = await Promise.all([
        db
          .from("wireline_appointments")
          .select("id", { count: "exact" })
          .eq("user_id", req.user!.id),
        db
          .from("wireline_appointments")
          .select("id", { count: "exact", head: true })
          .eq("user_id", req.user!.id)
          .eq("status", "Scheduled"),
        db
          .from("wireline_outbound_leads")
          .select("id", { count: "exact" })
          .eq("user_id", req.user!.id),
        db
          .from("wireline_call_logs")
          .select("id, cost, duration_seconds, direction, created_at, customer_number, summary", {
            count: "exact",
          })
          .eq("user_id", req.user!.id)
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("wireline_agents")
          .select("id, name, channel")
          .eq("user_id", req.user!.id)
          .order("created_at", { ascending: false }),
        db
          .from("wireline_fleet_tasks")
          .select("id", { count: "exact", head: true })
          .eq("user_id", req.user!.id)
          .eq("status", "pending"),
        db
          .from("wireline_email_threads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", req.user!.id)
          .eq("status", "open"),
        db
          .from("wireline_call_logs")
          .select("*", { count: "exact" })
          .eq("user_id", req.user!.id)
          .gte("lead_score", 75)
          .order("created_at", { ascending: false })
          .limit(5),
        db
          .from("wireline_email_threads")
          .select("*", { count: "exact" })
          .eq("user_id", req.user!.id)
          .gte("lead_score", 75)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const totalAppointments = apptRes.count || 0;
      const scheduledAppointments = scheduledApptRes.count || 0;
      const totalLeads = leadsRes.count || 0;
      const totalCallsCount = logsRes.count || 0;
      const logs = logsRes.data || [];
      const agents = agentsRes.data || [];

      const totalMinutes = Math.ceil(
        logs.reduce((acc, log) => acc + (log.duration_seconds || 0), 0) / 60
      );
      const totalCost = logs.reduce((acc, log) => acc + (Number(log.cost) || 0), 0);
      const inboundCount = logs.filter((l) => l.direction === "inbound").length;
      const outboundCount = logs.filter((l) => l.direction === "outbound").length;
      const conversionRate =
        totalCallsCount > 0 ? ((totalAppointments / totalCallsCount) * 100).toFixed(1) : "0.0";
      const hotCalls = hotCallsRes.data || [];
      const hotEmails = hotEmailsRes.data || [];
      const hotLeadCount = (hotCallsRes.count || 0) + (hotEmailsRes.count || 0);
      const pendingTasks = pendingTasksRes.count || 0;
      const openEmailThreads = openEmailThreadsRes.count || 0;
      const voiceAgents = agents.filter(
        (agent) => agent.channel === "voice" || agent.channel === "omnichannel"
      ).length;
      const emailAgents = agents.filter(
        (agent) => agent.channel === "email" || agent.channel === "omnichannel"
      ).length;
      const signalsLast24h = logs.filter((log) => {
        const createdAt = new Date(log.created_at).getTime();
        return Number.isFinite(createdAt) && Date.now() - createdAt <= 24 * 60 * 60 * 1000;
      }).length;

      const hotLeads = [
        ...(hotCalls || []).map((c) => ({
          id: c.id,
          type: "call",
          contact: c.customer_number,
          score: c.lead_score,
          intent: c.intent_label,
          summary: c.summary,
          date: c.created_at,
        })),
        ...(hotEmails || []).map((e) => ({
          id: e.id,
          type: "email",
          contact: e.customer_email,
          score: e.lead_score,
          intent: e.intent_label,
          summary: e.summary,
          date: e.created_at,
        })),
      ]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);

      const briefing = buildDashboardBriefing({
        totalCalls: totalCallsCount,
        totalAppointments,
        hotLeadCount,
        pendingTasks,
        openEmailThreads,
        activeAgents: agents.length,
        voiceAgents,
        emailAgents,
        signalsLast24h,
        inboundCount,
        outboundCount,
      });

      res.json({
        totalAppointments,
        scheduledAppointments,
        totalLeads,
        totalCalls: totalCallsCount,
        totalMinutes,
        totalCost: totalCost.toFixed(2),
        inboundCount,
        outboundCount,
        conversionRate,
        recentLogs: logs.slice(0, 100),
        hotLeads,
        hotLeadCount,
        activeAgents: agents.length,
        voiceAgents,
        emailAgents,
        pendingTasks,
        openEmailThreads,
        signalsLast24h,
        agents,
        briefing,
      });
    } catch (e) {
      logger.error({ err: e }, "Dashboard error");
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  })
);

router.get(
  "/api/appointments",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { data: appointments, error } = await db
        .from("wireline_appointments")
        .select("*")
        .eq("user_id", req.user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      res.json({ appointments: appointments || [] });
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch appointments");
      res.json({ appointments: [] });
    }
  })
);

export default router;
