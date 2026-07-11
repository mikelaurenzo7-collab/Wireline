import { Router, type NextFunction, type Response } from "express";

import { SettingsSchema } from "../../contracts/api-types";
import * as schema from "../db/schema";
import { isOwnerEmail } from "../lib/auth-service";
import { runCompanyIdentityMutation } from "../lib/company-identity-mutation";
import { log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const IDENTITY_SETTING_KEYS = ["business_name", "brand_name", "brand_logo_url"] as const;

/**
 * Branding fields remain available through the generic settings API for older
 * clients. Commit those fields under the same Company Identity lock, reconcile
 * review state, then remove them from the downstream legacy write so they
 * cannot race a review request after the lock is released.
 */
router.post(
  "/api/settings",
  authenticateUser,
  async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const body = req.body ?? {};
    const hasIdentityField = IDENTITY_SETTING_KEYS.some((key) =>
      Object.prototype.hasOwnProperty.call(body, key),
    );
    if (!hasIdentityField) {
      next();
      return;
    }

    const parsed = SettingsSchema.partial().safeParse(body);
    if (!parsed.success) {
      // The canonical settings route owns the public validation response.
      next();
      return;
    }

    const identityUpdate: {
      businessName?: string | null;
      brandName?: string | null;
      brandLogoUrl?: string | null;
    } = {};
    if (Object.prototype.hasOwnProperty.call(body, "business_name")) {
      identityUpdate.businessName = parsed.data.business_name ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "brand_name")) {
      identityUpdate.brandName = parsed.data.brand_name ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "brand_logo_url")) {
      identityUpdate.brandLogoUrl = parsed.data.brand_logo_url ?? null;
    }

    try {
      await runCompanyIdentityMutation(req.user.id, "branding_changed", async (tx) => {
        await tx
          .insert(schema.settings)
          .values({
            id: req.user.id,
            userId: req.user.id,
            subscriptionStatus: isOwnerEmail(req.user.email) ? "active" : "trialing",
            ...identityUpdate,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.settings.userId,
            set: { ...identityUpdate, updatedAt: new Date() },
          });
      });

      const downstreamBody = { ...body };
      for (const key of IDENTITY_SETTING_KEYS) delete downstreamBody[key];
      req.body = downstreamBody;
      next();
    } catch (error) {
      log.error("company identity branding guard failed", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      next(error);
    }
  },
);

export default router;
