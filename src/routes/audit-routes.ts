import { Router, Response } from "express";

import { db, log, auditLogger } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { computeAuditSummary } from "../lib/audit-summary";
import { createAuditEventsHandler, createAuditStatsHandler, createAuditExportHandler } from "../lib/audit-routes";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

const auditRouteDeps = { db, auditLogger, log };


router.get("/api/audit/summary", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await db
      .from("wireline_audit_log")
      .select("action, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_create_tokens, cost_usd, latency_ms, created_at")
      .eq("user_id", req.user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;

    res.json(computeAuditSummary({ rows: rows || [], windowDays: days }));
  } catch {
    res.status(500).json({ error: "Audit summary failed" });
  }
});

router.get("/api/audit/recent", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || "100"), 500);
    const { data, error } = await db
      .from("wireline_audit_log")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ entries: data || [] });
  } catch {
    res.status(500).json({ error: "Audit fetch failed" });
  }
});

router.get("/api/audit/events", authenticateUser, createAuditEventsHandler(auditRouteDeps));

// GET /api/audit/stats — aggregate statistics
router.get("/api/audit/stats", authenticateUser, createAuditStatsHandler(auditRouteDeps));

// GET /api/audit/export — export as CSV or JSON, honoring the same
// filter shape as /api/audit/events so a "filtered view → export"
// flow in the UI produces a CSV that matches the on-screen rows.
router.get("/api/audit/export", authenticateUser, createAuditExportHandler(auditRouteDeps));

// ──────────────────────────────────────────────────────────
//  SPEND BUDGET — monthly Claude limit, hard-cap toggle,
//  warn-threshold %. Composed with the audit log + outbound webhooks
//  to give operators a real safety net for LLM bills.
// ──────────────────────────────────────────────────────────

router.get("/api/spend/budget", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data } = await db.from("wireline_spend_budgets")
      .select("monthly_limit_usd, hard_cap, warn_threshold_pct, enabled, updated_at")
      .eq("user_id", req.user.id).maybeSingle();
    res.json({
      budget: data || {
        monthly_limit_usd: 0,
        hard_cap: false,
        warn_threshold_pct: 80,
        enabled: true,
        updated_at: null,
      },
    });
  } catch (e: unknown) { log.error("Failed to load budget", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to load budget" }); }
});

export default router;
