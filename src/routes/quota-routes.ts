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
      const dimensions = [
        "claude_tokens_daily",
        "voice_minutes_daily",
        "concurrent_dials",
        "knowledge_rows",
        "intake_rpm",
      ] as const;
      const usageArr = await Promise.all(dimensions.map((d) => quotaTracker.getUsage(userId, d)));
      const usage: Record<string, number> = {};
      dimensions.forEach((d, i) => {
        usage[d] = usageArr[i];
      });
      res.json({ plan, limits: profile, usage });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("GET /api/quotas failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to fetch quota info");
    }
  },
);

/** GET /api/quotas/plans — public plan comparison table. */
router.get("/plans", quotaRateLimit, (_req: Request, res: Response) => {
  res.json({ plans: PLAN_DEFAULTS });
});

/**
 * PUT /api/quotas/override — set a per-tenant override.
 *
 * Authorization: platform-admin only. Quotas are the platform's vendor-cost
 * and abuse ceilings, so raising them is a platform operation — not a tenant
 * self-service action. Tenant RBAC can't gate this: every self-serve signup
 * resolves to the `owner` role (no team-membership row), so an "owner"
 * permission check would let any tenant lift its own caps. The accept/deny
 * audit trail lives in `wireline_audit_log`.
 */
router.put(
  "/override",
  authenticateUser,
  requirePlatformAdmin,
  quotaRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validation = validateOverride(req.body);
      if (!validation.ok) {
        throw AppError.badRequest((validation as { ok: false; error: string }).error);
      }
      const { dimension, enabled } = validation.value;
      const value = BigInt(validation.value.value);

      await drizzle
        .insert(schema.quotaLimits)
        .values({
          userId: req.user.id,
          dimension,
          value,
          enabled: enabled ?? true,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.quotaLimits.userId, schema.quotaLimits.dimension],
          set: {
            value,
            enabled: enabled ?? true,
            updatedAt: new Date(),
          },
        });

      quotaTracker.invalidate(req.user.id);
      // Audit the accepted override — SOC 2 CC8.1 change-management evidence.
      void auditLogger
        .logQuotaOverride("set", {
          userId: req.user.id,
          targetUserId: req.user.id,
          changes: { dimension, value, enabled },
          ip: req.ip,
        })
        .catch(() => {});
      res.json({ success: true, dimension, value, enabled });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("PUT /api/quotas/override failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to update quota override");
    }
  },
);

export default router;
