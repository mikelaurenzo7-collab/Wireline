/* eslint-disable @typescript-eslint/no-explicit-any -- audit metadata is stored as Postgres jsonb and varies by event type. */
import { Router, Response } from "express";
import { AppError } from "../lib/api-error";
import { drizzle, log, auditLogger } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, gte, desc, and } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { computeAuditSummary } from "../lib/audit-summary";
import {
  createAuditEventsHandler,
  createAuditStatsHandler,
  createAuditExportHandler,
} from "../lib/audit-handlers";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

const auditRouteDeps = { drizzle, auditLogger, log };

router.get(
  "/api/audit/summary",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rawDays = parseInt(String(req.query.days ?? ""), 10);
      const days = Math.min(Math.max(1, Number.isNaN(rawDays) ? 30 : rawDays), 365);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const rows = await drizzle
        .select()
        .from(schema.auditLog)
        .where(and(eq(schema.auditLog.userId, req.user.id), gte(schema.auditLog.createdAt, since)))
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(5000);

      res.json(computeAuditSummary({ rows: rows || [], windowDays: days }));
    } catch (e: any) {
      log.error("Audit summary failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Audit summary failed");
    }
  },
);

router.get(
  "/api/audit/recent",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rawLimit = parseInt(String(req.query.limit ?? ""), 10);
      const limit = Math.min(Math.max(1, Number.isNaN(rawLimit) ? 100 : rawLimit), 500);
      const data = await drizzle
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.userId, req.user.id))
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(limit);

      res.json({ logs: data || [] });
    } catch (err: any) {
      log.error("GET /api/audit failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Audit fetch failed");
    }
  },
);

router.get("/api/audit/events", authenticateUser, createAuditEventsHandler(auditRouteDeps));
router.get("/api/audit/stats", authenticateUser, createAuditStatsHandler(auditRouteDeps));
router.get("/api/audit/export", authenticateUser, createAuditExportHandler(auditRouteDeps));

router.get(
  "/api/spend/budget",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [data] = await drizzle
        .select()
        .from(schema.spendBudgets)
        .where(eq(schema.spendBudgets.userId, req.user.id))
        .limit(1);

      res.json({
        budget: data
          ? {
              monthly_limit_usd: data.monthlyLimitUsd,
              hard_cap: data.hardCap,
              warn_threshold_pct: data.warnThresholdPct,
              enabled: data.enabled,
              updated_at: data.updatedAt,
            }
          : {
              monthly_limit_usd: 0,
              hard_cap: false,
              warn_threshold_pct: 80,
              enabled: true,
              updated_at: null,
            },
      });
    } catch (e: any) {
      log.error("Failed to load budget", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load budget");
    }
  },
);

export default router;
