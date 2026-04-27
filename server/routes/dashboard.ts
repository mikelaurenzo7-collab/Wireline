import { Router, type Response } from "express";

import { authenticateUser, type AuthenticatedRequest } from "../lib/auth";
import { asyncHandler } from "../lib/errors";
import { logger } from "../lib/logger";
import { db } from "../lib/supabase";

const router = Router();

// 72 keeps a newly configured fleet in "watchful but usable" territory and leaves
// a 28-point penalty buffer before it drops below 50% when backlog starts building.
const BASELINE_FLEET_HEALTH = 72;
const MAX_AGENT_HEALTH_BONUS = 12;
const AGENT_HEALTH_WEIGHT = 3;
const MAX_TRAFFIC_HEALTH_BONUS = 8;
const MAX_TASK_BACKLOG_PENALTY = 18;
const TASK_BACKLOG_WEIGHT = 3;
const MAX_QUEUE_BACKLOG_PENALTY = 10;

type RecommendedAction = {
  id: string;
  label: string;
  detail: string;
  href: string;
  priority: "critical" | "high" | "medium";
};

function actionIf(condition: boolean, action: RecommendedAction) {
  return condition ? [action] : [];
}

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
        leadsRes,
        logsRes,
        agentsRes,
        pendingTasksRes,
        openThreadsRes,
        queuedLeadsRes,
        nextAppointmentsRes,
      ] = await Promise.all([
        db
          .from("wireline_appointments")
          .select("id", { count: "exact" })
          .eq("user_id", req.user!.id),
        db
          .from("wireline_outbound_leads")
          .select("id", { count: "exact" })
          .eq("user_id", req.user!.id),
        db
          .from("wireline_call_logs")
          .select("cost, duration_seconds, direction, created_at, lead_score")
          .eq("user_id", req.user!.id)
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("wireline_agents")
          .select("id, name, channel, created_at")
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
          .in("status", ["open", "pending_ai"]),
        db
          .from("wireline_outbound_leads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", req.user!.id)
          .in("status", ["Queued", "Pending"]),
        db
          .from("wireline_appointments")
          .select("id, customer_name, service_type, date, time, status, created_at")
          .eq("user_id", req.user!.id)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

      const totalAppointments = apptRes.count || 0;
      const totalLeads = leadsRes.count || 0;
      const logs = logsRes.data || [];
      const agents = agentsRes.data || [];

      const totalMinutes = Math.ceil(
        logs.reduce((acc, log) => acc + (log.duration_seconds || 0), 0) / 60
      );
      const totalCost = logs.reduce((acc, log) => acc + (Number(log.cost) || 0), 0);
      const inboundCount = logs.filter((l) => l.direction === "inbound").length;
      const outboundCount = logs.filter((l) => l.direction === "outbound").length;
      const conversionRate =
        logs.length > 0 ? ((totalAppointments / logs.length) * 100).toFixed(1) : 0;
      const voiceAgents = agents.filter(
        (agent) => agent.channel === "voice" || agent.channel === "omnichannel"
      ).length;
      const emailAgents = agents.filter(
        (agent) => agent.channel === "email" || agent.channel === "omnichannel"
      ).length;
      const pendingTasks = pendingTasksRes.count || 0;
      const openThreads = openThreadsRes.count || 0;
      const queuedLeads = queuedLeadsRes.count || 0;

      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const recentSevenDayLogs = logs.filter(
        (log) => log.created_at && new Date(log.created_at).getTime() >= sevenDaysAgo
      );
      const avgLeadScore =
        logs.length > 0
          ? Math.round(
              logs.reduce((acc, log) => acc + (Number(log.lead_score) || 0), 0) / logs.length
            )
          : 0;
      // Lightweight readiness score: start from a healthy baseline, reward active coverage and
      // recent traffic, then subtract operational backlog so the dashboard can flag drift quickly.
      const fleetHealth = Math.max(
        0,
        Math.min(
          100,
          BASELINE_FLEET_HEALTH +
            Math.min(MAX_AGENT_HEALTH_BONUS, agents.length * AGENT_HEALTH_WEIGHT) +
            Math.min(MAX_TRAFFIC_HEALTH_BONUS, recentSevenDayLogs.length) -
            Math.min(MAX_TASK_BACKLOG_PENALTY, pendingTasks * TASK_BACKLOG_WEIGHT) -
            Math.min(MAX_QUEUE_BACKLOG_PENALTY, queuedLeads)
        )
      );

      const recommendedActions = [
        ...actionIf(agents.length === 0, {
          id: "create-agent",
          label: "Deploy your first agent",
          detail: "Create a voice, email, or omnichannel agent before running live traffic.",
          href: "/agents",
          priority: "critical",
        }),
        ...actionIf(voiceAgents === 0, {
          id: "voice-agent",
          label: "Add voice coverage",
          detail: "A voice-capable agent unlocks inbound testing and outbound dispatch.",
          href: "/agents",
          priority: "high",
        }),
        ...actionIf(emailAgents === 0, {
          id: "email-agent",
          label: "Add email coverage",
          detail: "An email-capable agent can draft replies and triage inbox demand.",
          href: "/agents",
          priority: "medium",
        }),
        ...actionIf(pendingTasks > 0, {
          id: "process-handoffs",
          label: "Process pending handoffs",
          detail: `${pendingTasks} cross-channel ${pendingTasks === 1 ? "task needs" : "tasks need"} review.`,
          href: "/",
          priority: "high",
        }),
        ...actionIf(queuedLeads > 0, {
          id: "launch-queue",
          label: "Launch queued outreach",
          detail: `${queuedLeads} outbound ${queuedLeads === 1 ? "lead is" : "leads are"} ready for dispatch.`,
          href: "/outbound",
          priority: "medium",
        }),
        ...actionIf(openThreads > 0, {
          id: "review-inbox",
          label: "Review active inbox threads",
          detail: `${openThreads} email ${openThreads === 1 ? "thread is" : "threads are"} awaiting attention.`,
          href: "/inbox",
          priority: "medium",
        }),
      ].slice(0, 4);

      const { data: hotCalls } = await db
        .from("wireline_call_logs")
        .select("*")
        .eq("user_id", req.user!.id)
        .gte("lead_score", 75)
        .order("created_at", { ascending: false })
        .limit(5);
      const { data: hotEmails } = await db
        .from("wireline_email_threads")
        .select("*")
        .eq("user_id", req.user!.id)
        .gte("lead_score", 75)
        .order("created_at", { ascending: false })
        .limit(5);

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

      res.json({
        totalAppointments,
        totalLeads,
        totalCalls: logs.length,
        totalMinutes,
        totalCost: totalCost.toFixed(2),
        inboundCount,
        outboundCount,
        conversionRate,
        avgLeadScore,
        activeAgents: agents.length,
        voiceAgents,
        emailAgents,
        agents,
        pendingTasks,
        openThreads,
        queuedLeads,
        fleetHealth,
        recommendedActions,
        nextAppointments: nextAppointmentsRes.data || [],
        recentSevenDaySignals: recentSevenDayLogs.length,
        recentLogs: logs.slice(0, 100),
        hotLeads,
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
