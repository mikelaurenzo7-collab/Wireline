import { Router, Response, NextFunction } from "express";
import { AppError } from "../lib/api-error";
import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { log, auditLogger, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, lte, gte, or, inArray, sql } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { jobsRateLimit, jobsSweepRateLimit } from "../middleware/api-rate-limits";
import { getErrorMessage } from "../lib/server-utils";
import { getCallerRole } from "../middleware/require-role";
import {
  claimJobById,
  completeClaimedJob,
  enqueue,
  failJob,
  getQueueStats,
} from "../lib/job-queue";
import { handleJob } from "../lib/job-worker";
import { assertUrlSafeForServerFetch } from "../lib/webhook-validators";
import { apolloPlatformConfigured } from "../lib/apollo-service";
import { KnowledgeIngestionUnavailableError } from "../lib/ai-brains";
import type { AuthenticatedRequest } from "../types/auth";

const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAILY_CRON_WINDOW_MINUTES = 15;

function isWithinUtcWindow(now: Date, hour: number, startMinute: number): boolean {
  if (now.getUTCHours() !== hour) return false;
  const minute = now.getUTCMinutes();
  return minute >= startMinute && minute < startMinute + DAILY_CRON_WINDOW_MINUTES;
}

interface SweepRequest extends AuthenticatedRequest {
  _sweepMode?: "cron" | "manual";
}

const router = Router();

router.get(
  "/stats",
  authenticateUser,
  jobsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await getQueueStats(drizzle, req.user.id);
      res.json(stats);
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("GET /api/jobs/stats failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to fetch job stats");
    }
  },
);

router.post(
  "/prospect",
  authenticateUser,
  jobsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [settings] = await drizzle
        .select({ prospectingEnabled: schema.settings.prospectingEnabled })
        .from(schema.settings)
        .where(eq(schema.settings.userId, req.user.id))
        .limit(1);

      const result = await enqueue(drizzle, {
        userId: req.user.id,
        type: "autonomous_prospecting",
        payload: { userId: req.user.id },
      });
      if (!result.ok) {
        throw AppError.fromHttpStatus(500, String(result.error || "Failed to enqueue job"));
      }

      res.json({
        ok: true,
        jobId: result.jobId ?? null,
        prospectingEnabled: !!settings?.prospectingEnabled,
        apolloReady: apolloPlatformConfigured(),
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("POST /api/jobs/prospect failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to enqueue prospecting job");
    }
  },
);

router.post(
  "/knowledge-crawl",
  authenticateUser,
  jobsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { url, agentContext } = req.body ?? {};
      if (!url || typeof url !== "string" || url.length > 2048) {
        throw AppError.fromHttpStatus(400, "url required (max 2048 chars).");
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        throw AppError.fromHttpStatus(400, "url is not a valid URL.");
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw AppError.fromHttpStatus(400, "url must use http:// or https://");
      }
      const ssrfErr = await assertUrlSafeForServerFetch(url);
      if (ssrfErr) {
        return res.status(400).json({ code: "BAD_REQUEST", error: ssrfErr });
      }
      if (
        agentContext != null &&
        (typeof agentContext !== "string" || agentContext.length > 2000)
      ) {
        throw AppError.fromHttpStatus(400, "agentContext must be a string ≤ 2000 characters.");
      }

      throw AppError.fromHttpStatus(503, new KnowledgeIngestionUnavailableError().message);
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("POST /api/jobs/knowledge-crawl failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to enqueue knowledge crawl");
    }
  },
);

router.get(
  "/:id([0-9a-fA-F-]{36})",
  authenticateUser,
  jobsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const jobId = String(req.params.id || "");
      if (!JOB_ID_RE.test(jobId)) throw AppError.fromHttpStatus(400, "Invalid job id");
      const [row] = await drizzle
        .select({
          id: schema.jobs.id,
          type: schema.jobs.type,
          status: schema.jobs.status,
          error: schema.jobs.error,
          result: schema.jobs.result,
          createdAt: schema.jobs.createdAt,
          finishedAt: schema.jobs.finishedAt,
        })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.userId, req.user.id)))
        .limit(1);
      if (!row) throw AppError.fromHttpStatus(404, "Job not found");
      res.json({ job: row });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("GET /api/jobs/:id failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to fetch job");
    }
  },
);

router.post(
  "/:id([0-9a-fA-F-]{36})/run",
  authenticateUser,
  jobsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const jobId = String(req.params.id || "");
      if (!JOB_ID_RE.test(jobId)) throw AppError.fromHttpStatus(400, "Invalid job id");
      const [row] = await drizzle
        .select()
        .from(schema.jobs)
        .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.userId, req.user.id)))
        .limit(1);
      if (!row) throw AppError.fromHttpStatus(404, "Job not found");
      if (row.status === "done") {
        return res.json({ ok: true, status: row.status, result: row.result });
      }
      if (row.status === "running") return res.json({ ok: true, status: "running" });
      if (row.status !== "pending" && row.status !== "failed") {
        return res.json({ ok: true, status: row.status, error: row.error });
      }

      const claimed = await claimJobById(drizzle, jobId, req.user.id);
      if (!claimed) return res.json({ ok: true, status: row.status });

      try {
        await handleJob(claimed);
        await completeClaimedJob(drizzle, claimed);
      } catch (runErr) {
        if (runErr instanceof AppError) throw runErr;
        await failJob(drizzle, claimed, getErrorMessage(runErr));
        const [failed] = await drizzle
          .select({ status: schema.jobs.status, error: schema.jobs.error })
          .from(schema.jobs)
          .where(eq(schema.jobs.id, jobId))
          .limit(1);
        return res.status(500).json({
          code: "INTERNAL_ERROR",
          ok: false,
          status: failed?.status ?? "failed",
          error: failed?.error ?? getErrorMessage(runErr),
        });
      }

      const [done] = await drizzle
        .select({ status: schema.jobs.status, result: schema.jobs.result, error: schema.jobs.error })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, jobId))
        .limit(1);
      res.json({ ok: true, status: done?.status, result: done?.result, error: done?.error });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("POST /api/jobs/:id/run failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to run job");
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
      const role = await getCallerRole(drizzle, req.tenantId || req.user.id, req.user.id);
      if (role !== "owner" && role !== "admin") {
        void auditLogger
          .logJobSweep("denied", { userId: req.user.id, role, ip: req.ip })
          .catch(() => {});
        return res
          .status(403)
          .json({ error: "Forbidden: requires admin or owner role", code: "FORBIDDEN" });
      }
      req._sweepMode = "manual";
      next();
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("sweep auth failed", { error: getErrorMessage(e) });
      return res.status(403).json({ error: "Authorization check failed", code: "FORBIDDEN" });
    }
  });
};

const sweepHandler = async (req: SweepRequest, res: Response) => {
  try {
    const {
      claimJob: claim,
      completeClaimedJob: complete,
      failJob: fail,
      enqueue: enqueueJob,
      recoverStaleJobs,
    } = await import("../lib/job-queue");

    const now = new Date();
    if (isWithinUtcWindow(now, 2, 0) && (req._sweepMode === "cron" || !req._sweepMode)) {
      const tenants = await drizzle
        .select({ userId: schema.settings.userId, retentionDays: schema.settings.retentionDays })
        .from(schema.settings);
      if (tenants) {
        const since = new Date(Date.now() - 23 * 60 * 60 * 1000);
        const recent = await drizzle
          .select({ userId: schema.jobs.userId })
          .from(schema.jobs)
          .where(and(eq(schema.jobs.type, "purge_old_data"), gte(schema.jobs.createdAt, since)));
        const alreadyQueued = new Set((recent || []).map((r) => r.userId));
        for (const t of tenants) {
          if (!t.userId || alreadyQueued.has(t.userId)) continue;
          await enqueueJob(drizzle, {
            userId: t.userId,
            type: "purge_old_data",
            payload: { user_id: t.userId, retention_days: t.retentionDays },
          });
        }
      }
    }

    const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

    if (req._sweepMode === "cron" || !req._sweepMode) {
      await enqueueJob(drizzle, {
        userId: SYSTEM_USER_ID,
        type: "cadence_tick",
        payload: {},
      }).catch((e: unknown) =>
        log.warn("cadence_tick enqueue failed", { error: getErrorMessage(e) }),
      );
      await enqueueJob(drizzle, {
        userId: SYSTEM_USER_ID,
        type: "callback_tick",
        payload: {},
      }).catch((e: unknown) =>
        log.warn("callback_tick enqueue failed", { error: getErrorMessage(e) }),
      );
    }

    if (isWithinUtcWindow(now, 3, 15) && (req._sweepMode === "cron" || !req._sweepMode)) {
      const since23h = new Date(Date.now() - 23 * 60 * 60 * 1000);
      const recentOrphanSweep = await drizzle
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(
          and(
            eq(schema.jobs.type, "sweep_orphan_supervisor_subs"),
            gte(schema.jobs.createdAt, since23h),
          ),
        )
        .limit(1);
      if (!recentOrphanSweep.length) {
        await enqueueJob(drizzle, {
          userId: SYSTEM_USER_ID,
          type: "sweep_orphan_supervisor_subs",
          payload: {},
        }).catch((e: unknown) =>
          log.warn("sweep_orphan_supervisor_subs enqueue failed", {
            error: getErrorMessage(e),
          }),
        );
      }
      await drizzle
        .execute(
          sql`DELETE FROM wireline_jobs
              WHERE user_id = ${SYSTEM_USER_ID}
                AND status IN ('done', 'dead')
                AND created_at < now() - interval '7 days'`,
        )
        .catch((e: unknown) =>
          log.warn("sentinel job cleanup failed", { error: getErrorMessage(e) }),
        );
    }

    if (isWithinUtcWindow(now, 5, 0) && (req._sweepMode === "cron" || !req._sweepMode)) {
      const since23h = new Date(Date.now() - 23 * 60 * 60 * 1000);
      const recentMargin = await drizzle
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(
          and(eq(schema.jobs.type, "margin_at_risk_alert"), gte(schema.jobs.createdAt, since23h)),
        )
        .limit(1);
      if (!recentMargin.length) {
        await enqueueJob(drizzle, {
          userId: SYSTEM_USER_ID,
          type: "margin_at_risk_alert",
          payload: {},
        }).catch((e: unknown) =>
          log.warn("margin_at_risk_alert enqueue failed", { error: getErrorMessage(e) }),
        );
      }
    }

    if (isWithinUtcWindow(now, 4, 0) && (req._sweepMode === "cron" || !req._sweepMode)) {
      const since23h = new Date(Date.now() - 23 * 60 * 60 * 1000);
      const recentCanary = await drizzle
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.type, "demo_line_canary"), gte(schema.jobs.createdAt, since23h)))
        .limit(1);
      if (!recentCanary.length) {
        await enqueueJob(drizzle, {
          userId: SYSTEM_USER_ID,
          type: "demo_line_canary",
          payload: {},
        }).catch((e: unknown) =>
          log.warn("demo_line_canary enqueue failed", { error: getErrorMessage(e) }),
        );
      }
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
        const purgeDedupSince = new Date(Date.now() - 23 * 60 * 60 * 1000);
        for (const row of dueDeletions) {
          const [existingPurge] = await drizzle
            .select({ id: schema.jobs.id })
            .from(schema.jobs)
            .where(
              and(
                eq(schema.jobs.type, "purge_deleted_account"),
                eq(schema.jobs.userId, row.userId),
                or(
                  inArray(schema.jobs.status, ["pending", "running"]),
                  gte(schema.jobs.createdAt, purgeDedupSince),
                ),
              ),
            )
            .limit(1);
          if (existingPurge) continue;
          await enqueueJob(drizzle, {
            userId: row.userId,
            type: "purge_deleted_account",
            payload: { user_id: row.userId, queue_id: String(row.id) },
            maxAttempts: 3,
          });
        }
      }
    }

    let recovered = 0;
    if (req._sweepMode === "cron" || !req._sweepMode) {
      try {
        recovered = await recoverStaleJobs(drizzle);
        if (recovered > 0) log.warn("Recovered stuck jobs", { recovered });
      } catch (recoverErr: unknown) {
        log.error("Stale job recovery failed; continuing sweep", {
          error: getErrorMessage(recoverErr),
        });
      }
    }

    if (req._sweepMode === "cron" || !req._sweepMode) {
      const { processWebhookRetries } = await import("../lib/webhook-helpers");
      await processWebhookRetries();
    }

    // JavaScript Promise.race cannot cancel the losing handler. The previous
    // 30-second race rescheduled a job while its original side effects kept
    // running. External clients already enforce their own timeouts; the sweep
    // now awaits one claimed handler and fences its outcome to that attempt.
    const SWEEP_BUDGET_MS = 55_000;
    const sweepStart = Date.now();
    let processed = 0;
    for (let i = 0; i < 10; i++) {
      if (Date.now() - sweepStart > SWEEP_BUDGET_MS) break;
      const job = await claim(drizzle);
      if (!job) break;
      try {
        await handleJob(job);
        await complete(drizzle, job);
        processed++;
      } catch (sweepErr: unknown) {
        await fail(drizzle, job, getErrorMessage(sweepErr));
      }
    }

    let trialsExpired = 0;
    if (req._sweepMode === "cron" || !req._sweepMode) {
      const { sweepExpiredTrials } = await import("../lib/trial-gate");
      trialsExpired = await sweepExpiredTrials();
    }

    if (req._sweepMode === "cron" || !req._sweepMode) {
      const now3d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const trialsSoon = await drizzle
        .select({ userId: schema.settings.userId, trialEndsAt: schema.settings.trialEndsAt })
        .from(schema.settings)
        .where(
          and(
            eq(schema.settings.subscriptionStatus, "trialing"),
            lte(schema.settings.trialEndsAt, now3d),
            gte(schema.settings.trialEndsAt, new Date()),
          ),
        );
      if (trialsSoon.length > 0) {
        const since23h = new Date(Date.now() - 23 * 60 * 60 * 1000);
        const recentWarnings = await drizzle
          .select({ userId: schema.jobs.userId })
          .from(schema.jobs)
          .where(
            and(
              eq(schema.jobs.type, "trial_ending_soon_email"),
              gte(schema.jobs.createdAt, since23h),
            ),
          );
        const alreadyWarned = new Set(recentWarnings.map((r) => r.userId));
        for (const row of trialsSoon) {
          if (!row.userId || alreadyWarned.has(row.userId)) continue;
          const daysLeft = Math.max(
            1,
            Math.ceil(((row.trialEndsAt?.getTime() ?? 0) - Date.now()) / (24 * 60 * 60 * 1000)),
          );
          await enqueueJob(drizzle, {
            userId: row.userId,
            type: "trial_ending_soon_email",
            payload: { userId: row.userId, daysLeft },
          }).catch((e: unknown) =>
            log.warn("trial_ending_soon_email enqueue failed", {
              userId: row.userId,
              error: getErrorMessage(e),
            }),
          );
        }
      }
    }

    const mode = req._sweepMode || "cron";
    res.json({ processed, recovered, mode, trials_expired: trialsExpired });
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
    if (err instanceof AppError) throw err;
    log.error("/api/jobs/sweep failed", { error: getErrorMessage(err) });
    throw AppError.fromHttpStatus(500, "Sweep failed");
  }
};

router.get("/sweep", cronOrAdminAuth, jobsSweepRateLimit, sweepHandler);
router.post("/sweep", cronOrAdminAuth, jobsSweepRateLimit, sweepHandler);

export default router;
