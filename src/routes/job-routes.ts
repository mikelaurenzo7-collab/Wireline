import { Router } from "express";
import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { db, log, auditLogger } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { jobsRateLimit } from "../middleware/api-rate-limits";
import { getErrorMessage } from "../lib/server-utils";
import { getCallerRole } from "../middleware/require-role";
import { getQueueStats } from "../lib/job-queue";
import { handleJob } from "../lib/job-worker";

const router = Router();

// ──────────────────────────────────────────────────────────────────────────────
// JOB QUEUE ENDPOINTS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/jobs/stats — queue depths by status. Tenant-scoped: returns
 * the calling user's job counts only. Fleet-wide counters are not
 * exposed via the public API (only the in-process worker uses them).
 */
router.get("/stats", authenticateUser, jobsRateLimit, async (req: any, res: any) => {
  try {
    const stats = await getQueueStats(db, req.user.id);
    res.json(stats);
  } catch (err) {
    log.error("GET /api/jobs/stats failed", { error: getErrorMessage(err) });
    res.status(500).json({ error: "Failed to fetch job stats" });
  }
});

/**
 * Auth middleware for sweep — handles CRON_SECRET or Admin/Owner roles.
 */
const cronOrAdminAuth = (req: any, res: any, next: any) => {
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
      const role = await getCallerRole(db, req.user.id);
      if (role !== "owner" && role !== "admin") {
        void auditLogger
          .logJobSweep("denied", {
            userId: req.user.id,
            role,
            ip: req.ip,
          })
          .catch(() => {});
        return res.status(403).json({ error: "Forbidden: requires admin or owner role", code: "FORBIDDEN" });
      }
      req._sweepMode = "manual";
      next();
    } catch (e) {
      log.error("sweep auth failed", { error: getErrorMessage(e) });
      return res.status(403).json({ error: "Authorization check failed", code: "FORBIDDEN" });
    }
  });
};

/**
 * POST /api/jobs/sweep — triggers one poll cycle in serverless environments.
 */
router.post("/sweep", jobsRateLimit, cronOrAdminAuth, async (req: any, res: any) => {
  try {
    const { claimJob: claim, completeJob: complete, failJob: fail, enqueue } = await import("../lib/job-queue");

    // Trigger nightly GDPR purge (2:00 AM UTC)
    const now = new Date();
    if (now.getUTCHours() === 2 && now.getUTCMinutes() === 0 && (req._sweepMode === "cron" || !req._sweepMode)) {
       const { data: tenants } = await db.from("wireline_settings").select("user_id, retention_days");
       if (tenants) {
          for (const t of tenants) {
             await enqueue(db, {
                userId: t.user_id,
                type: "purge_old_data",
                payload: { user_id: t.user_id, retention_days: t.retention_days }
             });
          }
       }
    }
    let processed = 0;
    for (let i = 0; i < 10; i++) {
      const job = await claim(db);
      if (!job) break;
      try {
        await handleJob(job);
        await complete(db, job.id);
        processed++;
      } catch (sweepErr: unknown) {
        await fail(db, job, getErrorMessage(sweepErr));
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
});

export default router;
