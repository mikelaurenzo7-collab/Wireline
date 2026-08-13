import { Router, type NextFunction, type Response } from "express";

import { SettingsSchema } from "../../contracts/api-types";
import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { formatZodError } from "../lib/api-validation-base";
import { isOwnerEmail } from "../lib/auth-service";
import { runCompanyIdentityMutation } from "../lib/company-identity-mutation";
import { log } from "../lib/server-context";
import { getErrorMessage, mapObjectToCamel } from "../lib/server-utils";
import { authenticateUser } from "../middleware/auth";
import { isPlatformAdmin } from "../middleware/platform-admin";
import { assertTelecomIdentityOwned, pickWritableSettings } from "./settings-routes";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const IDENTITY_SETTING_KEYS = [
  "business_name",
  "brand_name",
  "brand_logo_url",
  "businessName",
  "brandName",
  "brandLogoUrl",
] as const;

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function identityText(value: unknown, field: string, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw AppError.fromHttpStatus(400, `${field} must be text.`);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw AppError.fromHttpStatus(400, `${field} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function identityHttpsUrl(value: unknown, field: string): string | null | undefined {
  const normalized = identityText(value, field, 500);
  if (!normalized) return normalized;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new Error("unsafe identity URL");
    }
    return parsed.toString();
  } catch {
    throw AppError.fromHttpStatus(
      400,
      `${field} must be a valid HTTPS URL without embedded credentials.`,
    );
  }
}

function aliasedValue(body: Record<string, unknown>, snakeKey: string, camelKey: string): unknown {
  return hasOwn(body, snakeKey) ? body[snakeKey] : body[camelKey];
}

/**
 * Branding fields remain available through the generic settings API for older
 * clients. Commit those fields under the same Company Identity lock, reconcile
 * review state, then remove them from the downstream legacy write so they
 * cannot race a review request after the lock is released.
 *
 * This is path middleware rather than a duplicate POST route. The canonical
 * POST /api/settings entry remains owned and inventoried by settings-routes.ts.
 */
router.use(
  "/api/settings",
  authenticateUser,
  async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (req.method !== "POST") {
      next();
      return;
    }

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const hasIdentityField = IDENTITY_SETTING_KEYS.some((key) => hasOwn(body, key));
    if (!hasIdentityField) {
      next();
      return;
    }

    try {
      const identityUpdate: {
        businessName?: string | null;
        brandName?: string | null;
        brandLogoUrl?: string | null;
      } = {};
      if (hasOwn(body, "business_name") || hasOwn(body, "businessName")) {
        identityUpdate.businessName = identityText(
          aliasedValue(body, "business_name", "businessName"),
          "Business name",
          120,
        );
      }
      if (hasOwn(body, "brand_name") || hasOwn(body, "brandName")) {
        identityUpdate.brandName = identityText(
          aliasedValue(body, "brand_name", "brandName"),
          "Brand name",
          80,
        );
      }
      if (hasOwn(body, "brand_logo_url") || hasOwn(body, "brandLogoUrl")) {
        identityUpdate.brandLogoUrl = identityHttpsUrl(
          aliasedValue(body, "brand_logo_url", "brandLogoUrl"),
          "Brand logo URL",
        );
      }

      // Preflight the exact validation the downstream settings writer will
      // run on the identity-stripped body. Without this, the branding commit
      // below landed durably and THEN a schema 400 or telecom-ownership 403
      // told the client "settings not saved" — a silent half-write. The
      // request must be provably acceptable end-to-end before any commit.
      const downstreamPreview: Record<string, unknown> = { ...body };
      for (const key of IDENTITY_SETTING_KEYS) delete downstreamPreview[key];
      const parsed = SettingsSchema.partial().safeParse(downstreamPreview);
      if (!parsed.success) {
        const errors = formatZodError(parsed.error);
        _res.status(400).json({
          error: errors[0]?.message || "Invalid request body",
          code: "VALIDATION_ERROR",
          details: errors,
        });
        return;
      }
      const isAccountHolder = await isPlatformAdmin(req.user);
      const downstreamUpdate = pickWritableSettings(
        mapObjectToCamel(parsed.data) as Record<string, unknown>,
        isAccountHolder,
      );
      await assertTelecomIdentityOwned(req.user.id, downstreamUpdate);

      await runCompanyIdentityMutation(req.user.id, "branding_changed", async (tx) => {
        await tx
          .insert(schema.settings)
          .values({
            id: req.user.id,
            userId: req.user.id,
            // Match signup (`startTrialForUser`): Free Builder tenants start
            // pending_activation. Never bootstrap a silent `trialing` row —
            // that status bypasses enforceLiveWorkActivation with no expiry.
            subscriptionStatus: isOwnerEmail(req.user.email) ? "active" : "pending_activation",
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
      if (error instanceof AppError) {
        next(error);
        return;
      }
      log.error("company identity branding guard failed", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      next(error);
    }
  },
);

export default router;
