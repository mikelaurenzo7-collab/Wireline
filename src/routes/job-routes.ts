/* eslint-disable @typescript-eslint/no-explicit-any -- task and job payloads are stored as Postgres jsonb. */
import { Router, Response, NextFunction } from "express";
import { AppError } from "../lib/api-error";
import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { log, auditLogger, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, lte, gte } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { jobsRateLimit, jobsSweepRateLimit } from "../middleware/api-rate-limits";
import { getErrorMessage } from "../lib/server-utils";
import { getCallerRole } from "../middleware/require-role";
import { claimJobById, completeJob, enqueue, failJob, getQueueStats } from "../lib/job-queue";
import { handleJob } from "../lib/job-worker";
import { assertUrlSafeForServerFetch } from "../lib/webhook-validators";
import { apolloPlatformConfigured } from "../lib/apollo-service";
import type { AuthenticatedRequest } from "../types/auth";

const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAILY_CRON_WINDOW_MINUTES = 15;

function isWithinUtcWindow(now: Date, hour: number, startMinute: number): boolean {
  if (now.getUTCHours() !== hour) return false;
  const minute = now.getUTCMinutes();
  return minute >= startMinute && minute < startMinute + DAILY_CRON_WINDOW_MINUTES;
}

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
      if (err instanceof AppError) throw err;
      log.error("GET /api/jobs/stats failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to fetch job stats");
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
 * response surfaces `prospectingEnabled` so the UI can prompt the Account Holder
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

/**
 * POST /api/jobs/knowledge-crawl — enqueue async URL → knowledge extraction.
 * Client polls GET /api/jobs/:id and may POST /api/jobs/:id/run to process on serverless.
 */
router.post(
  "/knowledge-crawl",
  authenticateUser,
  jobsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { url, agentContext, maxEntries, maxPages } = req.body ?? {};
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
      const safeMaxEntries = Math.max(1, Math.min(50, Number(maxEntries) || 12));
      const safeMaxPages = Math.max(1, Math.min(20, Number(maxPages) || 5));

      const result = await enqueue(drizzle, {
        userId: req.user.id,
        type: "knowledge_from_url",
        payload: {
          userId: req.user.id,
          url,
          agentContext,
          maxEntries: safeMaxEntries,
          maxPages: safeMaxPages,
        },
        maxAttempts: 2,
      });
      if (!result.ok) {
        throw AppError.fromHttpStatus(500, String(result.error || "Failed to enqueue crawl job"));
      }

      res.json({ ok: true, jobId: result.jobId ?? null, status: "pending" });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("POST /api/jobs/knowledge-crawl failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to enqueue knowledge crawl");
    }
  },
);

router.get(
  // Constrained to UUID shape so literal paths registered later (notably
  // /sweep, which Vercel cron GETs) can't be swallowed as an :id match.
  "/:id([0-9a-fA-F-]{36})",
  authenticateUser,
  jobsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const jobId = String(req.params.id || "");
      if (!JOB_ID_RE.test(jobId)) {
        throw AppError.fromHttpStatus(400, "Invalid job id");
      }
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

/** Process one owned pending job (serverless kick — cron also drains the queue). */
router.post(
  "/:id([0-9a-fA-F-]{36})/run",
  authenticateUser,
  jobsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const jobId = String(req.params.id || "");
      if (!JOB_ID_RE.test(jobId)) {
        throw AppError.fromHttpStatus(400, "Invalid job id");
      }
      const [row] = await drizzle
        .select()
        .from(schema.jobs)
        .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.userId, req.user.id)))
        .limit(1);
      if (!row) throw AppError.fromHttpStatus(404, "Job not found");
      if (row.status === "done") {
        return res.json({ ok: true, status: row.status, result: row.result });
      }
      if (row.status === "running") {
        return res.json({ ok: true, status: "running" });
      }
      if (row.status !== "pending" && row.status !== "failed") {
        return res.json({ ok: true, status: row.status, error: row.error });
      }

      const claimed = await claimJobById(drizzle, jobId, req.user.id);
      if (!claimed) {
        return res.json({ ok: true, status: row.status });
      }

      try {
        await handleJob(claimed);
        await completeJob(drizzle, claimed.id);
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
        .select({
          status: schema.jobs.status,
          result: schema.jobs.result,
          error: schema.jobs.error,
        })
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
      if (e instanceof AppError) throw e;
      log.error("sweep auth failed", { error: getErrorMessage(e) });
      return res.status(403).json({ error: "Authorization check failed", code: "FORBIDDEN" });
    }
  });
};

// Vercel Cron sends GET; admin tooling that posts a body uses POST.
// Register the SAME handler under both verbs — gating happens inside
// cronOrAdminAuth (cron secret vs bearer JWT + role). Without the GET
// route the cron has been hitting Express's 404 every 5 minutes since
// audit3 shipped, meaning cadence_tick / orphan-supervisor janitor /
// due-deletion sweep never enqueue or process. The route's payload is
// already idempotent — duplicate verbs can't cause duplicate work.
const sweepHandler = async (req: SweepRequest, res: Response) => {
  try {
    const {
      claimJob: claim,
      completeJob: complete,
      failJob: fail,
      enqueue,
      recoverStaleJobs,
    } = await import("../lib/job-queue");

    const now = new Date();
    if (isWithinUtcWindow(now, 2, 0) && (req._sweepMode === "cron" || !req._sweepMode)) {
      const tenants = await drizzle
        .select({ userId: schema.settings.userId, retentionDays: schema.settings.retentionDays })
        .from(schema.settings);

      if (tenants) {
        // Idempotency: skip tenants that already have a pending or
        // recently-completed purge_old_data job in the last 23 hours.
        // Vercel may retry the same 2:00 UTC tick on transient failure;
        // without this guard each retry would duplicate the per-tenant
        // enqueue. 23h not 24h so the next day's sweep still fires even
        // if today's ran a hair late.
        const since = new Date(Date.now() - 23 * 60 * 60 * 1000);
        const recent = await drizzle
          .select({ userId: schema.jobs.userId })
          .from(schema.jobs)
          .where(and(eq(schema.jobs.type, "purge_old_data"), gte(schema.jobs.createdAt, since)));
        const alreadyQueued = new Set((recent || []).map((r) => r.userId));

        for (const t of tenants) {
          if (alreadyQueued.has(t.userId)) continue;
          await enqueue(drizzle, {
            userId: t.userId,
            type: "purge_old_data",
            payload: { user_id: t.userId, retention_days: t.retentionDays },
          });
        }
      }
    }

    // Sentinel user_id for tenant-agnostic system jobs. wireline_jobs.user_id
    // is NOT NULL (Codex review caught the prior null-insert bug), so global
    // jobs (cadence_tick, sweep_orphan_supervisor_subs) need an explicit
    // non-null owner. We use the all-zero UUID as a system sentinel — it
    // can never collide with a real tenant UUID, and the job handlers for
    // these types iterate every tenant's due rows anyway, so they don't
    // read job.user_id.
    const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

    // Always enqueue a single cadence tick per sweep — the tick is
    // cluster-safe (each worker pulls one batch up to limit and updates
    // rows transactionally). One every 5 minutes is enough resolution
    // for cadence delays measured in hours.
    if (req._sweepMode === "cron" || !req._sweepMode) {
      await enqueue(drizzle, {
        userId: SYSTEM_USER_ID,
        type: "cadence_tick",
        payload: {},
      }).catch((e: unknown) =>
        log.warn("cadence_tick enqueue failed", { error: getErrorMessage(e) }),
      );
    }

    // Daily at 03:15 UTC: janitor sweep for orphaned supervisor
    // subscriptions whose callId no longer matches any call_log row.
    // Defense in depth — the route already validates existence at
    // write time, but a separate cleanup catches anything inserted
    // before the validation landed (audit probe leftovers, dev
    // testing) and keeps the table tidy at scale.
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
        await enqueue(drizzle, {
          userId: SYSTEM_USER_ID,
          type: "sweep_orphan_supervisor_subs",
          payload: {},
        }).catch((e: unknown) =>
          log.warn("sweep_orphan_supervisor_subs enqueue failed", {
            error: getErrorMessage(e),
          }),
        );
      }
    }

    // Daily at 05:00 UTC: margin-at-risk founder alert
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
        await enqueue(drizzle, {
          userId: SYSTEM_USER_ID,
          type: "margin_at_risk_alert",
          payload: {},
        }).catch((e: unknown) =>
          log.warn("margin_at_risk_alert enqueue failed", { error: getErrorMessage(e) }),
        );
      }
    }

    // Daily at 04:00 UTC: demo-line canary — verifies all 8 showcase
    // phone lines are still wired correctly in Vapi (number exists,
    // assistant assigned and reachable). Fires owner alert on failure.
    if (isWithinUtcWindow(now, 4, 0) && (req._sweepMode === "cron" || !req._sweepMode)) {
      const since23h = new Date(Date.now() - 23 * 60 * 60 * 1000);
      const recentCanary = await drizzle
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.type, "demo_line_canary"), gte(schema.jobs.createdAt, since23h)))
        .limit(1);
      if (!recentCanary.length) {
        await enqueue(drizzle, {
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
    let recovered = 0;
    if (req._sweepMode === "cron" || !req._sweepMode) {
      recovered = await recoverStaleJobs(drizzle);
      if (recovered > 0) {
        log.warn("Recovered stuck jobs", { recovered });
      }
    }

    // Drain pending webhook deliveries whose next attempt is due. The
    // delivery rows carry the retry state machine; this tick is the only
    // thing that advances it.
    if (req._sweepMode === "cron" || !req._sweepMode) {
      const { processWebhookRetries } = await import("../lib/webhook-helpers");
      await processWebhookRetries();
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
    // Flip any trial accounts that have aged out of their 14-day
    // window. Independent of job-queue processing, fires on every
    // sweep tick. Idempotent — only updates rows where the flip is
    // actually needed.
    let trialsExpired = 0;
    if (req._sweepMode === "cron" || !req._sweepMode) {
      const { sweepExpiredTrials } = await import("../lib/trial-gate");
      trialsExpired = await sweepExpiredTrials();
    }

    // Enqueue trial-ending-soon emails for users within 3 days of expiry.
    // Idempotent: skip users who already received a warning job in the last 23h.
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
          if (alreadyWarned.has(row.userId)) continue;
          const daysLeft = Math.max(
            1,
            Math.ceil(((row.trialEndsAt?.getTime() ?? 0) - Date.now()) / (24 * 60 * 60 * 1000)),
          );
          await enqueue(drizzle, {
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
