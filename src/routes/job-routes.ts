import { Router, Request, Response, NextFunction } from "express";
import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { log, auditLogger, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql, lte, gte } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { jobsRateLimit, jobsSweepRateLimit } from "../middleware/api-rate-limits";
import { getErrorMessage } from "../lib/server-utils";
import { getCallerRole } from "../middleware/require-role";
import { enqueue, getQueueStats } from "../lib/job-queue";
import { handleJob } from "../lib/job-worker";
import type { AuthenticatedRequest } from "../types/auth";

/** Extended request type for sweep endpoint — carries auth mode. */
interface SweepRequest extends AuthenticatedRequest {
  _sweepMode?: "cron" | "manual";
}

const router = Router();

// ──────────────────────────────────────────────────────────────────────────────
// JOB QUEUE ENDPOINTS
// ──────────────────────────────────────────────────────────────────────────────

router.get(
  "/stats",
  authenticateUser,
  jobsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await getQueueStats(drizzle, req.user.id);
      res.json(stats);
    } catch (err) {
      log.error("GET /api/jobs/stats failed", { error: getErrorMessage(err) });
      res.status(500).json({ error: "Failed to fetch job stats" });
    }
  },
);

/**
 * POST /api/jobs/prospect — enqueue an `autonomous_prospecting` job for the
 * authenticated tenant. Drives the "Activate Growth" button in the Command
 * Center header. The worker (src/lib/job-worker.ts) reads the tenant's
 * prospecting preferences and calls Apollo with them.
 *
 * Returns:
 *   { ok: true, jobId, prospectingEnabled }
 *
 * When the tenant has `settings.prospecting_enabled = false`, the job is
 * still queued but the worker will short-circuit with a log line. The
 * response surfaces `prospectingEnabled` so the UI can prompt the operator
 * to flip the flag in Admin → Growth before retrying.
 */
router.post(
  "/prospect",
  authenticateUser,
  jobsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [settings] = await drizzle
        .select({
          prospectingEnabled: schema.settings.prospectingEnabled,
        })
        .from(schema.settings)
        .where(eq(schema.settings.userId, req.user.id))
        .limit(1);

      const result = await enqueue(drizzle, {
        userId: req.user.id,
        type: "autonomous_prospecting",
        payload: { userId: req.user.id },
      });
      if (!result.ok) {
        return res.status(500).json({ error: result.error || "Failed to enqueue job" });
      }

      res.json({
        ok: true,
        jobId: result.jobId ?? null,
        prospectingEnabled: !!settings?.prospectingEnabled,
      });
    } catch (err) {
      log.error("POST /api/jobs/prospect failed", { error: getErrorMessage(err) });
      res.status(500).json({ error: "Failed to enqueue prospecting job" });
    }
  },
);

const cronOrAdminAuth = (req: SweepRequest, res: Response, next: NextFunction) => {
  const expectedCronSecret = process.env.CRON_SECRET || "";
  const authz = String(req.headers["authorization"] || "");
  const providedCronSecret = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  const isCron =
    expectedCronSecret.length >= 16 &&
    providedCronSecret.length === expectedCronSecret.length &&
    cryptoTimingSafeEqual(
      Buffer.from(providedCronSecret, "utf8"),
      Buffer.from(expectedCronSecret, "utf8"),
    );
  if (isCron) {
    req._sweepMode = "cron";
    return next();
  }

  authenticateUser(req, res, async (authErr?: unknown) => {
    if (authErr) return next(authErr);
    if (res.headersSent) return;
    try {
      const role = await getCallerRole(drizzle, req.user.id);
      if (role !== "owner" && role !== "admin") {
        void auditLogger
          .logJobSweep("denied", {
            userId: req.user.id,
            role,
            ip: req.ip,
          })
          .catch(() => {});
        return res
          .status(403)
          .json({ error: "Forbidden: requires admin or owner role", code: "FORBIDDEN" });
      }
      req._sweepMode = "manual";
      next();
    } catch (e) {
      log.error("sweep auth failed", { error: getErrorMessage(e) });
      return res.status(403).json({ error: "Authorization check failed", code: "FORBIDDEN" });
    }
  });
};

router.post(
  "/sweep",
  cronOrAdminAuth,
  jobsSweepRateLimit,
  async (req: SweepRequest, res: Response) => {
    try {
      const {
        claimJob: claim,
        completeJob: complete,
        failJob: fail,
        enqueue,
      } = await import("../lib/job-queue");

      const now = new Date();
      if (
        now.getUTCHours() === 2 &&
        now.getUTCMinutes() === 0 &&
        (req._sweepMode === "cron" || !req._sweepMode)
      ) {
        const tenants = await drizzle
          .select({ userId: schema.settings.userId, retentionDays: schema.settings.retentionDays })
          .from(schema.settings);

        if (tenants) {
          for (const t of tenants) {
            await enqueue(drizzle, {
              userId: t.userId,
              type: "purge_old_data",
              payload: { user_id: t.userId, retention_days: t.retentionDays },
            });
          }
        }
      }

      // Always enqueue a single cadence tick per sweep — the tick is
      // cluster-safe (each worker pulls one batch up to limit and updates
      // rows transactionally). One every 5 minutes is enough resolution
      // for cadence delays measured in hours.
      if (req._sweepMode === "cron" || !req._sweepMode) {
        await enqueue(drizzle, {
          userId: null as any,
          type: "cadence_tick",
          payload: {},
        }).catch(() => {});
      }

      if (req._sweepMode === "cron" || !req._sweepMode) {
        const dueDeletions = await drizzle
          .select({ id: schema.deletionQueue.id, userId: schema.deletionQueue.userId })
          .from(schema.deletionQueue)
          .where(
            and(
              eq(schema.deletionQueue.status, "pending"),
              lte(schema.deletionQueue.scheduledPurgeAt, new Date()),
            ),
          )
          .limit(50);

        if (dueDeletions) {
          for (const row of dueDeletions) {
            await enqueue(drizzle, {
              userId: row.userId,
              type: "purge_deleted_account",
              payload: { user_id: row.userId, queue_id: String(row.id) },
              maxAttempts: 3,
            });
          }
        }
      }
      let processed = 0;
      for (let i = 0; i < 10; i++) {
        const job = await claim(drizzle);
        if (!job) break;
        try {
          await handleJob(job);
          await complete(drizzle, job.id);
          processed++;
        } catch (sweepErr: any) {
          await fail(drizzle, job, getErrorMessage(sweepErr));
        }
      }
      const mode = req._sweepMode || "cron";
      res.json({ processed, mode });
      if (processed > 0) {
        void auditLogger
          .logJobSweep("completed", {
            userId: req.user?.id,
            mode: mode as "cron" | "manual",
            processed,
            ip: req.ip,
          })
          .catch(() => {});
      }
    } catch (err) {
      log.error("POST /api/jobs/sweep failed", { error: getErrorMessage(err) });
      res.status(500).json({ error: "Sweep failed" });
    }
  },
);

export default router;
