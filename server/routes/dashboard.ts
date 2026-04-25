import { Router, type Response } from "express";

import { authenticateUser, type AuthenticatedRequest } from "../lib/auth";
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
      const [apptRes, leadsRes, logsRes] = await Promise.all([
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
          .select("cost, duration_seconds, direction, created_at")
          .eq("user_id", req.user!.id)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const totalAppointments = apptRes.count || 0;
      const totalLeads = leadsRes.count || 0;
      const logs = logsRes.data || [];

      const totalMinutes = Math.ceil(
        logs.reduce((acc, log) => acc + (log.duration_seconds || 0), 0) / 60
      );
      const totalCost = logs.reduce((acc, log) => acc + (Number(log.cost) || 0), 0);
      const inboundCount = logs.filter((l) => l.direction === "inbound").length;
      const outboundCount = logs.filter((l) => l.direction === "outbound").length;
      const conversionRate =
        logs.length > 0 ? ((totalAppointments / logs.length) * 100).toFixed(1) : 0;

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
