import { AppError } from "../lib/api-error";
import { Router, Request, Response } from "express";
import { drizzle, log, auditLogger, quotaTracker } from "../lib/server-context";
import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import { requirePlatformAdmin } from "../middleware/platform-admin";
import { quotaRateLimit } from "../middleware/api-rate-limits";
import { getErrorMessage } from "../lib/server-utils";
import { PLAN_DEFAULTS, validateOverride } from "../lib/tenant-quotas";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const INTERNAL_AI_TOKEN_DIMENSION = "claude_tokens_daily" as const;
const PUBLIC_AI_TOKEN_DIMENSION = "ai_tokens_daily" as const;

function publicQuotaProfile(profile: Awaited<ReturnType<typeof quotaTracker.getProfile>>["profile"]) {
  const { claude_tokens_daily, ...rest } = profile;
  return { ai_tokens_daily: claude_tokens_daily, ...rest };
}

// ──────────────────────────────────────────────────────────────────────────────
// PER-TENANT QUOTA MANAGEMENT ENDPOINTS
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/quotas — current plan profile + live usage for the calling user. */
router.get(
  "/",
  authenticateUser,
  quotaRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id as string;
      const { plan, profile } = await quotaTracker.getProfile(userId);
      const internalDimensions = [
        INTERNAL_AI_TOKEN_DIMENSION,
        "voice_minutes_daily",
        "concurrent_dials",
        "knowledge_rows",
        "intake_rpm",
      ] as const;
      const usageValues = await Promise.all(
        internalDimensions.map((dimension) => quotaTracker.getUsage(userId, dimension)),
      );
      const usage = {
        [PUBLIC_AI_TOKEN_DIMENSION]: usageValues[0],
        voice_minutes_daily: usageValues[1],
        concurrent_dials: usageValues[2],
        knowledge_rows: usageValues[3],
        intake_rpm: usageValues[4],
      };
      res.json({ plan, limits: publicQuotaProfile(profile), usage });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("GET /api/quotas failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to fetch quota info");
    }
  },
);

/** GET /api/quotas/plans — public plan comparison table. */
router.get("/plans", quotaRateLimit, (_req: Request, res: Response) => {
  res.json({
    plans: Object.fromEntries(
      Object.entries(PLAN_DEFAULTS).map(([plan, profile]) => [plan, publicQuotaProfile(profile)]),
    ),
  });
});

/**
 * PUT /api/quotas/override — set a per-tenant override.
 *
 * Authorization: platform-admin only. Quotas are the platform's vendor-cost
 * and abuse ceilings, so raising them is a platform operation — not a tenant
 * self-service action. The public API accepts `ai_tokens_daily`; the existing
 * database key remains an internal compatibility detail until a dedicated data
 * migration can retire it safely.
 */
router.put(
  "/override",
  authenticateUser,
  requirePlatformAdmin,
  quotaRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const requestedDimension = req.body?.dimension;
      const validation = validateOverride({
        ...req.body,
        dimension:
          requestedDimension === PUBLIC_AI_TOKEN_DIMENSION
            ? INTERNAL_AI_TOKEN_DIMENSION
            : requestedDimension,
      });
      if (!validation.ok) {
        throw AppError.badRequest((validation as { ok: false; error: string }).error);
      }
      const { dimension, enabled } = validation.value;
      const numericValue = validation.value.value;
      const databaseValue = BigInt(numericValue);
      const publicDimension =
        dimension === INTERNAL_AI_TOKEN_DIMENSION ? PUBLIC_AI_TOKEN_DIMENSION : dimension;

      await drizzle
        .insert(schema.quotaLimits)
        .values({
          userId: req.user.id,
          dimension,
          value: databaseValue,
          enabled: enabled ?? true,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.quotaLimits.userId, schema.quotaLimits.dimension],
          set: {
            value: databaseValue,
            enabled: enabled ?? true,
            updatedAt: new Date(),
          },
        });

      quotaTracker.invalidate(req.user.id);
      void auditLogger
        .logQuotaOverride("set", {
          userId: req.user.id,
          targetUserId: req.user.id,
          changes: {
            dimension: publicDimension,
            internal_dimension: dimension,
            value: numericValue,
            enabled,
          },
          ip: req.ip,
        })
        .catch(() => {});
      res.json({ success: true, dimension: publicDimension, value: numericValue, enabled });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("PUT /api/quotas/override failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to update quota override");
    }
  },
);

export default router;
