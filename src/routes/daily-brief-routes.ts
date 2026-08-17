/* eslint-disable @typescript-eslint/no-explicit-any -- aggregate stats and dashboard rows draw from heterogeneous queries. */
import { Router, Response, type Request } from "express";
import { AppError, rethrowIfAppError } from "../lib/api-error";
import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { isOwnerEmail } from "../lib/auth-service";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { withAudit, persistRuntimeAuditRecords } from "../middleware/audit-middleware";
import { createAuditContext, runInAuditContext } from "../lib/ai-audit";
import { enforceSpendCap } from "../lib/spend-guards";
import { sendDailyBriefEmail } from "../lib/daily-brief";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

/**
 * send-now triggers a real LLM generation plus an email send — unlike
 * most authenticated endpoints, an unthrottled loop here has real,
 * unbounded AI-spend and email-volume cost. A legitimate user manually
 * resending/previewing their brief does this at most a handful of
 * times; 10/hour comfortably covers that while closing the endpoint off
 * as a cost-abuse vector.
 */
const sendNowRateLimit = createRateLimiter({
  bucket: "api:daily-brief-send-now",
  windowMs: 60 * 60 * 1000,
  max: 10,
  failClosedOnError: true,
});

// Settings: GET / PUT for the daily-brief schedule.
router.get(
  "/api/daily-brief/settings",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [settings] = await drizzle
        .select({
          dailyBriefEnabled: schema.settings.dailyBriefEnabled,
          dailyBriefSendAt: schema.settings.dailyBriefSendAt,
          dailyBriefRecipient: schema.settings.dailyBriefRecipient,
          dailyBriefLastSentAt: schema.settings.dailyBriefLastSentAt,
          dailyBriefLastError: schema.settings.dailyBriefLastError,
        })
        .from(schema.settings)
        .where(eq(schema.settings.userId, req.user.id))
        .limit(1);

      const accounts = await drizzle
        .select({ emailAddress: schema.emailAccounts.emailAddress })
        .from(schema.emailAccounts)
        .where(
          and(
            eq(schema.emailAccounts.userId, req.user.id),
            eq(schema.emailAccounts.provider, "google"),
          ),
        )
        .limit(1);

      res.json({
        settings: {
          enabled: !!settings?.dailyBriefEnabled,
          send_at: settings?.dailyBriefSendAt || "13:00",
          recipient: settings?.dailyBriefRecipient || req.user.email || null,
          last_sent_at: settings?.dailyBriefLastSentAt || null,
          last_error: settings?.dailyBriefLastError || null,
        },
        gmail_connected: !!accounts?.[0]?.emailAddress,
        gmail_address: accounts?.[0]?.emailAddress || null,
      });
    } catch (e: any) {
      log.error("Failed to load settings", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load settings");
    }
  },
);

router.put(
  "/api/daily-brief/settings",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const enabled = req.body?.enabled === true;
      const send_at = (req.body?.send_at || "13:00").toString();
      if (!/^\d{2}:\d{2}$/.test(send_at))
        throw AppError.fromHttpStatus(400, "send_at must be HH:MM (UTC).");
      const [hh, mm] = send_at.split(":").map(Number);
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59)
        throw AppError.fromHttpStatus(400, "send_at must be a valid HH:MM.");
      const recipient = (req.body?.recipient || "").toString().trim() || null;
      if (recipient && !/^\S+@\S+\.\S+$/.test(recipient))
        throw AppError.fromHttpStatus(400, "recipient must be a valid email.");

      await drizzle
        .insert(schema.settings)
        .values({
          id: req.user.id,
          userId: req.user.id,
          // Match signup (`startTrialForUser`): Free Builder tenants start
          // pending_activation. Never omit status — the DB default is a
          // footgun (`active`) and would bypass enforceLiveWorkActivation.
          subscriptionStatus: isOwnerEmail(req.user.email) ? "active" : "pending_activation",
          dailyBriefEnabled: enabled,
          dailyBriefSendAt: send_at,
          dailyBriefRecipient: recipient,
        })
        .onConflictDoUpdate({
          target: schema.settings.userId,
          set: {
            dailyBriefEnabled: enabled,
            dailyBriefSendAt: send_at,
            dailyBriefRecipient: recipient,
          },
        });

      res.json({ success: true });
    } catch (e: any) {
      rethrowIfAppError(e);
      log.error("Failed to save settings", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to save settings");
    }
  },
);

// Send-now — Account Holder-triggered preview email.
router.post(
  "/api/daily-brief/send-now",
  authenticateUser,
  sendNowRateLimit,
  // Composes the brief through a paid model. This is the same computeDailyBrief
  // call GET /api/insights/daily-brief makes, so it carries the same cap —
  // metering it without capping would leave a forced-compose bypass for a tenant
  // already over its hard limit.
  enforceSpendCap,
  withAudit("daily-brief"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await sendDailyBriefEmail(req.user.id, { force: true });
      res.json({ success: true, ...result });
    } catch (e: any) {
      const err = e as { code?: string; message?: string };
      if (err?.code === "AI_RUNTIME_OFFLINE" || err?.code === "CLAUDE_OFFLINE") {
        return res.status(503).json({
          error: err.message || "AI runtime required for the daily brief.",
          code: err.code,
        });
      }
      rethrowIfAppError(e);
      throw AppError.fromHttpStatus(500, "Send failed");
    }
  },
);

/**
 * Vercel cron: reconcile due daily briefs.
 *
 * Vercel Cron invokes configured paths with GET. We keep POST as a
 * backwards-compatible ops hook, but both methods share the same
 * CRON_SECRET authentication and reconciliation path.
 *
 * Each enabled tenant gets one durable DB lease before any model/email work.
 * The lease is deliberately separate from dailyBriefLastSentAt so a crashed
 * send cannot be reported as delivered. A lease older than 20 minutes is
 * reclaimable; Vercel's function ceiling is 10 minutes, so a live invocation
 * will never be stolen while still allowed to run.
 */
const DAILY_BRIEF_LEASE_MS = 20 * 60 * 1000;

function cronAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET || "";
  const authz = String(req.headers.authorization || "");
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  return (
    expected.length >= 16 &&
    token.length === expected.length &&
    cryptoTimingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(expected, "utf8"))
  );
}

function scheduledAtUtc(now: Date, sendAt: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(sendAt);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) return null;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0, 0),
  );
}

function providerHttpResponseStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("response" in error)) return null;
  const response = (error as { response?: { status?: unknown } }).response;
  const status = Number(response?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
}

async function runDailyBriefSchedule(req: Request, res: Response) {
  if (!cronAuthorized(req)) {
    throw AppError.fromHttpStatus(401, "Unauthorized");
  }

  try {
    const rows = await drizzle
      .select({
        userId: schema.settings.userId,
        sendAt: schema.settings.dailyBriefSendAt,
        lastSentAt: schema.settings.dailyBriefLastSentAt,
        lastAttemptAt: schema.settings.dailyBriefLastAttemptAt,
      })
      .from(schema.settings)
      .where(eq(schema.settings.dailyBriefEnabled, true));

    const now = new Date();
    const staleClaimBefore = new Date(now.getTime() - DAILY_BRIEF_LEASE_MS);
    let sent = 0;
    let notDue = 0;
    let alreadySent = 0;
    let alreadyAttempted = 0;
    let contended = 0;
    let skipped = 0;
    let deferred = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const uid = row.userId;
      if (!uid) continue;

      const scheduledAt = scheduledAtUtc(now, row.sendAt || "13:00");
      if (!scheduledAt) {
        failed++;
        if (errors.length < 5) errors.push(`${uid}: invalid daily brief send time`);
        continue;
      }
      if (now < scheduledAt) {
        notDue++;
        continue;
      }
      if (row.lastSentAt && row.lastSentAt >= scheduledAt) {
        alreadySent++;
        continue;
      }
      // lastAttemptAt is an at-most-once latch for this scheduled delivery.
      // A process crash around the non-idempotent Gmail send therefore misses
      // one brief rather than risking a duplicate message. Known pre-acceptance
      // failures explicitly release the latch below so they can retry.
      if (row.lastAttemptAt && row.lastAttemptAt >= scheduledAt) {
        alreadyAttempted++;
        continue;
      }

      // A claim failure for one tenant must not abort the sweep: every tenant
      // after them in the list would silently miss that day's brief, and the
      // cron would surface only an opaque 500 (seen in production on 2026-08-08
      // as "Cannot convert undefined or null to object"). Isolate the claim the
      // same way per-tenant send failures are isolated below.
      const claimAt = new Date();
      let claimed: { userId: string | null } | undefined;
      try {
        [claimed] = await drizzle
          .update(schema.settings)
          .set({
            dailyBriefDispatchClaimedAt: claimAt,
            dailyBriefLastAttemptAt: claimAt,
          })
          .where(
            and(
              eq(schema.settings.userId, uid),
              eq(schema.settings.dailyBriefEnabled, true),
              or(
                isNull(schema.settings.dailyBriefLastSentAt),
                lt(schema.settings.dailyBriefLastSentAt, scheduledAt),
              ),
              or(
                isNull(schema.settings.dailyBriefLastAttemptAt),
                lt(schema.settings.dailyBriefLastAttemptAt, scheduledAt),
              ),
              or(
                isNull(schema.settings.dailyBriefDispatchClaimedAt),
                lt(schema.settings.dailyBriefDispatchClaimedAt, staleClaimBefore),
              ),
            ),
          )
          .returning({ userId: schema.settings.userId });
      } catch (claimError: unknown) {
        const msg = getErrorMessage(claimError);
        failed++;
        if (errors.length < 5) errors.push(`${uid}: claim failed: ${msg}`);
        log.error("Daily brief cron: claim update failed", { userId: uid, error: msg });
        continue;
      }

      if (!claimed?.userId) {
        contended++;
        continue;
      }

      const auditContext = createAuditContext();
      let providerSendAttempted = false;
      let providerSendAccepted = false;
      try {
        // Keep the context directly instead of withAuditCapture: if model work
        // succeeds but Gmail fails, the paid model records still need flushing.
        await runInAuditContext(auditContext, async () => {
          const result = await sendDailyBriefEmail(uid, {
            force: false,
            onProviderSendAttempt: () => {
              providerSendAttempted = true;
            },
          });
          providerSendAccepted = true;
          return result;
        });

        await drizzle
          .update(schema.settings)
          .set({
            dailyBriefLastSentAt: new Date(),
            dailyBriefLastError: null,
            dailyBriefDispatchClaimedAt: null,
          })
          .where(
            and(
              eq(schema.settings.userId, uid),
              eq(schema.settings.dailyBriefDispatchClaimedAt, claimAt),
            ),
          );
        sent++;
      } catch (e: unknown) {
        const msg = getErrorMessage(e);
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code?: unknown }).code || "")
            : "";
        const providerResponseStatus = providerHttpResponseStatus(e);
        // Gmail explicitly recommends retrying failed HTTP responses (including
        // quota/rate-limit and 5xx failures). Only a successful send or a
        // transport failure with no HTTP response keeps the at-most-once latch.
        const preserveAttemptLatch =
          providerSendAccepted || (providerSendAttempted && providerResponseStatus === null);
        const configurationSkip =
          msg.includes("No recipient") || msg.includes("No connected Gmail");
        const transientAi =
          code === "AI_RUNTIME_OFFLINE" ||
          code === "CLAUDE_OFFLINE" ||
          msg.includes("AI runtime required") ||
          msg.includes("Claude required");

        // Pre-send failures and explicit Gmail HTTP failures are retryable:
        // release the lease and restore the previous attempt marker. Preserve
        // lastAttemptAt only after confirmed acceptance or when the request left
        // this process but no provider response came back.
        await drizzle
          .update(schema.settings)
          .set({
            dailyBriefDispatchClaimedAt: null,
            ...(preserveAttemptLatch ? {} : { dailyBriefLastAttemptAt: row.lastAttemptAt || null }),
            dailyBriefLastError: msg.slice(0, 1000),
          })
          .where(
            and(
              eq(schema.settings.userId, uid),
              eq(schema.settings.dailyBriefDispatchClaimedAt, claimAt),
            ),
          )
          .catch((releaseError: unknown) =>
            log.error("daily brief cron lease release failed", {
              userId: uid,
              error: getErrorMessage(releaseError),
            }),
          );

        if (preserveAttemptLatch) {
          failed++;
          if (errors.length < 5) {
            errors.push(`${uid}: delivery attempt may have been accepted but finalization failed`);
          }
        } else if (configurationSkip) skipped++;
        else if (transientAi) deferred++;
        else {
          failed++;
          if (errors.length < 5) errors.push(`${uid}: ${msg}`);
        }
        log.warn("Daily brief cron: user skipped or failed", {
          userId: uid,
          error: msg,
          code,
          providerSendAttempted,
          providerSendAccepted,
          providerResponseStatus,
          preserveAttemptLatch,
        });
      } finally {
        if (auditContext.records.length) {
          await persistRuntimeAuditRecords({
            userId: uid,
            action: "daily-brief.cron",
            records: auditContext.records,
            requestMeta: { source: "daily_brief_schedule" },
          }).catch((persistError: unknown) =>
            log.error("daily brief cron audit persist failed", {
              userId: uid,
              error: getErrorMessage(persistError),
            }),
          );
        }
      }
    }

    res.json({
      ok: true,
      enabled_users: rows.length,
      sent,
      not_due: notDue,
      already_sent: alreadySent,
      already_attempted: alreadyAttempted,
      contended,
      skipped,
      deferred,
      failed,
      errors,
    });
  } catch (e: unknown) {
    log.error("Daily brief schedule failed", { error: getErrorMessage(e) });
    throw AppError.fromHttpStatus(500, "Schedule run failed");
  }
}

router.get("/api/daily-brief/schedule", runDailyBriefSchedule);
router.post("/api/daily-brief/schedule", runDailyBriefSchedule);

export default router;
